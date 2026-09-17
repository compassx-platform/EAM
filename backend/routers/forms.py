from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.forms import EntityForm
from backend.models.field_registry import EntityField
from backend.models.workflow import WorkflowDefinition
from backend.services import list_service

router = APIRouter(prefix="/forms", tags=["Entity Form Builder"])

GENERIC_FIELD_TYPES = [
    "text",
    "long_text",
    "number",
    "email",
    "phone",
    "url",
    "date",
    "datetime",
    "time",
    "selection",
    "checkbox_group",
    "dropdown",
    "boolean",
    "table",
    "checklist",
    "file",
    "file_attachment",
    "attachment",
]
LEGACY_FIELD_TYPES = ["number", "date", "select", "entity_reference"]
ALLOWED_FIELD_TYPES = GENERIC_FIELD_TYPES + [t for t in LEGACY_FIELD_TYPES if t not in GENERIC_FIELD_TYPES]
OPTION_REQUIRED_TYPES = ("selection", "checkbox_group", "dropdown", "table")
LIST_REQUIRED_TYPES = ("checklist",)

def _published_workflow_states(db: Session, entity_type: str):
    """Stages + initial stage from the latest published workflow for an entity type.

    These make the workflow stage available to form condition rules via the
    ``_workflow_status`` pseudo-field (stage -> form two-way binding).
    """
    wf = (
        db.query(WorkflowDefinition)
        .filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.status == "published",
        )
        .order_by(WorkflowDefinition.created_at.desc(), WorkflowDefinition.version_label.desc())
        .first()
    )
    if not wf:
        return [], None

    definition = wf.definition or {}
    states = [s for s in definition.get("states", []) if isinstance(s, str) and s.strip()]
    initial_state = states[0] if states else None
    for t in definition.get("transitions", []):
        # The CREATED transition is the implicit entry edge (no from-state).
        if t.get("from") in (None, "") or t.get("event") in ("CREATED", "CREATE"):
            to_state = t.get("to")
            if isinstance(to_state, str) and to_state.strip():
                initial_state = to_state
                break
    return states, initial_state

class FormItem(BaseModel):
    i: str
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 1
    isHeader: Optional[bool] = False
    is_header: Optional[bool] = False
    isGroup: Optional[bool] = False
    is_group: Optional[bool] = False
    label: Optional[str] = None
    fieldName: Optional[str] = None
    field_name: Optional[str] = None
    fieldType: Optional[str] = None
    field_type: Optional[str] = None
    required: Optional[bool] = None
    options: Optional[List[str]] = None
    options_list: Optional[str] = None  # Central list_key reference (published snapshot)
    optionsList: Optional[str] = None
    hidden_options: Optional[List[str]] = None  # List of option names/values hidden for this form
    hiddenOptions: Optional[List[str]] = None  # CamelCase support
    group_id: Optional[str] = None
    groupId: Optional[str] = None
    group_title: Optional[str] = None
    groupTitle: Optional[str] = None
    visibility_condition: Optional[Dict[str, Any]] = None
    visibilityCondition: Optional[Dict[str, Any]] = None
    placeholder: Optional[str] = None
    accept: Optional[str] = None
    max_file_size_mb: Optional[int] = None
    maxFileSizeMb: Optional[int] = None
    allow_multiple: Optional[bool] = None
    allowMultiple: Optional[bool] = None
    max_files: Optional[int] = None
    maxFiles: Optional[int] = None
    model_config = ConfigDict(extra="allow")

class EntityFormRequest(BaseModel):
    entity_type: str
    layout: List[FormItem] = []
    cols: int = 12
    row_height: int = 40

