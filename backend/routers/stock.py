"""Company stock: items, storerooms, and on-hand balances."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.stock_service import save_item, save_storeroom, set_balance

router = APIRouter(prefix="/api/stock", tags=["Stock"])


class ItemIn(BaseModel):
    org_id: str
    itemnum: str
    description: Optional[str] = ""
    unit_cost: Optional[float] = 0


class StoreroomIn(BaseModel):
    site_id: str
    storeroom: str
    description: Optional[str] = ""


class BalanceIn(BaseModel):
    site_id: str
    storeroom: str
    itemnum: str
    quantity: float
    unit_cost: Optional[float] = None


@router.post("/items")
def upsert_item(req: ItemIn, db: Session = Depends(get_db)):
    row = save_item(db, req.org_id, req.itemnum, req.description or "", req.unit_cost or 0)
    db.commit()
    return {"id": row.id, "org_id": row.org_id, "itemnum": row.itemnum, "description": row.description, "unit_cost": row.unit_cost}


@router.post("/storerooms")
def upsert_storeroom(req: StoreroomIn, db: Session = Depends(get_db)):
    row = save_storeroom(db, req.site_id, req.storeroom, req.description or "")
    db.commit()
    return {"id": row.id, "site_id": row.site_id, "storeroom": row.storeroom, "description": row.description}


@router.post("/balances")
def upsert_balance(req: BalanceIn, db: Session = Depends(get_db)):
    row = set_balance(db, req.site_id, req.storeroom, req.itemnum, req.quantity, req.unit_cost)
    db.commit()
    return {
        "id": row.id,
        "site_id": row.site_id,
        "storeroom": row.storeroom,
        "itemnum": row.itemnum,
        "quantity": row.quantity,
        "unit_cost": row.unit_cost,
    }
