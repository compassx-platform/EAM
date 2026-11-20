"""Item, storeroom, balance, and reservation. Not tied to any one record type."""

from sqlalchemy import Column, Float, String, UniqueConstraint

from backend.database import Base
from backend.models.base import generate_uuid


class StockItem(Base):
    __tablename__ = "stock_item"
    __table_args__ = (UniqueConstraint("org_id", "itemnum", name="uq_stock_item"),)

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(50), nullable=False, index=True)
    itemnum = Column(String(50), nullable=False)
    description = Column(String(255), nullable=False, default="")
    unit_cost = Column(Float, nullable=False, default=0)


class Storeroom(Base):
    __tablename__ = "storeroom"
    __table_args__ = (UniqueConstraint("site_id", "storeroom", name="uq_storeroom"),)

    id = Column(String(36), primary_key=True, default=generate_uuid)
    site_id = Column(String(50), nullable=False, index=True)
    storeroom = Column(String(50), nullable=False)
    description = Column(String(255), nullable=False, default="")


class StockBalance(Base):
    __tablename__ = "stock_balance"
    __table_args__ = (UniqueConstraint("site_id", "storeroom", "itemnum", name="uq_stock_balance"),)

    id = Column(String(36), primary_key=True, default=generate_uuid)
    site_id = Column(String(50), nullable=False, index=True)
    storeroom = Column(String(50), nullable=False)
    itemnum = Column(String(50), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    unit_cost = Column(Float, nullable=False, default=0)


class StockReservation(Base):
    __tablename__ = "stock_reservation"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    holder_type = Column(String(50), nullable=False, index=True)
    holder_id = Column(String(36), nullable=False, index=True)
    site_id = Column(String(50), nullable=False)
    storeroom = Column(String(50), nullable=False)
    itemnum = Column(String(50), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
