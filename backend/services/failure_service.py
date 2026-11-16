from sqlalchemy.orm import Session

from backend.models.asset_hierarchy import Asset, Location
from backend.models.failure import FailureCode, FailureList

CHILD_OF = {"problem": "class", "cause": "problem", "remedy": "cause"}


class FailureError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _key(org_id: str, code: str) -> tuple[str, str]:
    org = (org_id or "").strip().upper()
    cleaned = (code or "").strip().upper()
    if not org or not cleaned:
        raise FailureError("A failure code needs an organization and a code.")
    return org, cleaned


def _description_for(db: Session, org_id: str, code: str) -> str:
    row = db.query(FailureCode).filter(FailureCode.org_id == org_id, FailureCode.code == code).first()
    return row.description if row else ""


def node_dict(db: Session, node: FailureList) -> dict:
    return node.to_dict(_description_for(db, node.org_id, node.code))


def list_nodes(db: Session, org_id: str) -> list[dict]:
    org = (org_id or "").strip().upper()
    rows = db.query(FailureList).filter(FailureList.org_id == org).all()
    return [node_dict(db, row) for row in rows]


def save_description(db: Session, org_id: str, code: str, description: str) -> FailureCode:
    org, cleaned = _key(org_id, code)
    text = (description or "").strip()
    if not text:
        raise FailureError("A failure code needs a description.")
    row = db.query(FailureCode).filter(FailureCode.org_id == org, FailureCode.code == cleaned).first()
    if not row:
        raise FailureError(f"Failure code '{cleaned}' is not in this organization.")
    row.description = text
    db.flush()
    return row


def place_node(db: Session, org_id: str, code: str, description: str, node_type: str, parent_id: str | None) -> FailureList:
    org, cleaned = _key(org_id, code)
    kind = (node_type or "").strip().lower()
    text = (description or "").strip()
    if kind not in ("class", "problem", "cause", "remedy"):
        raise FailureError("A failure node is a class, problem, cause, or remedy.")
    if not text:
        raise FailureError("A failure code needs a description.")

    parent = None
    if kind == "class":
        if parent_id:
            raise FailureError("A failure class has no parent.")
        existing = db.query(FailureList).filter(
            FailureList.org_id == org,
            FailureList.code == cleaned,
            FailureList.node_type == "class",
        ).first()
        if existing:
            raise FailureError(f"Failure class '{cleaned}' already exists.")
    else:
        if not parent_id:
            raise FailureError(f"A {kind} must sit under a {CHILD_OF[kind]}.")
        parent = db.query(FailureList).filter(FailureList.id == parent_id, FailureList.org_id == org).first()
        if not parent or parent.node_type != CHILD_OF[kind]:
            raise FailureError(f"A {kind} must sit under a {CHILD_OF[kind]}.")
        sibling = db.query(FailureList).filter(
            FailureList.org_id == org,
            FailureList.parent_id == parent.id,
            FailureList.code == cleaned,
        ).first()
        if sibling:
            raise FailureError(f"'{cleaned}' is already under this {parent.node_type}.")

    dictionary = db.query(FailureCode).filter(FailureCode.org_id == org, FailureCode.code == cleaned).first()
    if dictionary:
        dictionary.description = text
    else:
        db.add(FailureCode(id=f"{org}:{cleaned}", org_id=org, code=cleaned, description=text))

    node = FailureList(org_id=org, parent_id=parent.id if parent else None, code=cleaned, node_type=kind)
    db.add(node)
    db.flush()
    return node


def _descendants(db: Session, node: FailureList) -> list[FailureList]:
    children = db.query(FailureList).filter(FailureList.parent_id == node.id).all()
    found = list(children)
    for child in children:
        found.extend(_descendants(db, child))
    return found


def delete_node(db: Session, node_id: str) -> None:
    node = db.query(FailureList).filter(FailureList.id == node_id).first()
    if not node:
        raise FailureError("That failure node was not found.")
    if node.node_type == "class":
        used_asset = db.query(Asset).filter(Asset.org_id == node.org_id, Asset.failure_class_code == node.code).first()
        used_location = db.query(Location).filter(Location.org_id == node.org_id, Location.failure_class_code == node.code).first()
        if used_asset or used_location:
            raise FailureError(f"Failure class '{node.code}' is still used by an asset or a location.")
    for child in _descendants(db, node):
        db.delete(child)
    db.delete(node)
    db.flush()


def delete_code(db: Session, org_id: str, code: str) -> None:
    org, cleaned = _key(org_id, code)
    placed = db.query(FailureList).filter(FailureList.org_id == org, FailureList.code == cleaned).first()
    if placed:
        raise FailureError(f"'{cleaned}' is still placed in the failure list.")
    row = db.query(FailureCode).filter(FailureCode.org_id == org, FailureCode.code == cleaned).first()
    if not row:
        raise FailureError(f"Failure code '{cleaned}' is not in this organization.")
    db.delete(row)
    db.flush()


def require_failure_class(db: Session, org_id: str, code: str | None) -> str | None:
    if code is None:
        return None
    cleaned = code.strip().upper()
    if not cleaned:
        return None
    org = (org_id or "").strip().upper()
    node = db.query(FailureList).filter(
        FailureList.org_id == org,
        FailureList.code == cleaned,
        FailureList.node_type == "class",
    ).first()
    if not node:
        raise FailureError(f"'{cleaned}' is not a failure class in this organization.")
    return cleaned


def applicable_class(db: Session, site_id: str, asset_id: str) -> dict:
    site = (site_id or "").strip().upper()
    asset_key = (asset_id or "").strip().upper()
    asset = db.query(Asset).filter(Asset.site_id == site, Asset.asset_id == asset_key).first()
    if not asset:
        raise FailureError("Asset not found.")
    code = asset.failure_class_code
    source = "asset" if code else None
    if not code and asset.location_id:
        location = db.query(Location).filter(
            Location.site_id == asset.site_id,
            Location.location_id == asset.location_id,
        ).first()
        if location and location.type == "OPERATING" and location.failure_class_code:
            code = location.failure_class_code
            source = "location"
    return {
        "code": code,
        "description": _description_for(db, asset.org_id, code) if code else None,
        "source": source,
    }