@router.get("")
def list_forms(db: Session = Depends(get_db)):
    """List saved form layouts (summary without field registry)."""
    forms = db.query(EntityForm).order_by(EntityForm.entity_type).all()
    return [
        {
            "entity_type": f.entity_type,
            "cols": f.cols,
            "row_height": f.row_height,
            "item_count": len(f.layout or []),
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in forms
    ]

@router.get("/{entity_type}")
def get_form(entity_type: str, db: Session = Depends(get_db)):
    """Returns saved layout merged with the field registry for the entity type."""
    et = entity_type.lower()
    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    fields = (
        db.query(EntityField).filter(EntityField.entity_type == et).order_by(EntityField.field_name).all()
    )
    with_fields = [f.to_dict() for f in fields]
    workflow_states, initial_state = _published_workflow_states(db, et)

    if not form:
        return {
            "entity_type": et,
            "layout": [],
            "sections": [],
            "cols": 12,
            "row_height": 40,
            "updated_at": None,
            "fields": with_fields,
            "workflow_states": workflow_states,
            "initial_state": initial_state,
        }

    result = form.to_dict()
    result["fields"] = with_fields
    result["workflow_states"] = workflow_states
    result["initial_state"] = initial_state
    return result

@router.post("")
def create_or_update_form(req: EntityFormRequest, db: Session = Depends(get_db)):
    et = req.entity_type.lower().strip()
    if not et:
        raise HTTPException(status_code=400, detail="entity_type is required")

    known = {
        f.field_name for f in db.query(EntityField).filter(EntityField.entity_type == et).all()
    }
    used = set()

    seen: Dict[str, Any] = {}
    cleaned = []
    for item in req.layout:
        i = item.i.strip()
        if not i or i in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate or empty layout item id '{i}'")
        seen[i] = True

        w = max(1, min(item.w, req.cols))
        h = max(1, item.h)

        is_grp = bool(item.isGroup or item.is_group or i.startswith("group:"))
        is_hdr = bool(item.isHeader or item.is_header or i.startswith("header:"))
        group_id = (item.group_id or item.groupId or ("" if not is_grp else i)).strip() or None
        group_title = (item.group_title or item.groupTitle or (item.label if is_grp else "") or "").strip() or None
        vis_cond = item.visibility_condition or item.visibilityCondition or None

        if is_hdr or is_grp:
            cleaned.append({
                "i": i,
                "x": max(0, item.x),
                "y": max(0, item.y),
                "w": w,
                "h": h,
                "isHeader": is_hdr,
                "isGroup": is_grp,
                "label": (item.label or i.replace("header:", "").replace("group:", "").replace("_", " ")).strip() or ("Section" if is_hdr else "Group"),
                "group_id": group_id,
                "groupId": group_id,
                "group_title": group_title,
                "groupTitle": group_title,
                "visibility_condition": vis_cond,
                "visibilityCondition": vis_cond,
            })
            continue

        # Generic field item: carries its own inline definition but must bind to a
        # registered entity field (the form only surfaces entity-schema fields).
        ft = item.fieldType or item.field_type
        if ft:
            if ft not in ALLOWED_FIELD_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid field_type '{ft}'. Allowed types: {ALLOWED_FIELD_TYPES}"
                )
            name = (item.fieldName or item.field_name or i).strip()
            if not name:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field item '{i}' is missing a field name"
                )
            if name in used:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field '{name}' can only be added to the form once.",
                )
            used.add(name)
            if name not in known:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field '{name}' is not registered for entity type '{et}'. Register it via the Entity Designer or POST /api/fields first.",
                )

            options = []
            for o in item.options or []:
                s = str(o).strip()
                if s and s not in options:
                    options.append(s)

            options_list = (item.options_list or item.optionsList or "").strip().lower() or None

            if ft in LIST_REQUIRED_TYPES:
                if not options_list:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Field '{name}' of type '{ft}' requires a shared checklist list (options_list)"
                    )
                published = list_service.get_latest_published(db, options_list)
                if not published:
                    raise HTTPException(
                        status_code=400,
                        detail=f"List '{options_list}' has no published version — publish it before referencing it"
                    )
                if published.kind != "checklist":
                    raise HTTPException(
                        status_code=400,
                        detail=f"List '{options_list}' is kind '{published.kind}'; a checklist field needs a 'checklist' list"
                    )
            elif options_list:
                published = list_service.get_latest_published(db, options_list)
                if not published:
                    raise HTTPException(
                        status_code=400,
                        detail=f"List '{options_list}' has no published version — publish it before referencing it"
                    )
                if published.kind != "options":
                    raise HTTPException(
                        status_code=400,
                        detail=f"List '{options_list}' is kind '{published.kind}'; option fields need an 'options' list"
                    )
                if ft not in OPTION_REQUIRED_TYPES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"options_list is only supported for {OPTION_REQUIRED_TYPES} field types"
                    )
            elif ft in OPTION_REQUIRED_TYPES and not options:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field '{name}' requires at least one option (or a shared options_list)"
                )

            hidden_options = []
            for h in (item.hidden_options or item.hiddenOptions or []):
                s = str(h).strip()
                if s and s not in hidden_options:
                    hidden_options.append(s)

            cleaned.append({
                "i": i,
                "x": max(0, item.x),
                "y": max(0, item.y),
                "w": w,
                "h": h,
                "isHeader": False,
                "isGroup": False,
                "label": (item.label or name).strip(),
                "fieldName": name,
                "fieldType": ft,
                "required": bool(item.required),
                "options": options,
                "options_list": options_list,
                "optionsList": options_list,
                "hidden_options": hidden_options,
                "hiddenOptions": hidden_options,
                "group_id": group_id,
                "groupId": group_id,
                "group_title": group_title,
                "groupTitle": group_title,
                "visibility_condition": vis_cond,
                "visibilityCondition": vis_cond,
                "placeholder": (item.placeholder or "").strip() or None,
                "accept": (item.accept or "").strip() or None,
                "max_file_size_mb": item.max_file_size_mb or item.maxFileSizeMb or None,
                "maxFileSizeMb": item.max_file_size_mb or item.maxFileSizeMb or None,
                "allow_multiple": bool(item.allow_multiple or item.allowMultiple),
                "allowMultiple": bool(item.allow_multiple or item.allowMultiple),
                "max_files": item.max_files or item.maxFiles or None,
                "maxFiles": item.max_files or item.maxFiles or None,
            })
            continue

        # Legacy field item: references a field registered in the field registry.
        if i not in known:
            raise HTTPException(
                status_code=400,
                detail=f"Field '{i}' is not registered for entity type '{et}'. Register it via POST /api/fields first.",
            )
        cleaned.append({
            "i": i,
            "x": max(0, item.x),
            "y": max(0, item.y),
            "w": w,
            "h": h,
            "isHeader": False,
            "isGroup": False,
            "label": item.label,
            "group_id": group_id,
            "groupId": group_id,
            "group_title": group_title,
            "groupTitle": group_title,
            "visibility_condition": vis_cond,
            "visibilityCondition": vis_cond,
        })

    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    if form:
        form.layout = cleaned
        form.cols = req.cols
        form.row_height = req.row_height
    else:
        form = EntityForm(
            entity_type=et,
            layout=cleaned,
            cols=req.cols,
            row_height=req.row_height,
        )
        db.add(form)

    db.commit()
    db.refresh(form)
    result = form.to_dict()
    fields = (
        db.query(EntityField).filter(EntityField.entity_type == et).order_by(EntityField.field_name).all()
    )
    result["fields"] = [f.to_dict() for f in fields]
    workflow_states, initial_state = _published_workflow_states(db, et)
    result["workflow_states"] = workflow_states
    result["initial_state"] = initial_state
    return result

@router.delete("/{entity_type}")
def delete_form(entity_type: str, db: Session = Depends(get_db)):
    et = entity_type.lower()
    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    if not form:
        raise HTTPException(status_code=404, detail=f"No form layout for entity type '{et}'")
    db.delete(form)
    db.commit()
    return {"deleted": True, "entity_type": et}