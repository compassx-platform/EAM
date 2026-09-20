from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.models.workflow import WorkflowDefinition
from backend.models.forms import EntityForm
from backend.models.base import generate_uuid, utc_now
from backend.services.condition_evaluator import evaluate_condition, evaluate_rule_tree, ConditionEvaluationResult

router = APIRouter(prefix="/conditions", tags=["Conditions"])

# Atom-type catalog (metadata-driven rule builder) — superset of the old gate types.
ATOM_TYPES_CATALOG = [
    {
        "type": "attribute",
        "name": "Field comparison",
        "description": "Compare an entity field against a value (equality, ordering, membership, substring, emptiness).",
    },
    {
        "type": "role",
        "name": "Role check",
        "description": "Requires the actor to hold a specific role (e.g. Safety Officer, Supervisor).",
    },
    {
        "type": "field_not_empty",
        "name": "Field is filled",
        "description": "Verifies a field is present and non-empty.",
    },
    {
        "type": "date",
        "name": "Date comparison",
        "description": "Compares a date field against another date or 'now'.",
    },
    {
        "type": "related",
        "name": "Related entity check",
        "description": "Follows an entity_reference field to a target entity and checks its status or a field.",
    },
    {
        "type": "expression",
        "name": "Arithmetic expression",
        "description": "Evaluates a whitelisted arithmetic expression over fields and compares the result.",
    },
    {
        "type": "person_group",
        "name": "Person Group member",
        "description": "Checks if the person in a relationship field is an active member of a specified Person Group.",
    },
]

