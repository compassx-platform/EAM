"""
Centralized condition evaluator.

Single source of truth for ALL condition logic in the system. Consumers
(workflow transitions, branches, auto_transitions, form visibility/read-only,
future modules) reference conditions by id and evaluate here — change logic
in one place, it changes everywhere (live-update semantics).

A condition is a rule-tree AST:

    {"logic": "AND"|"OR", "negate": false, "rules": [
        {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"},
        {"type": "role", "role": "Supervisor"},
        {"group": {"logic": "OR", "negate": false, "rules": [...]}}
    ]}

Atom types:
  - attribute   : field vs value (eq/ne/lt/le/gt/ge/in/not_in/contains/
                  starts_with/ends_with/is_empty/is_not_empty; numeric-aware)
  - role        : actor holds a role (role_check analogue)
  - field_not_empty : field present and non-empty
  - date        : date field vs another date or 'now'
  - related     : linked entity's status or field
  - expression  : whitelisted arithmetic expression vs threshold

Context:
  - custom_fields : entity field values + pseudo-field '_workflow_status'
  - actor_id      : global id or email of acting user (or 'system:...')
  - actor_type    : 'human' | 'system'
  - actor_roles   : optional explicit role list (else resolved from AppUser)

Rule evaluation is:
  AND -> all children pass; OR -> first... any child passes.
  negate -> result of the group is inverted.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.models.conditions import ConditionDefinition
from backend.models.entities import get_entity_models
from backend.services.expression import evaluate_arithmetic, ExpressionError
from backend.services.actor import resolve_actor_roles

# Comparison operators understood by the generic attribute atom.
_ATTR_OPS = {"eq", "ne", "lt", "le", "gt", "ge", "in", "not_in", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"}
_NUMERIC_OPS = {"lt", "le", "gt", "ge"}
_STRING_OPS = {"eq", "ne", "contains", "starts_with", "ends_with", "in", "not_in"}


class ConditionEvaluationResult(BaseModel):
    condition_id: str
    label: str
    passed: bool
    reason: str
    failure_policy: str  # 'block' | 'allow'
    effective_pass: bool  # passed OR (not passed and failure_policy == 'allow')


def _as_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "yes", "1"):
            return True
        if low in ("false", "no", "0"):
            return False
    return None


def _as_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _apply_string_op(op: str, field_value: Any, expected: Any, case_sensitive: bool = False) -> bool:
    left = field_value if isinstance(field_value, str) else ("" if field_value is None else str(field_value))
    right = expected if isinstance(expected, str) else ("" if expected is None else str(expected))
    if op in ("eq", "ne"):
        a, b = (left, right)
        if not case_sensitive:
            a, b = a.strip().lower(), b.strip().lower()
        return (a == b) if op == "eq" else (a != b)
    if op == "contains":
        needle = right.lower() if not case_sensitive else right
        hay = left.lower() if not case_sensitive else left
        return needle in hay
    if op == "starts_with":
        return left.lower().startswith(right.lower()) if not case_sensitive else left.startswith(right)
    if op == "ends_with":
        return left.lower().endswith(right.lower()) if not case_sensitive else left.endswith(right)
    if op == "in":
        opts = expected if isinstance(expected, list) else [expected]
        pool = [str(o).strip().lower() if not case_sensitive else str(o) for o in opts]
        return left.strip().lower() if not case_sensitive else left.strip() in pool
    if op == "not_in":
        opts = expected if isinstance(expected, list) else [expected]
        pool = [str(o).strip().lower() if not case_sensitive else str(o) for o in opts]
        return (left.strip().lower() if not case_sensitive else left.strip()) not in pool
    return False


def _apply_numeric_op(op: str, left: float, right: float) -> bool:
    if op == "lt":
        return left < right
    if op == "le":
        return left <= right
    if op == "gt":
        return left > right
    if op == "ge":
        return left >= right
    if op == "eq":
        return left == right
    if op == "ne":
        return left != right
    return False


def _resolve_actor_roles(db: Session, actor_id: str, actor_roles: Optional[List[str]]) -> List[str]:
    return resolve_actor_roles(db, actor_id, actor_roles)


def evaluate_atom(atom: Dict[str, Any], db: Session, custom_fields: Dict[str, Any], actor_id: str, actor_type: str, actor_roles: Optional[List[str]] = None) -> Tuple[bool, str]:
    """Evaluates a single atom (leaf rule) against the context. Returns (passed, reason)."""
    atom_type = atom.get("type", "attribute")

    if atom_type == "attribute":
        field = atom.get("field")
        op = str(atom.get("operator", "eq")).lower()
        expected = atom.get("value")
        case_sensitive = bool(atom.get("case_sensitive", False))
        if not field:
            return False, "No 'field' configured for attribute rule"
        if op not in _ATTR_OPS:
            return False, f"Unsupported operator '{op}'. Allowed: {sorted(_ATTR_OPS)}"
        val = custom_fields.get(field)
        if op in ("is_empty", "is_not_empty"):
            empty = val is None or (isinstance(val, str) and not val.strip()) or val == [] or val == {}
            passed = empty if op == "is_empty" else not empty
            return passed, f"'{field}' is {'' if empty else 'not '}empty"
        if val is None or (isinstance(val, str) and not val.strip()):
            return False, f"'{field}' is empty or missing (required for '{op}')"
        left_num = _as_number(val)
        right_num = _as_number(expected)
        if op in _NUMERIC_OPS:
            if left_num is None or right_num is None:
                return False, f"Operator '{op}' requires numeric values; field='{field}'={val!r}, value={expected!r}"
            return _apply_numeric_op(op, left_num, right_num), f"'{field}' ({left_num}) {op} value ({right_num})"
        if op in ("eq", "ne"):
            if left_num is not None and right_num is not None and not isinstance(expected, bool):
                return _apply_numeric_op(op, left_num, right_num), f"'{field}' ({left_num}) {op} value ({right_num})"
            b_expected = _as_bool(expected)
            b_val = _as_bool(val)
            if b_expected is not None:
                passed = _apply_string_op(op, str(b_val).lower(), str(b_expected).lower(), case_sensitive=True)
                return passed, f"'{field}' ({val!r}) {op} boolean ({b_expected})"
            passed = _apply_string_op(op, val, expected, case_sensitive=case_sensitive)
            return passed, f"'{field}' ({val!r}) {op} value ({expected!r})"
        passed = _apply_string_op(op, val, expected, case_sensitive=case_sensitive)
        return passed, f"'{field}' ({val!r}) {op} ({expected!r})"

    if atom_type == "role":
        required_role = atom.get("role")
        if not required_role:
            return False, "No required role specified in role rule"
        if actor_type == "system":
            return True, f"System actor '{actor_id}' authorized automatically"
        roles = _resolve_actor_roles(db, actor_id, actor_roles)
        if required_role in roles or "Admin" in roles:
            return True, f"Actor has required role: '{required_role}'"
        return False, f"Actor '{actor_id}' lacks required role '{required_role}' (holds: {roles})"

    if atom_type == "field_not_empty":
        field = atom.get("field")
        val = custom_fields.get(field)
        if val is not None and str(val).strip() != "" and val != [] and val != {}:
            return True, f"Field '{field}' is present and non-empty"
        return False, f"Field '{field}' is empty or missing"

    if atom_type == "date":
        field = atom.get("field")
        op = atom.get("operator", "<")
        compare_to = atom.get("value", "now")
        val = custom_fields.get(field)
        if not val:
            return False, f"Date field '{field}' is missing or null"
        try:
            date_val = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            if date_val.tzinfo is None:
                date_val = date_val.replace(tzinfo=timezone.utc)
            if compare_to == "now":
                target_date = datetime.now(timezone.utc)
            else:
                target_date = datetime.fromisoformat(str(compare_to).replace("Z", "+00:00"))
                if target_date.tzinfo is None:
                    target_date = target_date.replace(tzinfo=timezone.utc)
            if op in ("<", "<="):
                passed = date_val <= target_date if op == "<=" else date_val < target_date
            elif op in (">", ">="):
                passed = date_val >= target_date if op == ">=" else date_val > target_date
            elif op in ("=", "=="):
                passed = date_val == target_date
            else:
                return False, f"Unsupported date operator '{op}'"
            return passed, f"Date '{field}' ({date_val.isoformat()}) {op} target ({target_date.isoformat()})"
        except Exception as ex:
            return False, f"Error evaluating date comparison: {str(ex)}"

    if atom_type == "related":
        rel_field = atom.get("relationship_field")
        target_entity_type = atom.get("target_entity_type")
        required_status = atom.get("required_status")
        target_field = atom.get("target_field")
        op = atom.get("operator", "=")
        expected_val = atom.get("value")
        linked_id = custom_fields.get(rel_field)
        if not linked_id:
            return True, f"No related {target_entity_type} linked in '{rel_field}' (allowed by default)"
        try:
            TargetModel, _ = get_entity_models(target_entity_type)
            target_row = db.query(TargetModel).filter(TargetModel.id == str(linked_id)).first()
            if not target_row:
                return False, f"Linked {target_entity_type} with ID '{linked_id}' not found"
            if required_status:
                if target_row.status.lower() == required_status.lower():
                    return True, f"Linked {target_entity_type} '{linked_id}' has required status '{required_status}'"
                return False, f"Linked {target_entity_type} '{linked_id}' is in status '{target_row.status}', required: '{required_status}'"
            if target_field:
                target_val = (target_row.custom_fields or {}).get(target_field)
                b = _apply_string_op(_map_op(op), target_val, expected_val)
                return b, f"Linked {target_entity_type} field '{target_field}' ({target_val!r}) {op} ({expected_val!r})"
            return False, f"Related rule missing required_status or target_field"
        except Exception as ex:
            return False, f"Error evaluating related rule: {str(ex)}"

    if atom_type == "expression":
        expression = atom.get("expression")
        op = str(atom.get("operator", ">")).lower().strip()
        op = {"<": "lt", "<=": "le", ">": "gt", ">=": "ge", "=": "eq", "==": "eq", "!=": "ne", "≥": "ge", "≤": "le"}.get(op, op)
        threshold = atom.get("value")
        compare_expression = atom.get("compare_expression")
        if not expression:
            return False, "No expression configured"
        try:
            left = evaluate_arithmetic(str(expression), custom_fields)
            if compare_expression is not None:
                right = evaluate_arithmetic(str(compare_expression), custom_fields)
                right_label = str(compare_expression)
            else:
                right = _as_number(threshold)
                right_label = str(threshold)
                if right is None:
                    return False, f"Configured threshold '{threshold}' is not numeric"
            passed = _apply_numeric_op(op, left, right)
            return passed, f"Expression '{expression}' = {left} {op} threshold ({right_label})"
        except ExpressionError as ex:
            return False, f"Expression error: {ex.message}"
    if atom_type == "person_group":
        rel_field = atom.get("relationship_field") or "assigned_to"
        group_name = atom.get("group") or atom.get("group_name")
        person_id = custom_fields.get(rel_field)
        if not person_id:
            return False, f"No person assigned in field '{rel_field}'"
        if not group_name:
            return False, "No target group specified in person_group rule"
        try:
            from backend.models.person import Person, PersonGroupMember
            member = (
                db.query(PersonGroupMember)
                .join(Person, Person.person_id == PersonGroupMember.person_id)
                .filter(
                    PersonGroupMember.group_name == str(group_name).strip().upper(),
                    PersonGroupMember.person_id == str(person_id).strip().upper(),
                    Person.status == "ACTIVE",
                )
                .first()
            )
            if member:
                return True, f"Person '{person_id}' is an active member of group '{group_name}'"
            return False, f"Person '{person_id}' is not an active member of group '{group_name}'"
        except Exception as ex:
            return False, f"Error evaluating person_group rule: {str(ex)}"

    return False, f"Unknown rule type '{atom_type}'"


def _map_op(op: str) -> str:
    return {"=": "eq", "==": "eq", "!=": "ne", "<>": "ne"}.get(op, op)


def evaluate_rule_tree(
    node: Dict[str, Any],
    db: Session,
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str,
    actor_roles: Optional[List[str]] = None,
    _depth: int = 0,
) -> Tuple[bool, str]:
    """
    Recursively evaluates a rule-tree node (group or single rule). A bare rule
    dict (with 'type') is treated as a leaf of logic AND with itself.
    """
    if _depth > 20:
        return False, "Rule tree exceeds maximum nesting depth (20)"

    # Leaf atom
    if "type" in node and "rules" not in node:
        return evaluate_atom(node, db, custom_fields, actor_id, actor_type, actor_roles)

    # Nested group wrapper: {"group": {<group node>}}
    if "group" in node:
        return evaluate_rule_tree(
            node["group"], db, custom_fields, actor_id, actor_type, actor_roles, _depth + 1
        )

    rules = node.get("rules", [])
    logic = (node.get("logic") or "AND").upper()
    if logic not in ("AND", "OR"):
        return False, f"Unknown group logic '{logic}' (use AND or OR)"

    results = []
    for idx, rule in enumerate(rules):
        passed, reason = evaluate_rule_tree(rule, db, custom_fields, actor_id, actor_type, actor_roles, _depth + 1)
        results.append((passed, reason, idx))

    if logic == "AND":
        failed = next((r for r in results if not r[0]), None)
        if failed:
            passed, reason = False, f"AND group failed at rule #{failed[2] + 1}: {failed[1]}"
        else:
            passed, reason = True, "All rules passed (AND)"
    else:  # OR
        winner = next((r for r in results if r[0]), None)
        if winner:
            passed, reason = True, f"OR group passed at rule #{winner[2] + 1}: {winner[1]}"
        elif not results:
            passed, reason = False, "OR group has no rules"
        else:
            passed, reason = False, "No OR rule passed"

    if node.get("negate"):
        return not passed, f"{reason} (negated -> {not passed})"
    return passed, reason

    # note: unreachable, kept type-stable


def evaluate_condition(
    db: Session,
    condition: ConditionDefinition,
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> ConditionEvaluationResult:
    """Evaluates a single condition's LIVE definition against the context."""
    policy = condition.failure_policy or "block"
    try:
        passed, reason = evaluate_rule_tree(
            condition.definition,
            db,
            custom_fields,
            actor_id,
            actor_type,
            actor_roles,
        )
    except Exception as ex:
        passed, reason = False, f"Condition evaluation exception: {str(ex)}"

    effective_pass = passed or (policy == "allow")
    if not passed and policy == "allow":
        reason = f"{reason} [OVERRIDDEN: failure_policy = allow]"
    return ConditionEvaluationResult(
        condition_id=condition.id,
        label=condition.label,
        passed=passed,
        reason=reason,
        failure_policy=policy,
        effective_pass=effective_pass,
    )


