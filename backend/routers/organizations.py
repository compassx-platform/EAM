from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database import get_db
from backend.models.organization import (
    CompanySet,
    CompanyMaster,
    Organization,
    Site,
    CompanyOrg,
    CompanyContact,
)

router = APIRouter(prefix="/api", tags=["Organizations & Company Sets"])


# ============================================================================
# Pydantic Request Schemas
# ============================================================================

class CompanySetCreate(BaseModel):
    set_id: str = Field(..., min_length=1, max_length=50, description="Company Set ID (e.g. GLOBAL_SET)")
    description: Optional[str] = None
    auto_add_companies: bool = Field(False, description="Automatically Add Companies to Company Master")
    status: str = "ACTIVE"


class CompanySetUpdate(BaseModel):
    description: Optional[str] = None
    auto_add_companies: Optional[bool] = None
    status: Optional[str] = None


class CompanyMasterCreate(BaseModel):
    company: str = Field(..., min_length=1, max_length=50, description="Company code (e.g. GRAINGER)")
    company_set_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    type: str = "V"  # V, M, C, D, I
    currency_code: str = "USD"
    tax_id: Optional[str] = None
    homepage: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    status: str = "ACTIVE"


class CompanyMasterUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    currency_code: Optional[str] = None
    tax_id: Optional[str] = None
    homepage: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None


class AddToOrgsRequest(BaseModel):
    org_ids: List[str]
    payment_terms: Optional[str] = "NET30"
    freight_terms: Optional[str] = "PREPAID"
    fob: Optional[str] = "DESTINATION"
    currency_code: Optional[str] = None


class OrganizationCreate(BaseModel):
    org_id: str = Field(..., min_length=1, max_length=50, description="Organization ID (e.g. EAGLENA)")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    company_set_id: str = Field(..., min_length=1, max_length=50)
    item_set_id: str = "ITEMSET1"
    base_currency_1: str = "USD"
    base_currency_2: Optional[str] = None
    clearing_account: Optional[str] = None
    status: str = "ACTIVE"
    purchasing_options: Optional[Dict[str, Any]] = None
    inventory_options: Optional[Dict[str, Any]] = None
    work_order_options: Optional[Dict[str, Any]] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    company_set_id: Optional[str] = None
    item_set_id: Optional[str] = None
    base_currency_1: Optional[str] = None
    base_currency_2: Optional[str] = None
    clearing_account: Optional[str] = None
    status: Optional[str] = None
    purchasing_options: Optional[Dict[str, Any]] = None
    inventory_options: Optional[Dict[str, Any]] = None
    work_order_options: Optional[Dict[str, Any]] = None


class SiteCreate(BaseModel):
    site_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = "ACTIVE"


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class CompanyOrgCreate(BaseModel):
    company: str = Field(..., min_length=1, max_length=50)
    name: Optional[str] = None
    type: Optional[str] = "V"
    currency_code: Optional[str] = None
    payment_terms: str = "NET30"
    freight_terms: str = "PREPAID"
    fob: str = "DESTINATION"
    customer_account_num: Optional[str] = None
    tax_exempt: bool = False
    tax_code: Optional[str] = None
    gl_account: Optional[str] = None
    disabled: bool = False
    remit_to_address: Optional[str] = None
    notes: Optional[str] = None


class CompanyOrgUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    currency_code: Optional[str] = None
    payment_terms: Optional[str] = None
    freight_terms: Optional[str] = None
    fob: Optional[str] = None
    customer_account_num: Optional[str] = None
    tax_exempt: Optional[bool] = None
    tax_code: Optional[str] = None
    gl_account: Optional[str] = None
    disabled: Optional[bool] = None
    remit_to_address: Optional[str] = None
    notes: Optional[str] = None


class CompanyContactCreate(BaseModel):
    company: str
    company_set_id: str
    org_id: Optional[str] = None
    contact_name: str
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: bool = False


# ============================================================================
# Company Sets API
# ============================================================================

