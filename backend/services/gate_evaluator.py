from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.models.workflow import GateInstance
from backend.models.users import AppUser
from backend.models.entities import get_entity_models
from backend.services.expression import evaluate_arithmetic, ExpressionError

class GateEvaluationResult(BaseModel):
    gate_id: str
    gate_type: str
    label: str
    passed: bool
    reason: str
    failure_policy: str  # 'block' | 'allow'
    effective_pass: bool  # True if passed OR (not passed and failure_policy == 'allow')

# Comparison operators understood by the generic attribute_condition gate.
_ATTR_OPS = {"eq", "ne", "lt", "le", "gt", "ge", "in", "not_in", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"}
_NUMERIC_OPS = {"lt", "le", "gt", "ge"}
_STRING_OPS = {"eq", "ne", "contains", "starts_with", "ends_with", "in", "not_in"}


def _as_bool(value: Any) -> Optional[bool]:
    """Coerces a configured 'true'/'false' or Python bool to bool."""
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
    """Coerces a value to float when it is numeric-looking; None otherwise."""
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
    """Case-insensitive (by default) string comparison for the text/select/boolean ops."""
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
        needle = left.strip().lower() if not case_sensitive else left.strip()
        return needle in pool
    if op == "not_in":
        opts = expected if isinstance(expected, list) else [expected]
        pool = [str(o).strip().lower() if not case_sensitive else str(o) for o in opts]
        needle = left.strip().lower() if not case_sensitive else left.strip()
        return needle not in pool
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


def evaluate_single_gate(
    db: Session,
    gate: GateInstance,
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> GateEvaluationResult:
    """
    Evaluates a single GateInstance against the given context (Section 3.5 & Section 7).
    """
    gate_type = gate.gate_type
    params = gate.params or {}
    policy = gate.failure_policy or "block"
    
    passed = False
    reason = ""

    try:
        if gate_type == "role_check":
            # 1. role_check: Actor holds the given role
            required_role = params.get("role")
            if not required_role:
                passed = False
                reason = "No required role specified in gate configuration"
            elif actor_type == "system":
                # System actors (e.g. system:expiry-checker) pass system-initiated transitions
                passed = True
                reason = f"System actor '{actor_id}' authorized automatically"
            else:
                roles = list(actor_roles or [])
                if not roles and actor_id:
                    user = db.query(AppUser).filter((AppUser.email == actor_id) | (AppUser.id == actor_id)).first()
                    if user:
                        roles = [r.name for r in user.roles]
                
                if required_role in roles or "Admin" in roles:
                    passed = True
                    reason = f"Actor has required role: '{required_role}'"
                else:
                    passed = False
                    reason = f"Actor '{actor_id}' lacks required role '{required_role}' (holds: {roles})"

        elif gate_type == "numeric_threshold":
            # 2. numeric_threshold: entity's custom_fields[field] vs value
            field = params.get("field")
            op = params.get("operator", "<=")
            threshold = params.get("value")
            
            val = custom_fields.get(field)
            if val is None:
                passed = False
                reason = f"Numeric field '{field}' is missing or null"
            else:
                try:
                    num_val = float(val)
                    num_thresh = float(threshold)
                    if op in ["<=", "≤"]:
                        passed = num_val <= num_thresh
                    elif op == "<":
                        passed = num_val < num_thresh
                    elif op in [">=", "≥"]:
                        passed = num_val >= num_thresh
                    elif op == ">":
                        passed = num_val > num_thresh
                    elif op in ["=", "=="]:
                        passed = num_val == num_thresh
                    elif op in ["!=", "<>"]:
                        passed = num_val != num_thresh
                    else:
                        passed = False
                        reason = f"Unsupported operator '{op}'"
                    
                    if not reason:
                        reason = f"Field '{field}' ({num_val}) {op} threshold ({num_thresh}) -> {'Pass' if passed else 'Fail'}"
                except (ValueError, TypeError) as e:
                    passed = False
                    reason = f"Cannot compare non-numeric value '{val}' to threshold '{threshold}'"

        elif gate_type == "field_not_empty":
            # 3. field_not_empty: custom_fields[field] is present and non-empty
            field = params.get("field")
            val = custom_fields.get(field)
            if val is not None and str(val).strip() != "" and val != [] and val != {}:
                passed = True
                reason = f"Field '{field}' is present and non-empty"
            else:
                passed = False
                reason = f"Field '{field}' is empty or missing"

        elif gate_type == "date_check":
            # 4. date_check: date comparison on custom_fields[field]
            field = params.get("field")
            op = params.get("operator", "<")
            compare_to = params.get("value", "now")

            val = custom_fields.get(field)
            if not val:
                passed = False
                reason = f"Date field '{field}' is missing or null"
            else:
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

                    if op in ["<", "<="]:
                        passed = date_val <= target_date if op == "<=" else date_val < target_date
                    elif op in [">", ">="]:
                        passed = date_val >= target_date if op == ">=" else date_val > target_date
                    elif op in ["=", "=="]:
                        passed = date_val == target_date
                    else:
                        passed = False
                        reason = f"Unsupported date operator '{op}'"
                        
                    if not reason:
                        reason = f"Date '{field}' ({date_val.isoformat()}) {op} target ({target_date.isoformat()}) -> {'Pass' if passed else 'Fail'}"
                except Exception as ex:
                    passed = False
                    reason = f"Error evaluating date comparison: {str(ex)}"

        elif gate_type == "related_entity_status_check":
            # 5. related_entity_status_check (Section 7)
            # follows custom_fields[relationship_field] -> target entity, checks status
            rel_field = params.get("relationship_field")
            target_entity_type = params.get("target_entity_type")
            required_status = params.get("required_status")
            target_field = params.get("target_field")
            op = params.get("operator", "=")
            expected_val = params.get("value")

            linked_id = custom_fields.get(rel_field)
            if not linked_id:
                # Per Section 7.3: If no permit is linked and the field itself is optional, gate passes.
                # (A separate field_not_empty gate independently mandates linking if compulsory)
                passed = True
                reason = f"No related {target_entity_type} linked in '{rel_field}' (allowed by default unless field_not_empty gate is set)"
            else:
                try:
                    TargetModel, _ = get_entity_models(target_entity_type)
                    target_row = db.query(TargetModel).filter(TargetModel.id == str(linked_id)).first()
                    
                    if not target_row:
                        passed = False
                        reason = f"Linked {target_entity_type} with ID '{linked_id}' not found in database"
                    else:
                        if required_status:
                            if target_row.status.lower() == required_status.lower():
                                passed = True
                                reason = f"Linked {target_entity_type} '{linked_id}' has required status '{required_status}'"
                            else:
                                passed = False
                                reason = f"Linked {target_entity_type} '{linked_id}' is in status '{target_row.status}', required: '{required_status}'"
                        elif target_field:
                            target_val = (target_row.custom_fields or {}).get(target_field)
                            if op in ["=", "=="]:
                                passed = str(target_val) == str(expected_val)
                            elif op == "!=":
                                passed = str(target_val) != str(expected_val)
                            reason = f"Linked {target_entity_type} field '{target_field}' ({target_val}) {op} {expected_val} -> {'Pass' if passed else 'Fail'}"
                        else:
                            passed = True
                            reason = f"Linked {target_entity_type} '{linked_id}' verified"
                except Exception as ex:
                    passed = False
                    reason = f"Failed to check related entity status: {str(ex)}"

        elif gate_type == "attribute_condition":
            # 6. attribute_condition: generic declarative comparison on any field.
            #    Operators: eq, ne, lt, le, gt, ge, in, not_in, contains,
            #    starts_with, ends_with, is_empty, is_not_empty. Numeric values
            #    compare numerically; everything else compares as strings.
            field = params.get("field")
            op = str(params.get("operator", "eq")).lower()
            expected = params.get("value")
            case_sensitive = bool(params.get("case_sensitive", False))

            if not field:
                passed = False
                reason = "No 'field' configured for attribute_condition gate"
            elif op not in _ATTR_OPS:
                passed = False
                reason = f"Unsupported operator '{op}'. Allowed: {sorted(_ATTR_OPS)}"
            else:
                val = custom_fields.get(field)
                if op in ("is_empty", "is_not_empty"):
                    empty = val is None or (isinstance(val, str) and not val.strip()) or val == [] or val == {}
                    passed = empty if op == "is_empty" else not empty
                    reason = f"Field '{field}' is {'' if empty else 'not '}empty -> {'Pass' if passed else 'Fail'}"
                else:
                    if val is None or (isinstance(val, str) and not val.strip()):
                        passed = False
                        reason = f"Field '{field}' is empty or missing (required for operator '{op}')"
                    else:
                        left_num = _as_number(val)
                        right_num = _as_number(expected)
                        if op in _NUMERIC_OPS:
                            if left_num is None or right_num is None:
                                # Fall back to numeric-ish string compare not possible -> fail with reason
                                passed = False
                                reason = f"Operator '{op}' requires numeric values; field '{field}'={val!r}, value={expected!r}"
                            else:
                                passed = _apply_numeric_op(op, left_num, right_num)
                                reason = f"Field '{field}' ({left_num}) {op} value ({right_num}) -> {'Pass' if passed else 'Fail'}"
                        elif op in ("eq", "ne"):
                            # Prefer numeric comparison when both sides look numeric; else boolean/string.
                            if left_num is not None and right_num is not None and not isinstance(expected, bool):
                                passed = _apply_numeric_op(op, left_num, right_num)
                                reason = f"Field '{field}' ({left_num}) {op} value ({right_num}) -> {'Pass' if passed else 'Fail'}"
                            else:
                                b_expected = _as_bool(expected)
                                b_val = _as_bool(val)
                                if b_expected is not None:
                                    passed = _apply_string_op(op, str(b_val).lower(), str(b_expected).lower(), case_sensitive=True)
                                    reason = f"Field '{field}' ({val!r}) {op} boolean ({b_expected}) -> {'Pass' if passed else 'Fail'}"
                                else:
                                    passed = _apply_string_op(op, val, expected, case_sensitive=case_sensitive)
                                    reason = f"Field '{field}' ({val!r}) {op} value ({expected!r}) -> {'Pass' if passed else 'Fail'}"
                        else:  # in, not_in, contains, starts_with, ends_with
                            passed = _apply_string_op(op, val, expected, case_sensitive=case_sensitive)
                            reason = f"Field '{field}' ({val!r}) {op} ({expected!r}) -> {'Pass' if passed else 'Fail'}"

        elif gate_type == "expression_threshold":
            # 7. expression_threshold: evaluates a whitelisted arithmetic
            #    expression against custom_fields and compares the result to
            #    a literal value (or a second expression when compare_expression
            #    is configured). Example: ($estlabcost + $estmatcost) > 5000
            expression = params.get("expression")
            op = str(params.get("operator", ">")).lower().strip()
            op = {"<": "lt", "<=": "le", ">": "gt", ">=": "ge", "=": "eq", "==": "eq", "!=": "ne", "≥": "ge", "≤": "le"}.get(op, op)
            threshold = params.get("value")
            compare_expression = params.get("compare_expression")

            if not expression:
                passed = False
                reason = "No 'expression' configured for expression_threshold gate"
            else:
                try:
                    left = evaluate_arithmetic(str(expression), custom_fields)
                    if compare_expression is not None:
                        right = evaluate_arithmetic(str(compare_expression), custom_fields)
                        right_label = str(compare_expression)
                    else:
                        right = _as_number(threshold)
                        right_label = str(threshold)
                        if right is None:
                            passed = False
                            reason = f"Configured threshold '{threshold}' is not numeric"
                            right_label = ""
                    if right is not None:
                        passed = _apply_numeric_op(op, left, right)
                        reason = f"Expression '{expression}' = {left} {op} threshold ({right_label}) -> {'Pass' if passed else 'Fail'}"
                except ExpressionError as ex:
                    passed = False
                    reason = f"Expression error: {ex.message}"

        else:
            passed = False
            reason = f"Unknown gate type '{gate_type}'"

    except Exception as ex:
        passed = False
        reason = f"Gate evaluation exception: {str(ex)}"

    effective_pass = passed or (policy == "allow")
    if not passed and policy == "allow":
        reason = f"{reason} [OVERRIDDEN: failure_policy = allow]"

    return GateEvaluationResult(
        gate_id=gate.id,
        gate_type=gate.gate_type,
        label=gate.label,
        passed=passed,
        reason=reason,
        failure_policy=policy,
        effective_pass=effective_pass,
    )

def evaluate_transition_gates(
    db: Session,
    gate_ids: List[str],
    custom_fields: Dict[str, Any],
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> Tuple[bool, List[GateEvaluationResult], Optional[GateEvaluationResult]]:
    """
    Evaluates all gates attached to a transition.
    Returns (all_passed, results_list, first_failing_gate).
    """
    if not gate_ids:
        return True, [], None

    # Load gate instances
    gates = db.query(GateInstance).filter(GateInstance.id.in_(gate_ids)).all()
    gate_map = {g.id: g for g in gates}

    results: List[GateEvaluationResult] = []
    first_failing: Optional[GateEvaluationResult] = None

    for gid in gate_ids:
        gate = gate_map.get(gid)
        if not gate:
            res = GateEvaluationResult(
                gate_id=gid,
                gate_type="unknown",
                label=f"Missing Gate ({gid})",
                passed=False,
                reason=f"Gate instance with ID '{gid}' not found",
                failure_policy="block",
                effective_pass=False,
            )
        else:
            res = evaluate_single_gate(
                db=db,
                gate=gate,
                custom_fields=custom_fields,
                actor_id=actor_id,
                actor_type=actor_type,
                actor_roles=actor_roles,
            )
        
        results.append(res)
        if not res.effective_pass and first_failing is None:
            first_failing = res

    all_passed = all(r.effective_pass for r in results)
    return all_passed, results, first_failing
