from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class CompanySet(Base):
    """Company Set entity (Enterprise EAM SETS table with SETTYPE='COMPANY').

    Governs the scope of shared vendor and manufacturer master records across
    multiple legal organizations.
    """
    __tablename__ = "company_set"

    set_id = Column(String(50), primary_key=True)  # e.g. 'GLOBAL_SET', 'COMMERCIAL_SET'
    description = Column(String(255), nullable=True)
    # Enterprise EAM "Automatically Add Companies to Company Master" rule:
    # If False: new vendor must exist in Company Master (COMPMASTER) first.
    # If True: vendor added to Organization automatically creates COMPMASTER record.
    auto_add_companies = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE | INACTIVE
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    organizations = relationship("Organization", back_populates="company_set", lazy="selectin")
    company_masters = relationship("CompanyMaster", back_populates="company_set", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self):
        return {
            "set_id": self.set_id,
            "description": self.description,
            "auto_add_companies": self.auto_add_companies,
            "status": self.status,
            "organizations_count": len(self.organizations) if self.organizations else 0,
            "companies_count": len(self.company_masters) if self.company_masters else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class CompanyMaster(Base):
    """Company Master entity (Enterprise EAM COMPMASTER table).

    Lives at the Company Set level. Defines centralized corporate master vendor,
    manufacturer, and courier information shared by organizations in this set.
    """
    __tablename__ = "company_master"

    company = Column(String(50), primary_key=True)  # Enterprise COMPANY code (e.g. GRAINGER)
    company_set_id = Column(String(50), ForeignKey("company_set.set_id", ondelete="CASCADE"), primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(String(20), default="V", nullable=False)  # V=Vendor, M=Manufacturer, C=Courier, D=Disadvantaged, I=Internal
    currency_code = Column(String(10), default="USD", nullable=False)
    tax_id = Column(String(50), nullable=True)  # EIN, VAT, Federal Registration #
    homepage = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    fax = Column(String(50), nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state_province = Column(String(100), nullable=True)
    postal_code = Column(String(30), nullable=True)
    country = Column(String(100), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE | INACTIVE
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    company_set = relationship("CompanySet", back_populates="company_masters")

    def to_dict(self):
        return {
            "company": self.company,
            "company_set_id": self.company_set_id,
            "name": self.name,
            "type": self.type,
            "currency_code": self.currency_code,
            "tax_id": self.tax_id,
            "homepage": self.homepage,
            "phone": self.phone,
            "fax": self.fax,
            "address_line1": self.address_line1,
            "address_line2": self.address_line2,
            "city": self.city,
            "state_province": self.state_province,
            "postal_code": self.postal_code,
            "country": self.country,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Organization(Base):
    """Organization entity (Enterprise EAM ORGANIZATION table).

    Represents a distinct legal, financial, and accounting entity. Owns the Base Currency,
    Clearing Account, Financial Options, and assigns exactly one Company Set and Item Set.
    """
    __tablename__ = "organization"

    org_id = Column(String(50), primary_key=True)  # Enterprise ORGID (e.g. EAGLENA, EAGLEEU)
    name = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    company_set_id = Column(String(50), ForeignKey("company_set.set_id"), nullable=False)
    item_set_id = Column(String(50), default="ITEMSET1", nullable=False)
    base_currency_1 = Column(String(10), default="USD", nullable=False)
    base_currency_2 = Column(String(10), nullable=True)
    clearing_account = Column(String(100), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE | INACTIVE

    # Organization Options (Enterprise Select Action Options)
    purchasing_options = Column(JSON, default=dict, nullable=False)
    inventory_options = Column(JSON, default=dict, nullable=False)
    work_order_options = Column(JSON, default=dict, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    company_set = relationship("CompanySet", back_populates="organizations", lazy="selectin")
    sites = relationship("Site", back_populates="organization", cascade="all, delete-orphan", lazy="selectin")
    companies = relationship("CompanyOrg", back_populates="organization", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self):
        default_po = {
            "po_autonumber_prefix": "PO-",
            "receiving_tolerance_percent": 10.0,
            "auto_close_po": True,
            "tax_on_freight": False,
        }
        default_inv = {
            "costing_method": "AVERAGE",
            "allow_negative_balance": False,
            "abc_break_a": 80,
            "abc_break_b": 15,
        }
        default_wo = {
            "wo_autonumber_prefix": "WO-",
            "allow_history_editing": True,
            "require_actual_dates_on_completion": True,
            "track_asset_downtime": True,
        }

        return {
            "org_id": self.org_id,
            "name": self.name,
            "description": self.description,
            "company_set_id": self.company_set_id,
            "item_set_id": self.item_set_id,
            "base_currency_1": self.base_currency_1,
            "base_currency_2": self.base_currency_2,
            "clearing_account": self.clearing_account,
            "status": self.status,
            "purchasing_options": {**default_po, **(self.purchasing_options or {})},
            "inventory_options": {**default_inv, **(self.inventory_options or {})},
            "work_order_options": {**default_wo, **(self.work_order_options or {})},
            "sites_count": len(self.sites) if self.sites else 0,
            "companies_count": len(self.companies) if self.companies else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Site(Base):
    """Site entity (Enterprise EAM SITE table).

    Operational unit within an Organization (e.g. physical plant, facility, warehouse).
    """
    __tablename__ = "site"

    site_id = Column(String(50), primary_key=True)  # Enterprise SITEID (e.g. BEDFORD, NASHUA)
    org_id = Column(String(50), ForeignKey("organization.org_id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE | INACTIVE
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    organization = relationship("Organization", back_populates="sites")

    def to_dict(self):
        return {
            "site_id": self.site_id,
            "org_id": self.org_id,
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class CompanyOrg(Base):
    """Company record at Organization level (Enterprise EAM COMPANIES table).

    Represents local vendor terms, payment conditions, and local active/disabled status
    for a company within a specific Organization.
    """
    __tablename__ = "company_org"

    org_id = Column(String(50), ForeignKey("organization.org_id", ondelete="CASCADE"), primary_key=True)
    company = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(String(20), default="V", nullable=False)  # V=Vendor, M=Manufacturer, etc.
    currency_code = Column(String(10), default="USD", nullable=False)
    payment_terms = Column(String(50), default="NET30", nullable=False)
    freight_terms = Column(String(50), default="PREPAID", nullable=False)
    fob = Column(String(50), default="DESTINATION", nullable=False)
    customer_account_num = Column(String(100), nullable=True)
    tax_exempt = Column(Boolean, default=False, nullable=False)
    tax_code = Column(String(50), nullable=True)
    gl_account = Column(String(100), nullable=True)
    # Enterprise EAM local disable flag: allows an organization to disable/block a vendor locally
    # without modifying the global master record.
    disabled = Column(Boolean, default=False, nullable=False)
    remit_to_address = Column(String(255), nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    organization = relationship("Organization", back_populates="companies")

    def to_dict(self):
        return {
            "org_id": self.org_id,
            "company": self.company,
            "name": self.name,
            "type": self.type,
            "currency_code": self.currency_code,
            "payment_terms": self.payment_terms,
            "freight_terms": self.freight_terms,
            "fob": self.fob,
            "customer_account_num": self.customer_account_num,
            "tax_exempt": self.tax_exempt,
            "tax_code": self.tax_code,
            "gl_account": self.gl_account,
            "disabled": self.disabled,
            "remit_to_address": self.remit_to_address,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class CompanyContact(Base):
    """Company Contact entity (Enterprise EAM COMPCONTACT table).

    Can be defined at Set Master level (org_id is None) or Org level.
    """
    __tablename__ = "company_contact"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    company = Column(String(50), nullable=False, index=True)
    company_set_id = Column(String(50), nullable=False)
    org_id = Column(String(50), nullable=True)  # None = Master contact, or specific ORGID
    contact_name = Column(String(255), nullable=False)
    position = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "company": self.company,
            "company_set_id": self.company_set_id,
            "org_id": self.org_id,
            "contact_name": self.contact_name,
            "position": self.position,
            "phone": self.phone,
            "email": self.email,
            "is_primary": self.is_primary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
