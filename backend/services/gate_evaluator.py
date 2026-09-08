from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.models.workflow import GateInstance
from backend.models.users import AppUser
from backend.models.entities import get_entity_models

class GateEvaluationResult(BaseModel):
    gate_id: str
    gate_type: str
    label: str
    passed: bool
    reason: str
    failure_policy: str  # 'block' | 'allow'
    effective_pass: bool  # True if passed OR (not passed and failure_policy == 'allow')

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
