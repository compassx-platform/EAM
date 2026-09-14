from datetime import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from backend.models.field_registry import EntityField
from backend.models.forms import EntityForm
from backend.services.list_service import get_latest_published

class FieldValidationError(Exception):
    def __init__(self, message: str, field_name: str = None):
        super().__init__(message)
        self.message = message
        self.field_name = field_name

def _valid_options(field: EntityField, db: Session) -> List[str]:
    """Options for a select field — inline list, or the published central list."""
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
                
        elif f.field_type == "text":
            cleaned_fields[f.field_name] = str(val)
            
        elif f.field_type == "select":
            valid_options = _valid_options(f, db)
            if valid_options and str(val) not in valid_options:
                raise FieldValidationError(
                    f"Invalid option '{val}' for field '{f.field_name}'. Allowed: {valid_options}",
                    field_name=f.field_name
                )
            cleaned_fields[f.field_name] = str(val)
            
        elif f.field_type == "date":
            try:
                if isinstance(val, str):
                    datetime.fromisoformat(val.replace("Z", "+00:00"))
                cleaned_fields[f.field_name] = str(val)
            except ValueError:
                raise FieldValidationError(f"Field '{f.field_name}' must be a valid ISO date, got '{val}'", field_name=f.field_name)
                
        elif f.field_type == "entity_reference":
            cleaned_fields[f.field_name] = str(val) if val else None

    return cleaned_fields
