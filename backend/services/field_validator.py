from datetime import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from backend.models.field_registry import EntityField

class FieldValidationError(Exception):
    def __init__(self, message: str, field_name: str = None):
        super().__init__(message)
        self.message = message
        self.field_name = field_name

def validate_custom_fields(
    db: Session,
    entity_type: str,
    custom_fields: Dict[str, Any],
    is_create: bool = False
) -> Dict[str, Any]:
    """
    Validates custom_fields against registered EntityField schemas (Section 3.2).
    Returns the sanitized/normalized custom_fields dict.
    """
    fields = db.query(EntityField).filter(EntityField.entity_type == entity_type.lower()).all()
    field_map = {f.field_name: f for f in fields}
    
    cleaned_fields = dict(custom_fields or {})
    
    for f in fields:
        val = cleaned_fields.get(f.field_name)
        
        # Check required on create or if value is explicitly null
        if f.required and is_create and (val is None or (isinstance(val, str) and not val.strip())):
            raise FieldValidationError(f"Field '{f.field_name}' is required for {entity_type}", field_name=f.field_name)
        
        if val is None or val == "":
            continue
            
        # Type validation
        if f.field_type == "number":
            try:
                cleaned_fields[f.field_name] = float(val) if "." in str(val) else int(val)
            except (ValueError, TypeError):
                raise FieldValidationError(f"Field '{f.field_name}' must be a number, got '{val}'", field_name=f.field_name)
                
        elif f.field_type == "text":
            cleaned_fields[f.field_name] = str(val)
            
        elif f.field_type == "select":
            valid_options = f.select_options or []
            if valid_options and str(val) not in valid_options:
                raise FieldValidationError(
                    f"Invalid option '{val}' for field '{f.field_name}'. Allowed: {valid_options}",
                    field_name=f.field_name
                )
            cleaned_fields[f.field_name] = str(val)
            
        elif f.field_type == "date":
            try:
                # Validate date / ISO string
                if isinstance(val, str):
                    datetime.fromisoformat(val.replace("Z", "+00:00"))
                cleaned_fields[f.field_name] = str(val)
            except ValueError:
                raise FieldValidationError(f"Field '{f.field_name}' must be a valid ISO date, got '{val}'", field_name=f.field_name)
                
        elif f.field_type == "entity_reference":
            cleaned_fields[f.field_name] = str(val) if val else None

    return cleaned_fields
