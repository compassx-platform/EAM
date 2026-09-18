from datetime import datetime, time as dt_time
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.models.field_registry import EntityField
from backend.models.forms import EntityForm
from backend.services.list_service import get_latest_published

class FieldValidationError(Exception):
    def __init__(self, message: str, field_name: str = None):
        super().__init__(message)
        self.message = message
        self.field_name = field_name

TEXT_LIKE = {"text", "long_text", "email", "phone", "url"}
DATE_LIKE = {"date", "datetime"}
# Single-choice types validated against the field's option set.
SELECT_VALUE_TYPES = {"select", "selection", "dropdown"}

def _valid_options(field: EntityField, db: Session, form_item: Optional[dict] = None) -> List[str]:
    """Options for a select-style field — resolved from the form layout item first
    (the form builder is now the source of choice configuration), falling back to
    the legacy registry inline list or published list."""
    if form_item:
        list_key = form_item.get("optionsList") or form_item.get("options_list")
        if list_key:
            published = get_latest_published(db, str(list_key).strip().lower())
            if published:
                return [str(item) for item in (published.items or [])]
        opts = form_item.get("options") or form_item.get("select_options")
        if opts is not None:
            return [str(o).strip() for o in opts if str(o).strip()]
    if field.option_list_key:
        published = get_latest_published(db, field.option_list_key)
        if published:
            return [str(item) for item in (published.items or [])]
    return field.select_options or []

def validate_custom_fields(
    db: Session,
    entity_type: str,
    custom_fields: Dict[str, Any],
    is_create: bool = False
) -> Dict[str, Any]:
    """
    Validates custom_fields against registered EntityField schemas and active Form layout.
    Returns the sanitized/normalized custom_fields dict.
    """
    fields = db.query(EntityField).filter(EntityField.entity_type == entity_type.lower()).all()
    field_map = {f.field_name: f for f in fields}

    # Check if a custom form layout exists for this entity type
    form = db.query(EntityForm).filter(EntityForm.entity_type == entity_type.lower()).first()
    has_form_layout = bool(form and form.layout and len(form.layout) > 0)
    form_item_map: Dict[str, dict] = {}
    if has_form_layout:
        for item in form.layout:
            fname = item.get("fieldName") or item.get("field_name") or item.get("i")
            if fname:
                form_item_map[str(fname)] = item

    cleaned_fields = dict(custom_fields or {})

    if has_form_layout:
        # Validate required fields as defined by the active form layout
        for item in form.layout:
            if item.get("isHeader") or item.get("isGroup"):
                continue
            fname = item.get("fieldName") or item.get("field_name") or item.get("i")
            if not fname:
                continue
            is_req = bool(item.get("required"))
            val = cleaned_fields.get(fname)
            if is_req and is_create:
                if val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, list) and len(val) == 0):
                    label = item.get("label") or fname
                    raise FieldValidationError(f"Field '{label}' is required for {entity_type}", field_name=fname)
    else:
        # Fall back to entity field registry required flags
        for f in fields:
            val = cleaned_fields.get(f.field_name)
            if f.required and is_create and (val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, list) and len(val) == 0)):
                raise FieldValidationError(f"Field '{f.field_name}' is required for {entity_type}", field_name=f.field_name)

    # Type validation for provided values
    for f in fields:
        val = cleaned_fields.get(f.field_name)
        if val is None or val == "":
            continue

        if f.field_type == "number":
            try:
                cleaned_fields[f.field_name] = float(val) if "." in str(val) else int(val)
            except (ValueError, TypeError):
                raise FieldValidationError(f"Field '{f.field_name}' must be a number, got '{val}'", field_name=f.field_name)

        elif f.field_type in TEXT_LIKE or f.field_type == "boolean" or f.field_type == "checkbox_group":
            cleaned_fields[f.field_name] = str(val)

        elif f.field_type in SELECT_VALUE_TYPES:
            valid_options = _valid_options(f, db, form_item_map.get(f.field_name))
            if valid_options and str(val) not in valid_options:
                raise FieldValidationError(
                    f"Invalid option '{val}' for field '{f.field_name}'. Allowed: {valid_options}",
                    field_name=f.field_name
                )
            cleaned_fields[f.field_name] = str(val)

        elif f.field_type in DATE_LIKE:
            try:
                if isinstance(val, str):
                    datetime.fromisoformat(val.replace("Z", "+00:00"))
                cleaned_fields[f.field_name] = str(val)
            except ValueError:
                raise FieldValidationError(f"Field '{f.field_name}' must be a valid ISO date, got '{val}'", field_name=f.field_name)

        elif f.field_type == "time":
            try:
                if isinstance(val, str):
                    dt_time.fromisoformat(val)
                cleaned_fields[f.field_name] = str(val)
            except ValueError:
                raise FieldValidationError(f"Field '{f.field_name}' must be a valid time (HH:MM:SS), got '{val}'", field_name=f.field_name)

        elif f.field_type == "entity_reference":
            if val:
                ref_target = (f.reference_entity_type or "").strip().lower()
                if ref_target == "person":
                    from backend.models.person import Person
                    target_pid = str(val).strip().upper()
                    p = db.query(Person).filter(Person.person_id == target_pid).first()
                    if not p:
                        raise FieldValidationError(f"Referenced person '{val}' does not exist", field_name=f.field_name)
                    if p.status != "ACTIVE":
                        raise FieldValidationError(f"Referenced person '{val}' is not ACTIVE", field_name=f.field_name)
                    cleaned_fields[f.field_name] = p.person_id
                elif ref_target == "person_group":
                    from backend.models.person import PersonGroup
                    target_gname = str(val).strip().upper()
                    g = db.query(PersonGroup).filter(PersonGroup.group_name == target_gname).first()
                    if not g:
                        raise FieldValidationError(f"Referenced person group '{val}' does not exist", field_name=f.field_name)
                    cleaned_fields[f.field_name] = g.group_name
                else:
                    cleaned_fields[f.field_name] = str(val)
            else:
                cleaned_fields[f.field_name] = None

    return cleaned_fields