def evaluate_condition_by_id(
    db: Session,
    condition_id: str,
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> ConditionEvaluationResult:
    condition = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id).first()
    if not condition:
        return ConditionEvaluationResult(
            condition_id=condition_id,
            label=f"Missing Condition ({condition_id})",
            passed=False,
            reason=f"Condition with ID '{condition_id}' not found",
            failure_policy="block",
            effective_pass=False,
        )
    return evaluate_condition(db, condition, custom_fields, actor_id, actor_type, actor_roles)


def evaluate_condition_ids(
    db: Session,
    condition_ids: List[str],
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> Tuple[bool, List[ConditionEvaluationResult], Optional[ConditionEvaluationResult]]:
    """Evaluates all referenced conditions (AND semantics — every one must pass).
    Returns (all_passed, results, first_failing)."""
    if not condition_ids:
        return True, [], None

    results: List[ConditionEvaluationResult] = []
    first_failing: Optional[ConditionEvaluationResult] = None
    for cid in condition_ids:
        res = evaluate_condition_by_id(db, cid, custom_fields, actor_id, actor_type, actor_roles)
        results.append(res)
        if not res.effective_pass and first_failing is None:
            first_failing = res
    return first_failing is None, results, first_failing


def evaluate_condition_any(
    db: Session,
    condition_ids: List[str],
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> Tuple[bool, List[ConditionEvaluationResult]]:
    """Any referenced condition passing counts as a pass (OR semantics, first match wins)."""
    if not condition_ids:
        return True, []
    results: List[ConditionEvaluationResult] = []
    for cid in condition_ids:
        res = evaluate_condition_by_id(db, cid, custom_fields, actor_id, actor_type, actor_roles)
        results.append(res)
        if res.effective_pass:
            return True, results
    return False, results