@router.get("/company-sets")
def list_company_sets(
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(CompanySet)
    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(or_(CompanySet.set_id.ilike(s), CompanySet.description.ilike(s)))
    if status and status != "ALL":
        query = query.filter(CompanySet.status == status.upper())

    sets = query.order_by(CompanySet.set_id).all()
    return [cs.to_dict() for cs in sets]


@router.post("/company-sets", status_code=status.HTTP_201_CREATED)
def create_company_set(payload: CompanySetCreate, db: Session = Depends(get_db)):
    set_id = payload.set_id.strip().upper()
    existing = db.query(CompanySet).filter(CompanySet.set_id == set_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company Set '{set_id}' already exists."
        )

    cs = CompanySet(
        set_id=set_id,
        description=payload.description.strip() if payload.description else None,
        auto_add_companies=payload.auto_add_companies,
        status=payload.status.upper() if payload.status else "ACTIVE",
    )
    db.add(cs)
    db.commit()
    db.refresh(cs)
    return cs.to_dict()


@router.get("/company-sets/{set_id}")
def get_company_set(set_id: str, db: Session = Depends(get_db)):
    sid = set_id.strip().upper()
    cs = db.query(CompanySet).filter(CompanySet.set_id == sid).first()
    if not cs:
        raise HTTPException(status_code=404, detail=f"Company Set '{sid}' not found.")

    res = cs.to_dict()
    res["organizations"] = [
        {"org_id": org.org_id, "name": org.name, "status": org.status}
        for org in cs.organizations
    ]
    res["company_masters"] = [cm.to_dict() for cm in cs.company_masters]
    return res


@router.put("/company-sets/{set_id}")
def update_company_set(set_id: str, payload: CompanySetUpdate, db: Session = Depends(get_db)):
    sid = set_id.strip().upper()
    cs = db.query(CompanySet).filter(CompanySet.set_id == sid).first()
    if not cs:
        raise HTTPException(status_code=404, detail=f"Company Set '{sid}' not found.")

    if payload.description is not None:
        cs.description = payload.description.strip() or None
    if payload.auto_add_companies is not None:
        cs.auto_add_companies = bool(payload.auto_add_companies)
    if payload.status is not None:
        cs.status = payload.status.upper()

    db.commit()
    db.refresh(cs)
    return cs.to_dict()


@router.delete("/company-sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_set(set_id: str, db: Session = Depends(get_db)):
    sid = set_id.strip().upper()
    cs = db.query(CompanySet).filter(CompanySet.set_id == sid).first()
    if not cs:
        raise HTTPException(status_code=404, detail=f"Company Set '{sid}' not found.")

    # Enterprise EAM constraint: Cannot delete a company set if organizations reference it!
    org_count = db.query(Organization).filter(Organization.company_set_id == sid).count()
    if org_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete Company Set '{sid}' because it is assigned to {org_count} organization(s)."
        )

    db.delete(cs)
    db.commit()
    return None


# ============================================================================
# Company Master API (Set Level)
# ============================================================================

@router.get("/company-master")
def list_company_masters(
    company_set_id: Optional[str] = None,
    search: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(CompanyMaster)
    if company_set_id:
        query = query.filter(CompanyMaster.company_set_id == company_set_id.strip().upper())
    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(
            or_(
                CompanyMaster.company.ilike(s),
                CompanyMaster.name.ilike(s),
                CompanyMaster.city.ilike(s),
                CompanyMaster.country.ilike(s),
            )
        )
    if type and type != "ALL":
        query = query.filter(CompanyMaster.type == type.upper())
    if status and status != "ALL":
        query = query.filter(CompanyMaster.status == status.upper())

    masters = query.order_by(CompanyMaster.company).all()
    return [cm.to_dict() for cm in masters]


@router.post("/company-master", status_code=status.HTTP_201_CREATED)
def create_company_master(payload: CompanyMasterCreate, db: Session = Depends(get_db)):
    company = payload.company.strip().upper()
    set_id = payload.company_set_id.strip().upper()

    cs = db.query(CompanySet).filter(CompanySet.set_id == set_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail=f"Company Set '{set_id}' not found.")

    existing = db.query(CompanyMaster).filter(
        CompanyMaster.company == company,
        CompanyMaster.company_set_id == set_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company '{company}' already exists in Company Set '{set_id}'."
        )

    cm = CompanyMaster(
        company=company,
        company_set_id=set_id,
        name=payload.name.strip(),
        type=payload.type.upper() if payload.type else "V",
        currency_code=payload.currency_code.upper() if payload.currency_code else "USD",
        tax_id=payload.tax_id.strip() if payload.tax_id else None,
        homepage=payload.homepage.strip() if payload.homepage else None,
        phone=payload.phone.strip() if payload.phone else None,
        fax=payload.fax.strip() if payload.fax else None,
        address_line1=payload.address_line1.strip() if payload.address_line1 else None,
        address_line2=payload.address_line2.strip() if payload.address_line2 else None,
        city=payload.city.strip() if payload.city else None,
        state_province=payload.state_province.strip() if payload.state_province else None,
        postal_code=payload.postal_code.strip() if payload.postal_code else None,
        country=payload.country.strip() if payload.country else None,
        status=payload.status.upper() if payload.status else "ACTIVE",
    )
    db.add(cm)
    db.commit()
    db.refresh(cm)
    return cm.to_dict()


@router.get("/company-master/{company_set_id}/{company}")
def get_company_master(company_set_id: str, company: str, db: Session = Depends(get_db)):
    sid = company_set_id.strip().upper()
    comp = company.strip().upper()

    cm = db.query(CompanyMaster).filter(
        CompanyMaster.company == comp,
        CompanyMaster.company_set_id == sid,
    ).first()
    if not cm:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Company Set '{sid}'.")

    res = cm.to_dict()
    # Find organizations sharing this set that have added this company
    org_records = db.query(CompanyOrg).join(
        Organization, CompanyOrg.org_id == Organization.org_id
    ).filter(
        CompanyOrg.company == comp,
        Organization.company_set_id == sid,
    ).all()

    res["active_in_orgs"] = [o.to_dict() for o in org_records]
    contacts = db.query(CompanyContact).filter(
        CompanyContact.company == comp,
        CompanyContact.company_set_id == sid,
    ).all()
    res["contacts"] = [c.to_dict() for c in contacts]
    return res


@router.put("/company-master/{company_set_id}/{company}")
def update_company_master(
    company_set_id: str,
    company: str,
    payload: CompanyMasterUpdate,
    db: Session = Depends(get_db),
):
    sid = company_set_id.strip().upper()
    comp = company.strip().upper()

    cm = db.query(CompanyMaster).filter(
        CompanyMaster.company == comp,
        CompanyMaster.company_set_id == sid,
    ).first()
    if not cm:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Company Set '{sid}'.")

    if payload.name is not None:
        cm.name = payload.name.strip()
    if payload.type is not None:
        cm.type = payload.type.upper()
    if payload.currency_code is not None:
        cm.currency_code = payload.currency_code.upper()
    if payload.tax_id is not None:
        cm.tax_id = payload.tax_id.strip() or None
    if payload.homepage is not None:
        cm.homepage = payload.homepage.strip() or None
    if payload.phone is not None:
        cm.phone = payload.phone.strip() or None
    if payload.fax is not None:
        cm.fax = payload.fax.strip() or None
    if payload.address_line1 is not None:
        cm.address_line1 = payload.address_line1.strip() or None
    if payload.address_line2 is not None:
        cm.address_line2 = payload.address_line2.strip() or None
    if payload.city is not None:
        cm.city = payload.city.strip() or None
    if payload.state_province is not None:
        cm.state_province = payload.state_province.strip() or None
    if payload.postal_code is not None:
        cm.postal_code = payload.postal_code.strip() or None
    if payload.country is not None:
        cm.country = payload.country.strip() or None
    if payload.status is not None:
        cm.status = payload.status.upper()

    db.commit()
    db.refresh(cm)
    return cm.to_dict()


@router.delete("/company-master/{company_set_id}/{company}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_master(company_set_id: str, company: str, db: Session = Depends(get_db)):
    sid = company_set_id.strip().upper()
    comp = company.strip().upper()

    cm = db.query(CompanyMaster).filter(
        CompanyMaster.company == comp,
        CompanyMaster.company_set_id == sid,
    ).first()
    if not cm:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Company Set '{sid}'.")

    # Check if active in any organization
    active_in_orgs = db.query(CompanyOrg).join(
        Organization, CompanyOrg.org_id == Organization.org_id
    ).filter(
        CompanyOrg.company == comp,
        Organization.company_set_id == sid,
    ).count()

    if active_in_orgs > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete Company Master '{comp}' because it is active in {active_in_orgs} organization(s). Remove it from organizations first."
        )

    db.delete(cm)
    db.commit()
    return None


@router.post("/company-master/{company_set_id}/{company}/add-to-orgs")
def add_company_to_organizations(
    company_set_id: str,
    company: str,
    payload: AddToOrgsRequest,
    db: Session = Depends(get_db),
):
    """Enterprise EAM Action: 'Add Companies to Organization'.

    Rolls out this Company Master record to one or more organizations that belong
    to the same Company Set.
    """
    sid = company_set_id.strip().upper()
    comp = company.strip().upper()

    cm = db.query(CompanyMaster).filter(
        CompanyMaster.company == comp,
        CompanyMaster.company_set_id == sid,
    ).first()
    if not cm:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Company Set '{sid}'.")

    added_orgs = []
    skipped_orgs = []

    for org_id in payload.org_ids:
        oid = org_id.strip().upper()
        org = db.query(Organization).filter(Organization.org_id == oid).first()
        if not org or org.company_set_id != sid:
            skipped_orgs.append(oid)
            continue

        existing = db.query(CompanyOrg).filter(
            CompanyOrg.org_id == oid,
            CompanyOrg.company == comp,
        ).first()

        currency = payload.currency_code or org.base_currency_1 or cm.currency_code
        if existing:
            # Update local parameters if already present
            existing.payment_terms = payload.payment_terms or existing.payment_terms
            existing.freight_terms = payload.freight_terms or existing.freight_terms
            existing.fob = payload.fob or existing.fob
            existing.currency_code = currency
            added_orgs.append(oid)
        else:
            new_org_comp = CompanyOrg(
                org_id=oid,
                company=comp,
                name=cm.name,
                type=cm.type,
                currency_code=currency,
                payment_terms=payload.payment_terms or "NET30",
                freight_terms=payload.freight_terms or "PREPAID",
                fob=payload.fob or "DESTINATION",
                disabled=False,
            )
            db.add(new_org_comp)
            added_orgs.append(oid)

    db.commit()
    return {
        "company": comp,
        "company_set_id": sid,
        "added_to": added_orgs,
        "skipped": skipped_orgs,
    }


# ============================================================================
# Organizations API
# ============================================================================

@router.get("/organizations")
def list_organizations(
    company_set_id: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Organization)
    if company_set_id:
        query = query.filter(Organization.company_set_id == company_set_id.strip().upper())
    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(
            or_(
                Organization.org_id.ilike(s),
                Organization.name.ilike(s),
                Organization.description.ilike(s),
            )
        )
    if status and status != "ALL":
        query = query.filter(Organization.status == status.upper())

    orgs = query.order_by(Organization.org_id).all()
    return [org.to_dict() for org in orgs]


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db)):
    org_id = payload.org_id.strip().upper()
    existing = db.query(Organization).filter(Organization.org_id == org_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organization '{org_id}' already exists."
        )

    # Validate that Company Set exists
    set_id = payload.company_set_id.strip().upper()
    cs = db.query(CompanySet).filter(CompanySet.set_id == set_id).first()
    if not cs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Company Set '{set_id}' does not exist. Choose or create a valid Company Set."
        )

    org = Organization(
        org_id=org_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        company_set_id=set_id,
        item_set_id=payload.item_set_id.strip().upper() if payload.item_set_id else "ITEMSET1",
        base_currency_1=payload.base_currency_1.strip().upper() if payload.base_currency_1 else "USD",
        base_currency_2=payload.base_currency_2.strip().upper() if payload.base_currency_2 else None,
        clearing_account=payload.clearing_account.strip() if payload.clearing_account else None,
        status=payload.status.upper() if payload.status else "ACTIVE",
        purchasing_options=payload.purchasing_options or {},
        inventory_options=payload.inventory_options or {},
        work_order_options=payload.work_order_options or {},
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org.to_dict()


@router.get("/organizations/{org_id}")
def get_organization(org_id: str, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    res = org.to_dict()
    res["company_set"] = org.company_set.to_dict() if org.company_set else None
    res["sites"] = [s.to_dict() for s in org.sites]
    res["companies"] = [c.to_dict() for c in org.companies]
    return res


@router.put("/organizations/{org_id}")
def update_organization(org_id: str, payload: OrganizationUpdate, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    # Guard: Cannot change Company Set if companies exist! (Enterprise immutability rule)
    if payload.company_set_id is not None:
        new_set = payload.company_set_id.strip().upper()
        if new_set != org.company_set_id:
            comp_count = db.query(CompanyOrg).filter(CompanyOrg.org_id == oid).count()
            if comp_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot change Company Set for organization '{oid}' because {comp_count} companies are already associated with it."
                )
            cs = db.query(CompanySet).filter(CompanySet.set_id == new_set).first()
            if not cs:
                raise HTTPException(status_code=404, detail=f"Company Set '{new_set}' not found.")
            org.company_set_id = new_set

    if payload.name is not None:
        org.name = payload.name.strip()
    if payload.description is not None:
        org.description = payload.description.strip() or None
    if payload.item_set_id is not None:
        org.item_set_id = payload.item_set_id.strip().upper()
    if payload.base_currency_1 is not None:
        org.base_currency_1 = payload.base_currency_1.strip().upper()
    if payload.base_currency_2 is not None:
        org.base_currency_2 = payload.base_currency_2.strip().upper() or None
    if payload.clearing_account is not None:
        org.clearing_account = payload.clearing_account.strip() or None
    if payload.status is not None:
        org.status = payload.status.upper()
    if payload.purchasing_options is not None:
        org.purchasing_options = {**(org.purchasing_options or {}), **payload.purchasing_options}
    if payload.inventory_options is not None:
        org.inventory_options = {**(org.inventory_options or {}), **payload.inventory_options}
    if payload.work_order_options is not None:
        org.work_order_options = {**(org.work_order_options or {}), **payload.work_order_options}

    db.commit()
    db.refresh(org)
    return org.to_dict()


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(org_id: str, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    db.delete(org)
    db.commit()
    return None


# ============================================================================
# Sites API
# ============================================================================

@router.get("/sites")
def list_all_sites(org_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Site)
    if org_id:
        query = query.filter(Site.org_id == org_id.strip().upper())
    sites = query.order_by(Site.site_id).all()
    return [s.to_dict() for s in sites]


@router.get("/organizations/{org_id}/sites")
def list_sites(org_id: str, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    sites = db.query(Site).filter(Site.org_id == oid).order_by(Site.site_id).all()
    return [s.to_dict() for s in sites]


@router.post("/organizations/{org_id}/sites", status_code=status.HTTP_201_CREATED)
def create_site(org_id: str, payload: SiteCreate, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    sid = payload.site_id.strip().upper()
    existing = db.query(Site).filter(Site.site_id == sid).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Site '{sid}' already exists."
        )

    site = Site(
        site_id=sid,
        org_id=oid,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        status=payload.status.upper() if payload.status else "ACTIVE",
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return site.to_dict()


@router.put("/sites/{site_id}")
def update_site(site_id: str, payload: SiteUpdate, db: Session = Depends(get_db)):
    sid = site_id.strip().upper()
    site = db.query(Site).filter(Site.site_id == sid).first()
    if not site:
        raise HTTPException(status_code=404, detail=f"Site '{sid}' not found.")

    if payload.name is not None:
        site.name = payload.name.strip()
    if payload.description is not None:
        site.description = payload.description.strip() or None
    if payload.status is not None:
        site.status = payload.status.upper()

    db.commit()
    db.refresh(site)
    return site.to_dict()


@router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: str, db: Session = Depends(get_db)):
    sid = site_id.strip().upper()
    site = db.query(Site).filter(Site.site_id == sid).first()
    if not site:
        raise HTTPException(status_code=404, detail=f"Site '{sid}' not found.")

    db.delete(site)
    db.commit()
    return None


# ============================================================================
# Organization Companies API (Enterprise COMPANIES table)
# ============================================================================

@router.get("/organizations/{org_id}/companies")
def list_org_companies(
    org_id: str,
    search: Optional[str] = None,
    type: Optional[str] = None,
    disabled: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    query = db.query(CompanyOrg).filter(CompanyOrg.org_id == oid)
    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(or_(CompanyOrg.company.ilike(s), CompanyOrg.name.ilike(s)))
    if type and type != "ALL":
        query = query.filter(CompanyOrg.type == type.upper())
    if disabled is not None:
        query = query.filter(CompanyOrg.disabled == disabled)

    companies = query.order_by(CompanyOrg.company).all()
    return [c.to_dict() for c in companies]


@router.get("/companies")
def list_all_org_companies(
    org_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Global lookup across organizations."""
    query = db.query(CompanyOrg)
    if org_id:
        query = query.filter(CompanyOrg.org_id == org_id.strip().upper())
    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(or_(CompanyOrg.company.ilike(s), CompanyOrg.name.ilike(s)))

    comps = query.order_by(CompanyOrg.org_id, CompanyOrg.company).all()
    return [c.to_dict() for c in comps]


@router.post("/organizations/{org_id}/companies", status_code=status.HTTP_201_CREATED)
def add_company_to_organization(
    org_id: str,
    payload: CompanyOrgCreate,
    db: Session = Depends(get_db),
):
    """Add a company to an organization.

    Enforces Enterprise EAM 'Automatically Add Companies to Company Master' logic:
    - If company exists in Company Master for this org's Company Set: inherits & creates org entry.
    - If company does NOT exist in Company Master:
      - If auto_add_companies == False: reject with Enterprise error.
      - If auto_add_companies == True: auto-create in Company Master, then add to org.
    """
    oid = org_id.strip().upper()
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization '{oid}' not found.")

    comp = payload.company.strip().upper()
    existing_org_comp = db.query(CompanyOrg).filter(
        CompanyOrg.org_id == oid,
        CompanyOrg.company == comp,
    ).first()
    if existing_org_comp:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company '{comp}' is already associated with organization '{oid}'."
        )

    # Check Company Master at Set level
    set_id = org.company_set_id
    cm = db.query(CompanyMaster).filter(
        CompanyMaster.company == comp,
        CompanyMaster.company_set_id == set_id,
    ).first()

    company_set = org.company_set
    if not cm:
        # Check Enterprise EAM auto_add_companies rule!
        if not company_set.auto_add_companies:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Company '{comp}' does not exist in Company Set '{set_id}'. "
                    f"Create it in Company Master first or enable 'Automatically Add Companies to Company Master' on Company Set '{set_id}'."
                )
            )
        # If auto_add_companies is True: auto-create in Company Master
        cm = CompanyMaster(
            company=comp,
            company_set_id=set_id,
            name=payload.name.strip() if payload.name else comp,
            type=payload.type.upper() if payload.type else "V",
            currency_code=payload.currency_code.upper() if payload.currency_code else org.base_currency_1,
            status="ACTIVE",
        )
        db.add(cm)
        db.flush()

    name = payload.name.strip() if payload.name else cm.name
    comp_type = payload.type.upper() if payload.type else cm.type
    currency = payload.currency_code.upper() if payload.currency_code else (cm.currency_code or org.base_currency_1)

    org_comp = CompanyOrg(
        org_id=oid,
        company=comp,
        name=name,
        type=comp_type,
        currency_code=currency,
        payment_terms=payload.payment_terms or "NET30",
        freight_terms=payload.freight_terms or "PREPAID",
        fob=payload.fob or "DESTINATION",
        customer_account_num=payload.customer_account_num.strip() if payload.customer_account_num else None,
        tax_exempt=payload.tax_exempt,
        tax_code=payload.tax_code.strip() if payload.tax_code else None,
        gl_account=payload.gl_account.strip() if payload.gl_account else None,
        disabled=payload.disabled,
        remit_to_address=payload.remit_to_address.strip() if payload.remit_to_address else None,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(org_comp)
    db.commit()
    db.refresh(org_comp)
    return org_comp.to_dict()


@router.get("/companies/{org_id}/{company}")
def get_company_org(org_id: str, company: str, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    comp = company.strip().upper()

    co = db.query(CompanyOrg).filter(
        CompanyOrg.org_id == oid,
        CompanyOrg.company == comp,
    ).first()
    if not co:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Organization '{oid}'.")

    res = co.to_dict()
    # Also fetch master information
    org = db.query(Organization).filter(Organization.org_id == oid).first()
    if org:
        cm = db.query(CompanyMaster).filter(
            CompanyMaster.company == comp,
            CompanyMaster.company_set_id == org.company_set_id,
        ).first()
        res["master_info"] = cm.to_dict() if cm else None

    contacts = db.query(CompanyContact).filter(
        CompanyContact.company == comp,
        CompanyContact.org_id == oid,
    ).all()
    res["contacts"] = [c.to_dict() for c in contacts]
    return res


@router.put("/companies/{org_id}/{company}")
def update_company_org(
    org_id: str,
    company: str,
    payload: CompanyOrgUpdate,
    db: Session = Depends(get_db),
):
    oid = org_id.strip().upper()
    comp = company.strip().upper()

    co = db.query(CompanyOrg).filter(
        CompanyOrg.org_id == oid,
        CompanyOrg.company == comp,
    ).first()
    if not co:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Organization '{oid}'.")

    if payload.name is not None:
        co.name = payload.name.strip()
    if payload.type is not None:
        co.type = payload.type.upper()
    if payload.currency_code is not None:
        co.currency_code = payload.currency_code.upper()
    if payload.payment_terms is not None:
        co.payment_terms = payload.payment_terms.strip()
    if payload.freight_terms is not None:
        co.freight_terms = payload.freight_terms.strip()
    if payload.fob is not None:
        co.fob = payload.fob.strip()
    if payload.customer_account_num is not None:
        co.customer_account_num = payload.customer_account_num.strip() or None
    if payload.tax_exempt is not None:
        co.tax_exempt = bool(payload.tax_exempt)
    if payload.tax_code is not None:
        co.tax_code = payload.tax_code.strip() or None
    if payload.gl_account is not None:
        co.gl_account = payload.gl_account.strip() or None
    if payload.disabled is not None:
        co.disabled = bool(payload.disabled)
    if payload.remit_to_address is not None:
        co.remit_to_address = payload.remit_to_address.strip() or None
    if payload.notes is not None:
        co.notes = payload.notes.strip() or None

    db.commit()
    db.refresh(co)
    return co.to_dict()


@router.delete("/companies/{org_id}/{company}", status_code=status.HTTP_204_NO_CONTENT)
def remove_company_from_organization(org_id: str, company: str, db: Session = Depends(get_db)):
    oid = org_id.strip().upper()
    comp = company.strip().upper()

    co = db.query(CompanyOrg).filter(
        CompanyOrg.org_id == oid,
        CompanyOrg.company == comp,
    ).first()
    if not co:
        raise HTTPException(status_code=404, detail=f"Company '{comp}' not found in Organization '{oid}'.")

    db.delete(co)
    db.commit()
    return None


# ============================================================================
# Company Contacts API
# ============================================================================

@router.get("/company-contacts")
def list_company_contacts(
    company: str,
    company_set_id: str,
    org_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(CompanyContact).filter(
        CompanyContact.company == company.strip().upper(),
        CompanyContact.company_set_id == company_set_id.strip().upper(),
    )
    if org_id:
        query = query.filter(CompanyContact.org_id == org_id.strip().upper())

    contacts = query.order_by(CompanyContact.contact_name).all()
    return [c.to_dict() for c in contacts]


@router.post("/company-contacts", status_code=status.HTTP_201_CREATED)
def create_company_contact(payload: CompanyContactCreate, db: Session = Depends(get_db)):
    contact = CompanyContact(
        company=payload.company.strip().upper(),
        company_set_id=payload.company_set_id.strip().upper(),
        org_id=payload.org_id.strip().upper() if payload.org_id else None,
        contact_name=payload.contact_name.strip(),
        position=payload.position.strip() if payload.position else None,
        phone=payload.phone.strip() if payload.phone else None,
        email=payload.email.strip() if payload.email else None,
        is_primary=payload.is_primary,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact.to_dict()


@router.delete("/company-contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_contact(contact_id: str, db: Session = Depends(get_db)):
    c = db.query(CompanyContact).filter(CompanyContact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Contact '{contact_id}' not found.")

    db.delete(c)
    db.commit()
    return None
