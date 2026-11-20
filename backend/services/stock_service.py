"""Parameterized stock movements. Callers pass the item, room, and quantity."""

from typing import Optional

from sqlalchemy.orm import Session

from backend.models.stock import StockBalance, StockItem, StockReservation, Storeroom


class StockError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _up(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def save_item(db: Session, org_id: str, itemnum: str, description: str = "", unit_cost: float = 0) -> StockItem:
    org = _up(org_id)
    code = _up(itemnum)
    row = db.query(StockItem).filter(StockItem.org_id == org, StockItem.itemnum == code).first()
    if not row:
        row = StockItem(org_id=org, itemnum=code, description=description.strip(), unit_cost=float(unit_cost or 0))
        db.add(row)
    else:
        row.description = description.strip()
        row.unit_cost = float(unit_cost or 0)
    db.flush()
    return row


def save_storeroom(db: Session, site_id: str, storeroom: str, description: str = "") -> Storeroom:
    site = _up(site_id)
    code = _up(storeroom)
    row = db.query(Storeroom).filter(Storeroom.site_id == site, Storeroom.storeroom == code).first()
    if not row:
        row = Storeroom(site_id=site, storeroom=code, description=description.strip())
        db.add(row)
    else:
        row.description = description.strip()
    db.flush()
    return row


def set_balance(db: Session, site_id: str, storeroom: str, itemnum: str, quantity: float, unit_cost: Optional[float] = None) -> StockBalance:
    site = _up(site_id)
    room = _up(storeroom)
    code = _up(itemnum)
    row = (
        db.query(StockBalance)
        .filter(StockBalance.site_id == site, StockBalance.storeroom == room, StockBalance.itemnum == code)
        .first()
    )
    if not row:
        row = StockBalance(site_id=site, storeroom=room, itemnum=code, quantity=float(quantity or 0), unit_cost=float(unit_cost or 0))
        db.add(row)
    else:
        row.quantity = float(quantity or 0)
        if unit_cost is not None:
            row.unit_cost = float(unit_cost)
    db.flush()
    return row


def _balance(db: Session, site_id: str, storeroom: str, itemnum: str) -> Optional[StockBalance]:
    return (
        db.query(StockBalance)
        .filter(
            StockBalance.site_id == _up(site_id),
            StockBalance.storeroom == _up(storeroom),
            StockBalance.itemnum == _up(itemnum),
        )
        .first()
    )


def reserved_qty(db: Session, site_id: str, storeroom: str, itemnum: str) -> float:
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.site_id == _up(site_id),
            StockReservation.storeroom == _up(storeroom),
            StockReservation.itemnum == _up(itemnum),
        )
        .all()
    )
    return sum(float(row.quantity or 0) for row in rows)


def reserve(db: Session, site_id: str, storeroom: str, itemnum: str, quantity: float, holder_type: str, holder_id: str) -> StockReservation:
    need = float(quantity or 0)
    if need <= 0:
        raise StockError("A reservation needs a quantity greater than zero.")
    balance = _balance(db, site_id, storeroom, itemnum)
    on_hand = float(balance.quantity or 0) if balance else 0
    already = reserved_qty(db, site_id, storeroom, itemnum)
    if need > on_hand - already:
        raise StockError(f"Not enough {_up(itemnum)} in storeroom {_up(storeroom)} to reserve {need}.")
    row = StockReservation(
        holder_type=holder_type.strip().lower(),
        holder_id=holder_id,
        site_id=_up(site_id),
        storeroom=_up(storeroom),
        itemnum=_up(itemnum),
        quantity=need,
    )
    db.add(row)
    db.flush()
    return row


def release_holder(db: Session, holder_type: str, holder_id: str) -> int:
    rows = (
        db.query(StockReservation)
        .filter(StockReservation.holder_type == holder_type.strip().lower(), StockReservation.holder_id == holder_id)
        .all()
    )
    count = len(rows)
    for row in rows:
        db.delete(row)
    db.flush()
    return count


def issue(db: Session, site_id: str, storeroom: str, itemnum: str, quantity: float, holder_type: Optional[str] = None, holder_id: Optional[str] = None) -> StockBalance:
    qty = float(quantity or 0)
    balance = _balance(db, site_id, storeroom, itemnum)
    if not balance:
        raise StockError(f"{_up(itemnum)} is not stocked in {_up(storeroom)}.")
    if qty > 0:
        if float(balance.quantity or 0) < qty:
            raise StockError(f"Not enough {_up(itemnum)} on hand in {_up(storeroom)}.")
        balance.quantity = float(balance.quantity) - qty
        if holder_id and holder_type:
            reservation = (
                db.query(StockReservation)
                .filter(
                    StockReservation.holder_type == holder_type.strip().lower(),
                    StockReservation.holder_id == holder_id,
                    StockReservation.itemnum == _up(itemnum),
                    StockReservation.storeroom == _up(storeroom),
                )
                .first()
            )
            if reservation:
                reservation.quantity = max(0, float(reservation.quantity or 0) - qty)
                if reservation.quantity == 0:
                    db.delete(reservation)
    else:
        balance.quantity = float(balance.quantity) + abs(qty)
    db.flush()
    return balance
