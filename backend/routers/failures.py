from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.organization import Organization
from backend.services.failure_service import (
    FailureError,
    applicable_class,
    delete_code,
    delete_node,
    list_nodes,
    node_dict,
    place_node,
    save_description,
)

router = APIRouter(prefix="/api", tags=["Failure classes"])


class FailureNodeIn(BaseModel):
    org_id: str
    code: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1, max_length=255)
    node_type: str
    parent_id: Optional[str] = None


class FailureDescriptionIn(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)


def _guard(action):
    try:
        return action()
    except FailureError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.get("/failure-nodes")
def get_failure_nodes(org_id: str = Query(...), db: Session = Depends(get_db)):
    return list_nodes(db, org_id)


@router.post("/failure-nodes", status_code=201)
def post_failure_node(data: FailureNodeIn, db: Session = Depends(get_db)):
    org = data.org_id.strip().upper()
    if not db.query(Organization).filter(Organization.org_id == org).first():
        raise HTTPException(status_code=400, detail=f"Organization '{org}' is not defined.")

    def action():
        node = place_node(db, org, data.code, data.description, data.node_type, data.parent_id)
        db.commit()
        db.refresh(node)
        return node_dict(db, node)

    return _guard(action)


@router.delete("/failure-nodes/{node_id}")
def remove_failure_node(node_id: str, db: Session = Depends(get_db)):
    def action():
        delete_node(db, node_id)
        db.commit()
        return {"deleted": True, "id": node_id}

    return _guard(action)


@router.put("/failure-codes/{org_id}/{code}")
def put_failure_code(org_id: str, code: str, data: FailureDescriptionIn, db: Session = Depends(get_db)):
    def action():
        row = save_description(db, org_id, code, data.description)
        db.commit()
        db.refresh(row)
        return row.to_dict()

    return _guard(action)


@router.delete("/failure-codes/{org_id}/{code}")
def remove_failure_code(org_id: str, code: str, db: Session = Depends(get_db)):
    def action():
        delete_code(db, org_id, code)
        db.commit()
        return {"deleted": True, "code": code.strip().upper()}

    return _guard(action)


@router.get("/failure-classes/applicable")
def get_applicable_class(site_id: str = Query(...), asset_id: str = Query(...), db: Session = Depends(get_db)):
    return _guard(lambda: applicable_class(db, site_id, asset_id))
