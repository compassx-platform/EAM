"""Helpers for the central versioned option/checklist list module.

Lists are referenced by list_key from the field registry and form builder.
The published snapshot (latest by published_at) is the immutable contract the
runtime validates against; drafts are editable without affecting live forms.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.base import generate_uuid, utc_now
from backend.models.lists import ListDefinition

VALID_KINDS = ("options", "checklist")

def get_draft(db: Session, list_key: str) -> Optional[ListDefinition]:
    return (
        db.query(ListDefinition)
        .filter(ListDefinition.list_key == list_key, ListDefinition.status == "draft")
        .first()
    )

def get_latest_published(db: Session, list_key: str) -> Optional[ListDefinition]:
    return (
        db.query(ListDefinition)
        .filter(
            ListDefinition.list_key == list_key,
            ListDefinition.status == "published",
        )
        .order_by(ListDefinition.published_at.desc())
        .first()
    )

def get_latest_any(db: Session, list_key: str) -> Optional[ListDefinition]:
    """Latest editable (draft) row, falling back to the latest published snapshot."""
    draft = get_draft(db, list_key)
    if draft:
        return draft
    return get_latest_published(db, list_key)

def publish_count(db: Session, list_key: str) -> int:
    return (
        db.query(ListDefinition)
        .filter(ListDefinition.list_key == list_key, ListDefinition.status.in_(["published", "deprecated"]))
        .count()
    )

def next_version_label(db: Session, list_key: str) -> str:
    return f"v{publish_count(db, list_key) + 1}"

def normalize_items(db: Session, kind: str, items: List[Any]) -> List[Any]:
    """Coerce free-form items into the canonical shape for each kind."""
    if kind == "checklist":
        cleaned = []
        for raw in items or []:
            if not isinstance(raw, dict):
                label = str(raw).strip()
                if not label:
                    continue
                cleaned.append({"label": label, "required": False, "assigned_role": None})
                continue
            label = str(raw.get("label") or raw.get("value") or "").strip()
            if not label:
                continue
            cleaned.append({
                "label": label,
                "required": bool(raw.get("required", False)),
                "assigned_role": (str(raw["assigned_role"]).strip() or None) if raw.get("assigned_role") else None,
            })
        # Deduplicate by label, keeping the first occurrence.
        seen = set()
        unique = []
        for item in cleaned:
            if item["label"] in seen:
                continue
            seen.add(item["label"])
            unique.append(item)
        return unique

    # Options kind: plain string values (deduplicated, non-empty).
    cleaned = []
    for raw in items or []:
        if isinstance(raw, dict):
            value = str(raw.get("value") or raw.get("label") or "").strip()
        else:
            value = str(raw).strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned

def resolved_items(db: Session, list_key: str) -> Optional[List[Any]]:
    published = get_latest_published(db, list_key)
    return published.items if published else None

def list_summaries(db: Session) -> List[Dict[str, Any]]:
    """Group rows by list_key into a summary per list (draft + latest published)."""
    rows = db.query(ListDefinition).order_by(ListDefinition.list_key, ListDefinition.created_at).all()

    by_key: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        summary = by_key.get(row.list_key)
        if not summary:
            summary = {
                "list_key": row.list_key,
                "kind": row.kind,
                "description": row.description,
                "exists": True,
                "draft": None,
                "latest_published": None,
                "published_count": row.status in ("published", "deprecated"),
            }
            by_key[row.list_key] = summary

        if row.status == "draft" and (summary["draft"] is None or (row.created_at or row.published_at) > (summary["draft"].get("created_at") or "")):
            summary["draft"] = row.to_dict()
        if row.status == "published":
            cur = summary["latest_published"]
            if cur is None or (row.published_at and cur.published_at and row.published_at > cur.published_at):
                summary["latest_published"] = row.to_dict()
            summary["published_count"] = True

    result = []
    for summary in by_key.values():
        draft = summary["draft"]
        latest = summary["latest_published"]
        result.append({
            "list_key": summary["list_key"],
            "kind": summary["kind"],
            "description": summary["description"],
            "item_count": len((latest or draft or {}).get("items") or []),
            "status": draft["status"] if draft else (latest["status"] if latest else "deprecated"),
            "published_version": latest["version_label"] if latest else None,
            "draft_item_count": len((draft or {}).get("items") or []),
            "has_draft": draft is not None,
            "created_at": (draft or latest or {}).get("created_at"),
            "published_at": (latest or {}).get("published_at"),
        })

    result.sort(key=lambda r: r["list_key"])
    return result

def usage(db: Session, list_key: str) -> Dict[str, Any]:
    """Where a list_key is currently referenced (fields + generic form items)."""
    from backend.models.field_registry import EntityField
    from backend.models.forms import EntityForm

    fields = (
        db.query(EntityField)
        .filter(EntityField.option_list_key == list_key)
        .order_by(EntityField.entity_type, EntityField.field_name)
        .all()
    )
    field_refs = [{"entity_type": f.entity_type, "field_name": f.field_name} for f in fields]

    form_refs = []
    for form in db.query(EntityForm).all():
        for item in form.layout or []:
            if not item.get("isHeader") and item.get("options_list") == list_key:
                form_refs.append({"entity_type": form.entity_type, "item_id": item.get("i")})

    return {
        "list_key": list_key,
        "fields": field_refs,
        "form_items": form_refs,
        "field_count": len(field_refs),
        "form_item_count": len(form_refs),
    }

def save_draft(db: Session, list_key: str, kind: str, items: List[Any], description: str = "") -> ListDefinition:
    """Create or update the single editable draft for a list_key."""
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid list kind '{kind}'. Allowed kinds: {list(VALID_KINDS)}")

    normalized = normalize_items(db, kind, items)
    existing = get_draft(db, list_key)
    if existing:
        existing.kind = kind
        existing.description = (description or "").strip() or None
        existing.items = normalized
        return existing

    draft = ListDefinition(
        id=generate_uuid(),
        list_key=list_key,
        kind=kind,
        description=(description or "").strip() or None,
        version_label="draft",
        status="draft",
        items=normalized,
        created_at=utc_now(),
    )
    db.add(draft)
    return draft

def publish_draft(db: Session, draft: ListDefinition) -> ListDefinition:
    """Publish a draft as a new immutable version, deprecating prior published."""
    prior = (
        db.query(ListDefinition)
        .filter(
            ListDefinition.list_key == draft.list_key,
            ListDefinition.status == "published",
            ListDefinition.id != draft.id,
        )
        .all()
    )
    for p in prior:
        p.status = "deprecated"

    draft.status = "published"
    draft.version_label = next_version_label(db, draft.list_key)
    draft.published_at = utc_now()
    return draft