# Operators grouped by value kind, for the guided rule editor.
OPERATORS_CATALOG = {
    "string": ["eq", "ne", "in", "not_in", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
    "number": ["eq", "ne", "lt", "le", "gt", "ge", "is_empty", "is_not_empty"],
    "boolean": ["eq", "ne", "is_empty", "is_not_empty"],
    "date": ["lt", "le", "gt", "ge", "eq"],
    "select": ["eq", "ne", "in", "not_in", "is_empty", "is_not_empty"],
}


class ConditionRequest(BaseModel):
    id: Optional[str] = None
    entity_type: str
    label: str
    description: Optional[str] = None
    type: str = "structured"  # 'structured' | 'script'
    definition: Dict[str, Any] = {"logic": "AND", "rules": []}
    failure_policy: str = "block"  # 'block' | 'allow'
    created_by: Optional[str] = "admin@compassx.io"


class ConditionEvalRequest(BaseModel):
    custom_fields: Dict[str, Any] = {}
    actor_id: Optional[str] = None
    actor_type: str = "human"
    actor_roles: Optional[List[str]] = None


def _normalize_definition(req: ConditionRequest) -> Dict[str, Any]:
    """Script type gets a plain expression body; structured must hold a rule tree."""
    if req.type == "script":
        return {"expression": req.definition.get("expression", "")}
    if not isinstance(req.definition, dict) or not isinstance(req.definition.get("rules"), list):
        raise HTTPException(status_code=400, detail="Structured definition must be {'logic': 'AND'|'OR', 'rules': [...]}")
    return req.definition


@router.get("/types")
def get_atom_types():
    """Returns the closed registry of atom/rule types for the condition builder."""
    return {"atoms": ATOM_TYPES_CATALOG, "operators": OPERATORS_CATALOG}


@router.get("")
def list_conditions(entity_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ConditionDefinition)
    if entity_type:
        query = query.filter(ConditionDefinition.entity_type == entity_type.lower())
    conditions = query.order_by(ConditionDefinition.entity_type, ConditionDefinition.label).all()
    return [c.to_dict() for c in conditions]


@router.get("/{id}")
def get_condition(id: str, db: Session = Depends(get_db)):
    cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    return cond.to_dict()


@router.get("/{id}/versions")
def list_versions(id: str, db: Session = Depends(get_db)):
    cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    versions = db.query(ConditionVersion).filter(ConditionVersion.condition_id == id).order_by(ConditionVersion.version.desc()).all()
    return [v.to_dict() for v in versions]


@router.get("/{id}/used-by")
def used_by(id: str, db: Session = Depends(get_db)):
    """Impact analysis — which workflows and forms reference this condition."""
    cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")

    workflows = []
    for wf in db.query(WorkflowDefinition).all():
        defn = wf.definition or {}
        hits = []
        for i, tr in enumerate(defn.get("transitions", [])):
            refs = list(tr.get("conditions", []) or [])
            refs.extend(list(tr.get("gates", []) or []))
            if id in refs:
                hits.append(f"transition[{i}] ({tr.get('event')}, {tr.get('from')}->{tr.get('to')})")
            for j, ch in enumerate(tr.get("choices", []) or []):
                if id in (ch.get("when", []) or []):
                    hits.append(f"transition[{i}].choice[{j}]")
        for at in defn.get("auto_transitions", []) or []:
            if id in (at.get("when", []) or []):
                hits.append(f"auto_transition ({at.get('event')})")
        if hits:
            workflows.append({"id": wf.id, "version_label": wf.version_label, "status": wf.status, "references": hits})

    forms = []
    for form in db.query(EntityForm).all():
        hits = []
        for row in form.sections or []:
            if (row.get("visibility_condition") or {}).get("condition_id") == id:
                hits.append(f"sections.{row.get('id')}")
        for row in (form.layout or []):
            vc = row.get("visibility_condition") or {}
            if vc.get("condition_id") == id or any((r or {}).get("condition_id") == id for r in vc.get("rules", []) if isinstance(r, dict)):
                hits.append(f"layout.{row.get('i')}")
        if hits:
            forms.append({"entity_type": form.entity_type, "references": hits})

    return {"workflows": workflows, "forms": forms, "referenced": bool(workflows or forms)}


@router.post("")
def create_or_update_condition(req: ConditionRequest, db: Session = Depends(get_db)):
    entity_type = req.entity_type.lower()
    definition = _normalize_definition(req)
    cond_id = req.id or f"cond_{entity_type}_{generate_uuid()[:6]}"

    # Validate the structured rule tree before persisting.
    if req.type == "structured":
        try:
            evaluate_rule_tree(definition, db, {}, actor_id="preview", actor_type="human") if definition.get("rules") else None
        except Exception:
            pass  # shape checked below
        # Light structural validation: every rule is a dict; groups recurse.
        def _valid(node):
            if "type" in node and "rules" not in node:
                return isinstance(node.get("type"), str)
            return isinstance(node.get("rules"), list) and all(_valid(r) for r in node["rules"])
        if not _valid(definition):
            raise HTTPException(status_code=400, detail="Invalid rule tree structure")

    existing = db.query(ConditionDefinition).filter(ConditionDefinition.id == cond_id).first()
    if existing:
        has_changed = (
            existing.label != req.label
            or (existing.description or "").strip() != (req.description or "").strip()
            or existing.definition != definition
            or existing.failure_policy != req.failure_policy
            or existing.type != req.type
        )
        if has_changed:
            existing.label = req.label
            existing.description = req.description
            existing.type = req.type
            existing.definition = definition
            existing.failure_policy = req.failure_policy
            existing.updated_at = utc_now()
            new_version = (existing.current_version or 1) + 1
            existing.current_version = new_version
            version = ConditionVersion(
                condition_id=existing.id,
                version=new_version,
                label=req.label,
                definition=definition,
                failure_policy=req.failure_policy,
                created_by=req.created_by,
            )
            db.add(version)
            db.commit()
            db.refresh(existing)
        return existing.to_dict()
    else:
        cond = ConditionDefinition(
            id=cond_id,
            entity_type=entity_type,
            label=req.label,
            description=req.description,
            type=req.type,
            definition=definition,
            current_version=1,
            failure_policy=req.failure_policy,
            created_by=req.created_by,
        )
        db.add(cond)
        version = ConditionVersion(
            condition_id=cond_id,
            version=1,
            label=req.label,
            definition=definition,
            failure_policy=req.failure_policy,
            created_by=req.created_by,
        )
        db.add(version)
        db.commit()
        db.refresh(cond)
        return cond.to_dict()


@router.delete("/{id}")
def delete_condition(id: str, db: Session = Depends(get_db)):
    cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    db.query(ConditionVersion).filter(ConditionVersion.condition_id == id).delete()
    db.delete(cond)
    db.commit()
    return {"deleted": True, "id": id}


@router.post("/{id}/eval")
def evaluate_preview(id: str, req: ConditionEvalRequest, db: Session = Depends(get_db)):
    """Evaluates a condition's live definition against sample context (builder/form preview)."""
    cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    result = evaluate_condition(db, cond, req.custom_fields, req.actor_id or "preview@user", req.actor_type, req.actor_roles)
    return result.model_dump()