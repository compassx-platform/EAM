from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.entity_type import EntityTypeDefinition
from backend.models.field_registry import EntityField
from backend.models.report import ReportLayout

router = APIRouter(prefix="/reports", tags=["Reports"])

BLOCK_KINDS = {"heading", "text", "field", "row", "section", "header", "choices", "yes_no", "signoff", "table"}


class ReportBlockIn(BaseModel):
    id: str
    kind: str
    text: Optional[str] = None
    field_name: Optional[str] = None
    fields: Optional[List[str]] = None
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    left: Optional[str] = None
    right: Optional[str] = None
    columns: Optional[int] = None
    headers: Optional[List[str]] = None
    row_count: Optional[int] = None


class ReportWrite(BaseModel):
    entity_type: str
    name: str = Field(..., min_length=1, max_length=100)
    is_default: bool = False
    blocks: List[ReportBlockIn] = []


def _entity_key(entity_type: str) -> str:
    key = (entity_type or "").strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="Choose an entity for this print view.")
    return key


def _require_entity(db: Session, entity_type: str) -> str:
    key = _entity_key(entity_type)
    exists = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not exists:
        raise HTTPException(status_code=400, detail=f"Entity '{key}' is not defined.")
    return key


def _geometry(block: ReportBlockIn, fallback_y: int, fallback_h: int):
    if block.x is None and block.y is None and block.w is None and block.h is None:
        return 0, fallback_y, 12, fallback_h
    x = 0 if block.x is None else block.x
    y = fallback_y if block.y is None else block.y
    w = 12 if block.w is None else block.w
    h = fallback_h if block.h is None else block.h
    if x < 0 or y < 0 or w < 1 or w > 12 or h < 1 or h > 40 or x + w > 12:
        raise HTTPException(status_code=400, detail="A block must stay inside the 12 columns of the page.")
    return x, y, w, h


def _clean_blocks(db: Session, entity_type: str, blocks: List[ReportBlockIn]) -> list:
    known = {
        row.field_name
        for row in db.query(EntityField).filter(EntityField.entity_type == entity_type).all()
    }
    cleaned = []
    seen = set()
    cursor = 0
    for block in blocks:
        block_id = (block.id or "").strip()
        kind = (block.kind or "").strip()
        if not block_id or block_id in seen:
            raise HTTPException(status_code=400, detail="Each block needs its own id.")
        if kind not in BLOCK_KINDS:
            raise HTTPException(status_code=400, detail=f"Unknown block type '{kind}'.")
        seen.add(block_id)
        height = {"heading": 1, "section": 1, "header": 3, "text": 2, "choices": 6, "table": 6, "signoff": 4}.get(kind, 2)
        x, y, w, h = _geometry(block, cursor, height)
        cursor = max(cursor, y + h)
        item = {"id": block_id, "kind": kind, "x": x, "y": y, "w": w, "h": h}
        if kind in ("heading", "text", "section"):
            text = (block.text or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail="This block needs words.")
            item["text"] = text
        elif kind == "header":
            text = (block.text or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail="The document band needs a title.")
            item["text"] = text
            item["left"] = (block.left or "").strip()
            item["right"] = (block.right or "").strip()
        elif kind in ("field", "choices", "yes_no"):
            name = (block.field_name or "").strip().lower()
            if name not in known:
                raise HTTPException(status_code=400, detail=f"Field '{name or 'unset'}' is not on this entity.")
            item["field_name"] = name
            if kind == "choices":
                columns = block.columns or 2
                if columns < 1 or columns > 4:
                    raise HTTPException(status_code=400, detail="A choice grid uses 1 to 4 columns.")
                item["columns"] = columns
        elif kind == "signoff":
            text = (block.text or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail="A sign-off needs a role, such as Approver.")
            item["text"] = text
            names = []
            for raw in block.fields or []:
                name = (raw or "").strip().lower()
                if not name:
                    continue
                if name not in known:
                    raise HTTPException(status_code=400, detail=f"Field '{name}' is not on this entity.")
                names.append(name)
            item["fields"] = names[:3]
        elif kind == "table":
            text = (block.text or "").strip()
            headers = [part.strip() for part in (block.headers or []) if part and part.strip()]
            count = block.row_count or 5
            if not text:
                raise HTTPException(status_code=400, detail="A table needs a title.")
            if not headers or len(headers) > 8:
                raise HTTPException(status_code=400, detail="A table needs 1 to 8 column headings.")
            if count < 1 or count > 30:
                raise HTTPException(status_code=400, detail="A table needs between 1 and 30 blank rows.")
            item["text"] = text
            item["headers"] = headers
            item["row_count"] = count
        else:
            names = []
            for raw in block.fields or []:
                name = (raw or "").strip().lower()
                if name not in known:
                    raise HTTPException(status_code=400, detail=f"Field '{name}' is not on this entity.")
                names.append(name)
            if len(names) < 2 or len(names) > 3:
                raise HTTPException(status_code=400, detail="A row needs two or three fields.")
            item["fields"] = names
        cleaned.append(item)
    return cleaned


def _apply_default(db: Session, entity_type: str, layout: ReportLayout, is_default: bool) -> None:
    if is_default:
        others = db.query(ReportLayout).filter(
            ReportLayout.entity_type == entity_type,
            ReportLayout.id != layout.id,
            ReportLayout.is_default.is_(True),
        ).all()
        for other in others:
            other.is_default = False
    layout.is_default = is_default


@router.get("")
def list_reports(entity_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ReportLayout)
    if entity_type:
        query = query.filter(ReportLayout.entity_type == _entity_key(entity_type))
    rows = query.order_by(ReportLayout.entity_type, ReportLayout.name).all()
    return [row.to_dict() for row in rows]


@router.get("/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    row = db.query(ReportLayout).filter(ReportLayout.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Print view not found.")
    return row.to_dict()


@router.post("")
def create_report(payload: ReportWrite, db: Session = Depends(get_db)):
    entity_type = _require_entity(db, payload.entity_type)
    row = ReportLayout(
        entity_type=entity_type,
        name=payload.name.strip(),
        is_default=False,
        blocks=_clean_blocks(db, entity_type, payload.blocks),
    )
    db.add(row)
    db.flush()
    _apply_default(db, entity_type, row, payload.is_default)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.put("/{report_id}")
def update_report(report_id: str, payload: ReportWrite, db: Session = Depends(get_db)):
    row = db.query(ReportLayout).filter(ReportLayout.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Print view not found.")
    entity_type = _require_entity(db, payload.entity_type)
    row.entity_type = entity_type
    row.name = payload.name.strip()
    row.blocks = _clean_blocks(db, entity_type, payload.blocks)
    _apply_default(db, entity_type, row, payload.is_default)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.delete("/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    row = db.query(ReportLayout).filter(ReportLayout.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Print view not found.")
    db.delete(row)
    db.commit()
    return {"deleted": True, "id": report_id}
