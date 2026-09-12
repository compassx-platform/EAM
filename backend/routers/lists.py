from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.lists import ListDefinition
from backend.models.base import generate_uuid, utc_now
from backend.services import list_service

router = APIRouter(prefix="/lists", tags=["Option & Checklist Lists"])

class ListDraftRequest(BaseModel):
    list_key: str
    kind: str = "options"  # 'options' | 'checklist'
    description: Optional[str] = ""
    items: List[Any] = []

class ListItem(BaseModel):
    label: Optional[str] = None
    value: Optional[str] = None
    required: Optional[bool] = None
    assigned_role: Optional[str] = None

def _validate_key(key: str) -> str:
    """Snake-case identifier for a list_key."""
    key = key.strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="list_key is required")
    if len(key) > 100:
        raise HTTPException(status_code=400, detail="list_key must be 100 characters or fewer")
    return key

def _unpack_items(raw_items: List[Any]) -> List[Any]:
    """Accept either strings (options) or ListItem dicts; strip empty values."""
    cleaned = []
    for item in raw_items:
        if isinstance(item, ListItem):
            item = item.model_dump()
        if isinstance(item, dict):
            value = (item.get("value") or item.get("label") or "").strip()
            if not any((value, item.get("required"), item.get("assigned_role"))):
                continue
            cleaned.append(item)
        else:
            text = str(item).strip()
            if text:
                cleaned.append(text)
    return cleaned

@router.get("")
def list_lists(db: Session = Depends(get_db)):
    """Summaries for every list_key (draft + latest published)."""
    return list_service.list_summaries(db)

@router.get("/resolved")
def resolve_lists(
    keys: str = Query(..., description="Comma-separated list_keys of published lists to resolve"),
    db: Session = Depends(get_db),
):
    """Latest published snapshot per requested key for runtime rendering."""
    resolved: Dict[str, Any] = {}
    seen = set()
    for key in keys.split(","):
        key = key.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        published = list_service.get_latest_published(db, key)
        if not published:
            continue
        resolved[key] = {
            "list_key": key,
            "kind": published.kind,
            "version_label": published.version_label,
            "items": published.items or [],
        }
    return {"resolved": resolved}

@router.get("/{list_key}")
def get_list(list_key: str, db: Session = Depends(get_db)):
    """Latest editable content for a list (draft if present, else latest published)."""
    key = _validate_key(list_key)
    entry = list_service.get_latest_any(db, key)
    if not entry:
        raise HTTPException(status_code=404, detail=f"List '{key}' not found")
    return entry.to_dict()

@router.get("/{list_key}/versions")
def list_versions(list_key: str, db: Session = Depends(get_db)):
    """Every published/deprecated snapshot for the list_key, newest first."""
    key = _validate_key(list_key)
    rows = (
        db.query(ListDefinition)
        .filter(ListDefinition.list_key == key, ListDefinition.status.in_(["published", "deprecated"]))
        .order_by(ListDefinition.published_at.desc())
        .all()
    )
    return [r.to_dict() for r in rows]

@router.post("/draft")
def save_draft(req: ListDraftRequest, db: Session = Depends(get_db)):
    """Create or update the single editable draft for a list_key."""
    key = _validate_key(req.list_key)
    if req.kind not in list_service.VALID_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid list kind '{req.kind}'. Allowed kinds: {list(list_service.VALID_KINDS)}"
        )
    items = _unpack_items(req.items)
    items = list_service.normalize_items(db, req.kind, items)
    if not items:
        raise HTTPException(status_code=400, detail="A list must contain at least one item")

    draft = list_service.save_draft(db, key, req.kind, items, req.description or "")
    db.commit()
    db.refresh(draft)
    return draft.to_dict()

@router.post("/{list_key}/publish")
def publish_list(list_key: str, db: Session = Depends(get_db)):
    """Validate and publish the draft as a new immutable snapshot."""
    key = _validate_key(list_key)
    draft = list_service.get_draft(db, key)
    if not draft:
        raise HTTPException(status_code=404, detail=f"No draft found for list '{key}'")
    if not draft.items:
        raise HTTPException(status_code=400, detail="Cannot publish an empty list draft")

    published = list_service.publish_draft(db, draft)
    db.commit()
    db.refresh(published)
    return {"published": True, "list": published.to_dict()}

@router.get("/{list_key}/usages")
def list_usages(list_key: str, db: Session = Depends(get_db)):
    """Where a list_key is referenced (field registry + form items)."""
    key = _validate_key(list_key)
    return list_service.usage(db, key)

@router.delete("/{list_key}")
def delete_list(list_key: str, db: Session = Depends(get_db)):
    """Delete all rows for a list_key. Blocked while referenced by fields or forms."""
    key = _validate_key(list_key)
    usage = list_service.usage(db, key)
    if usage["field_count"] + usage["form_item_count"] > 0:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"List '{key}' is still referenced and cannot be deleted",
                "fields": usage["fields"],
                "form_items": usage["form_items"],
                "field_count": usage["field_count"],
                "form_item_count": usage["form_item_count"],
            },
        )
    rows = db.query(ListDefinition).filter(ListDefinition.list_key == key).all()
    for row in rows:
        db.delete(row)
    db.commit()
    return {"deleted": True, "list_key": key}