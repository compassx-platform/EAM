from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from backend.database import get_db
from backend.models.classification import (
    AssetAttribute,
    Classification,
    ClassSpec,
    AssetSpec,
    LocationSpec,
)
from backend.models.asset_hierarchy import Location, Asset

router = APIRouter(prefix="/api", tags=["Classifications & Specifications"])


# ---- Pydantic Schemas ----

class AssetAttributeCreate(BaseModel):
    attribute_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    data_type: str = "ALN"  # ALN | NUMERIC | TABLE | DATE | YORN
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "ACTIVE"


class AssetAttributeUpdate(BaseModel):
    description: Optional[str] = None
    data_type: Optional[str] = None
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: Optional[str] = None


class ClassSpecCreate(BaseModel):
    attribute_id: str = Field(..., min_length=1, max_length=50)
    section: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "ALN"  # ALN | NUMERIC | TABLE | DATE | YORN
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    default_value: Optional[str] = None
    mandatory: bool = False
    apply_down_hierarchy: bool = True
    display_sequence: int = 1


class ClassSpecUpdate(BaseModel):
    section: Optional[str] = None
    description: Optional[str] = None
    data_type: Optional[str] = None
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    default_value: Optional[str] = None
    mandatory: Optional[bool] = None
    apply_down_hierarchy: Optional[bool] = None
    display_sequence: Optional[int] = None


class ClassificationCreate(BaseModel):
    classstructure_id: Optional[str] = None
    classification_id: str = Field(..., min_length=1, max_length=50)
    parent_classstructure_id: Optional[str] = None
    description: str = Field(..., min_length=1, max_length=255)
    hierarchy_path: Optional[str] = None
    use_with: List[str] = ["ASSET", "LOCATIONS"]
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "ACTIVE"
    attributes: Optional[List[ClassSpecCreate]] = None


class ClassificationUpdate(BaseModel):
    classification_id: Optional[str] = None
    parent_classstructure_id: Optional[str] = None
    description: Optional[str] = None
    hierarchy_path: Optional[str] = None
    use_with: Optional[List[str]] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: Optional[str] = None


class SpecValueItem(BaseModel):
    attribute_id: str
    section: Optional[str] = None
    aln_value: Optional[str] = None
    num_value: Optional[float] = None
    date_value: Optional[datetime] = None
    unit_of_measure: Optional[str] = None


class ClassificationAssignUpdate(BaseModel):
    classstructure_id: Optional[str] = None
    specs: Optional[List[SpecValueItem]] = None


# ---- Helper Functions ----

def _build_hierarchy_path(db: Session, classification_id: str, parent_id: Optional[str]) -> str:
    clean_id = classification_id.strip().upper()
    if not parent_id:
        return clean_id
    parent = db.query(Classification).filter(Classification.classstructure_id == parent_id).first()
    if parent:
        return f"{parent.hierarchy_path} \\ {clean_id}"
    return clean_id


def _get_all_attributes_for_classification(db: Session, classstructure_id: str) -> List[Dict[str, Any]]:
    """Traverse up the hierarchy collecting local and inherited attributes honoring apply_down_hierarchy."""
    collected_attrs: Dict[str, Dict[str, Any]] = {}
    target_cls = db.query(Classification).filter(Classification.classstructure_id == classstructure_id).first()
    if not target_cls:
        return []

    # First collect target classification's own attributes (they override ancestor settings)
    for attr in target_cls.attributes:
        d = attr.to_dict()
        d["inherited_from"] = None
        d["inherited_from_path"] = None
        collected_attrs[attr.attribute_id] = d

    # Traverse ancestors upwards
    current_id: Optional[str] = target_cls.parent_classstructure_id
    while current_id:
        curr_cls = db.query(Classification).filter(Classification.classstructure_id == current_id).first()
        if not curr_cls:
            break
        for attr in curr_cls.attributes:
            if attr.apply_down_hierarchy and attr.attribute_id not in collected_attrs:
                d = attr.to_dict()
                d["inherited_from"] = current_id
                d["inherited_from_path"] = curr_cls.hierarchy_path
                collected_attrs[attr.attribute_id] = d
        current_id = curr_cls.parent_classstructure_id

    return sorted(list(collected_attrs.values()), key=lambda x: x.get("display_sequence", 1))


# ==============================================================================
# ---- Master Attribute Catalog Endpoints (ASSETATTRIBUTE Dictionary) ----
# ==============================================================================

@router.get("/attributes")
def list_master_attributes(
    org_id: Optional[str] = None,
    site_id: Optional[str] = None,
    data_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Returns the Master Attribute Catalog dictionary with usage metrics across classifications."""
    query = db.query(AssetAttribute)
    if status:
        query = query.filter(AssetAttribute.status == status.strip().upper())
    if data_type:
        query = query.filter(AssetAttribute.data_type == data_type.strip().upper())
    if org_id:
        query = query.filter(or_(AssetAttribute.org_id == org_id.strip().upper(), AssetAttribute.org_id.is_(None)))
    if site_id:
        query = query.filter(or_(AssetAttribute.site_id == site_id.strip().upper(), AssetAttribute.site_id.is_(None)))

    all_attrs = query.order_by(AssetAttribute.attribute_id.asc()).all()

    if search:
        s = search.strip().lower()
        all_attrs = [
            a for a in all_attrs
            if s in a.attribute_id.lower()
            or s in a.description.lower()
            or (a.unit_of_measure and s in a.unit_of_measure.lower())
        ]

    return [a.to_dict(include_usage=True) for a in all_attrs]


@router.get("/attributes/{attribute_id}")
def get_master_attribute(
    attribute_id: str,
    db: Session = Depends(get_db),
):
    """Retrieves a single Master Attribute specification from the enterprise catalog."""
    aid = attribute_id.strip().upper()
    attr = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == aid).first()
    if not attr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Master attribute '{aid}' not found in catalog.",
        )
    return attr.to_dict(include_usage=True)


@router.post("/attributes", status_code=status.HTTP_201_CREATED)
def create_master_attribute(
    data: AssetAttributeCreate,
    db: Session = Depends(get_db),
):
    """Registers a new reusable Master Attribute in the enterprise catalog."""
    aid = data.attribute_id.strip().upper()
    existing = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == aid).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Master attribute '{aid}' already exists in catalog.",
        )

    attr = AssetAttribute(
        attribute_id=aid,
        description=data.description.strip(),
        data_type=data.data_type.upper(),
        unit_of_measure=data.unit_of_measure.strip() if data.unit_of_measure else None,
        domain_id=data.domain_id.strip().upper() if data.domain_id else None,
        domain_values=data.domain_values,
        org_id=data.org_id.strip().upper() if data.org_id else None,
        site_id=data.site_id.strip().upper() if data.site_id else None,
        status=data.status.upper(),
    )
    db.add(attr)
    db.commit()
    db.refresh(attr)
    return attr.to_dict(include_usage=True)


@router.put("/attributes/{attribute_id}")
def update_master_attribute(
    attribute_id: str,
    data: AssetAttributeUpdate,
    db: Session = Depends(get_db),
):
    """Updates global definition of a Master Attribute."""
    aid = attribute_id.strip().upper()
    attr = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == aid).first()
    if not attr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Master attribute '{aid}' not found in catalog.",
        )

    if data.description is not None:
        attr.description = data.description.strip()
    if data.data_type is not None:
        attr.data_type = data.data_type.upper()
    if data.unit_of_measure is not None:
        attr.unit_of_measure = data.unit_of_measure.strip() if data.unit_of_measure else None
    if data.domain_id is not None:
        attr.domain_id = data.domain_id.strip().upper() if data.domain_id else None
    if data.domain_values is not None:
        attr.domain_values = data.domain_values
    if data.org_id is not None:
        attr.org_id = data.org_id.strip().upper() if data.org_id else None
    if data.site_id is not None:
        attr.site_id = data.site_id.strip().upper() if data.site_id else None
    if data.status is not None:
        attr.status = data.status.upper()

    db.commit()
    db.refresh(attr)
    return attr.to_dict(include_usage=True)


@router.delete("/attributes/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_master_attribute(
    attribute_id: str,
    db: Session = Depends(get_db),
):
    """Deletes a Master Attribute if it is not currently referenced in any classification spec."""
    aid = attribute_id.strip().upper()
    attr = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == aid).first()
    if not attr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Master attribute '{aid}' not found in catalog.",
        )

    usage_count = db.query(ClassSpec).filter(ClassSpec.attribute_id == aid).count()
    if usage_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete master attribute '{aid}' because it is reused in {usage_count} classification(s). Remove it from classifications first.",
        )

    db.delete(attr)
    db.commit()
    return None


# ==============================================================================
# ---- Cross-Fleet Attribute Search (Query Equipment Across Taxonomy) ----
# ==============================================================================

@router.get("/attributes/{attribute_id}/instances")
def search_attribute_instances(
    attribute_id: str,
    min_num: Optional[float] = Query(None, description="Minimum numeric value"),
    max_num: Optional[float] = Query(None, description="Maximum numeric value"),
    aln_match: Optional[str] = Query(None, description="Alphanumeric substring match"),
    exact_aln: Optional[str] = Query(None, description="Exact alphanumeric match"),
    site_id: Optional[str] = None,
    entity_type: Optional[str] = Query("ALL", description="ASSET | LOCATION | ALL"),
    db: Session = Depends(get_db),
):
    """Searches assets and locations across all classifications sharing the given master attribute."""
    aid = attribute_id.strip().upper()
    master_attr = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == aid).first()

    results: Dict[str, Any] = {
        "attribute_id": aid,
        "attribute": master_attr.to_dict(include_usage=False) if master_attr else None,
        "assets": [],
        "locations": [],
    }

    # Query Assets with this attribute
    if entity_type.upper() in ["ASSET", "ALL"]:
        asset_q = db.query(AssetSpec, Asset).join(
            Asset, and_(AssetSpec.site_id == Asset.site_id, AssetSpec.asset_id == Asset.asset_id)
        ).filter(AssetSpec.attribute_id == aid)

        if site_id:
            asset_q = asset_q.filter(AssetSpec.site_id == site_id.strip().upper())
        if min_num is not None:
            asset_q = asset_q.filter(AssetSpec.num_value >= min_num)
        if max_num is not None:
            asset_q = asset_q.filter(AssetSpec.num_value <= max_num)
        if exact_aln is not None:
            asset_q = asset_q.filter(AssetSpec.aln_value == exact_aln.strip())
        elif aln_match is not None:
            asset_q = asset_q.filter(AssetSpec.aln_value.ilike(f"%{aln_match.strip()}%"))

        for spec, asset in asset_q.all():
            results["assets"].append({
                "site_id": asset.site_id,
                "asset_id": asset.asset_id,
                "description": asset.description,
                "status": asset.status,
                "classstructure_id": asset.classstructure_id,
                "classification_path": asset.classification_path,
                "location_id": asset.location_id,
                "section": spec.section,
                "aln_value": spec.aln_value,
                "num_value": spec.num_value,
                "date_value": spec.date_value.isoformat() if spec.date_value else None,
                "unit_of_measure": spec.unit_of_measure or (master_attr.unit_of_measure if master_attr else None),
            })

    # Query Locations with this attribute
    if entity_type.upper() in ["LOCATION", "LOCATIONS", "ALL"]:
        loc_q = db.query(LocationSpec, Location).join(
            Location, and_(LocationSpec.site_id == Location.site_id, LocationSpec.location_id == Location.location_id)
        ).filter(LocationSpec.attribute_id == aid)

        if site_id:
            loc_q = loc_q.filter(LocationSpec.site_id == site_id.strip().upper())
        if min_num is not None:
            loc_q = loc_q.filter(LocationSpec.num_value >= min_num)
        if max_num is not None:
            loc_q = loc_q.filter(LocationSpec.num_value <= max_num)
        if exact_aln is not None:
            loc_q = loc_q.filter(LocationSpec.aln_value == exact_aln.strip())
        elif aln_match is not None:
            loc_q = loc_q.filter(LocationSpec.aln_value.ilike(f"%{aln_match.strip()}%"))

        for spec, loc in loc_q.all():
            results["locations"].append({
                "site_id": loc.site_id,
                "location_id": loc.location_id,
                "description": loc.description,
                "status": loc.status,
                "type": loc.type,
                "classstructure_id": loc.classstructure_id,
                "classification_path": loc.classification_path,
                "parent_location_id": loc.parent_location_id,
                "section": spec.section,
                "aln_value": spec.aln_value,
                "num_value": spec.num_value,
                "date_value": spec.date_value.isoformat() if spec.date_value else None,
                "unit_of_measure": spec.unit_of_measure or (master_attr.unit_of_measure if master_attr else None),
            })

    results["total_count"] = len(results["assets"]) + len(results["locations"])
    return results


# ==============================================================================
# ---- Classification Taxonomy Endpoints ----
# ==============================================================================

@router.get("/classifications")
def list_classifications(
    use_with: Optional[str] = None,
    org_id: Optional[str] = None,
    site_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Classification)
    if status:
        query = query.filter(Classification.status == status.strip().upper())
    if parent_id is not None:
        if parent_id == "null" or parent_id == "":
            query = query.filter(Classification.parent_classstructure_id.is_(None))
        else:
            query = query.filter(Classification.parent_classstructure_id == parent_id.strip().upper())
    if org_id:
        query = query.filter(or_(Classification.org_id == org_id.strip().upper(), Classification.org_id.is_(None)))
    if site_id:
        query = query.filter(or_(Classification.site_id == site_id.strip().upper(), Classification.site_id.is_(None)))

    all_cls = query.order_by(Classification.hierarchy_path.asc()).all()

    # Filter in-memory for use_with if provided (JSON column)
    if use_with:
        target_use = use_with.strip().upper()
        all_cls = [c for c in all_cls if target_use in [u.upper() for u in (c.use_with or [])]]

    if search:
        s = search.strip().lower()
        all_cls = [
            c for c in all_cls
            if s in (c.classification_id or "").lower()
            or s in (c.description or "").lower()
            or s in (c.hierarchy_path or "").lower()
        ]

    return [c.to_dict(include_attributes=True) for c in all_cls]


@router.get("/classifications/tree")
def get_classification_tree(
    use_with: Optional[str] = None,
    org_id: Optional[str] = None,
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Returns the full hierarchical taxonomy tree of Classifications."""
    query = db.query(Classification)
    if org_id:
        query = query.filter(or_(Classification.org_id == org_id.strip().upper(), Classification.org_id.is_(None)))
    if site_id:
        query = query.filter(or_(Classification.site_id == site_id.strip().upper(), Classification.site_id.is_(None)))

    items = query.order_by(Classification.hierarchy_path.asc()).all()

    if use_with:
        target_use = use_with.strip().upper()
        items = [c for c in items if target_use in [u.upper() for u in (c.use_with or [])]]

    nodes_by_id: Dict[str, Dict[str, Any]] = {
        c.classstructure_id: {
            **c.to_dict(include_attributes=True),
            "children": [],
        }
        for c in items
    }

    roots: List[Dict[str, Any]] = []
    for c_id, node in nodes_by_id.items():
        p_id = node.get("parent_classstructure_id")
        if p_id and p_id in nodes_by_id:
            nodes_by_id[p_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


@router.get("/classifications/{classstructure_id}")
def get_classification(
    classstructure_id: str,
    db: Session = Depends(get_db),
):
    cid = classstructure_id.strip().upper()
    cls = db.query(Classification).filter(Classification.classstructure_id == cid).first()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Classification '{cid}' not found.",
        )
    data = cls.to_dict(include_attributes=True)
    data["all_attributes"] = _get_all_attributes_for_classification(db, cid)
    return data


@router.post("/classifications", status_code=status.HTTP_201_CREATED)
def create_classification(
    data: ClassificationCreate,
    db: Session = Depends(get_db),
):
    clean_id = data.classification_id.strip().upper()
    parent_id = data.parent_classstructure_id.strip().upper() if data.parent_classstructure_id else None

    if data.classstructure_id:
        cs_id = data.classstructure_id.strip().upper()
    else:
        if parent_id:
            cs_id = f"{parent_id}_{clean_id}"
        else:
            cs_id = f"CS_{clean_id}"

    existing = db.query(Classification).filter(Classification.classstructure_id == cs_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Classification Structure ID '{cs_id}' already exists.",
        )

    if parent_id:
        parent = db.query(Classification).filter(Classification.classstructure_id == parent_id).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent classification '{parent_id}' does not exist.",
            )

    hierarchy_path = data.hierarchy_path or _build_hierarchy_path(db, clean_id, parent_id)

    cls = Classification(
        classstructure_id=cs_id,
        classification_id=clean_id,
        parent_classstructure_id=parent_id,
        description=data.description,
        hierarchy_path=hierarchy_path,
        use_with=[u.upper() for u in data.use_with] if data.use_with else ["ASSET", "LOCATIONS"],
        org_id=data.org_id.strip().upper() if data.org_id else None,
        site_id=data.site_id.strip().upper() if data.site_id else None,
        status=data.status.upper(),
    )
    db.add(cls)
    db.flush()

    # Add any inline attributes (ensuring master attribute exists)
    if data.attributes:
        for idx, attr_data in enumerate(data.attributes):
            attr_id = attr_data.attribute_id.strip().upper()

            # Ensure master attribute exists in catalog
            master = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == attr_id).first()
            if not master:
                master = AssetAttribute(
                    attribute_id=attr_id,
                    description=attr_data.description or attr_id,
                    data_type=attr_data.data_type.upper(),
                    unit_of_measure=attr_data.unit_of_measure,
                    domain_id=attr_data.domain_id,
                    domain_values=attr_data.domain_values,
                    status="ACTIVE",
                )
                db.add(master)
                db.flush()

            spec_id = f"{cs_id}:{attr_id}"
            spec = ClassSpec(
                id=spec_id,
                classstructure_id=cs_id,
                attribute_id=attr_id,
                section=attr_data.section,
                description=attr_data.description or master.description,
                data_type=attr_data.data_type.upper() if attr_data.data_type else master.data_type,
                unit_of_measure=attr_data.unit_of_measure or master.unit_of_measure,
                domain_id=attr_data.domain_id or master.domain_id,
                domain_values=attr_data.domain_values if attr_data.domain_values is not None else master.domain_values,
                default_value=attr_data.default_value,
                mandatory=attr_data.mandatory,
                apply_down_hierarchy=attr_data.apply_down_hierarchy,
                display_sequence=attr_data.display_sequence or (idx + 1),
            )
            db.add(spec)

    db.commit()
    db.refresh(cls)
    return cls.to_dict(include_attributes=True)


@router.put("/classifications/{classstructure_id}")
def update_classification(
    classstructure_id: str,
    data: ClassificationUpdate,
    db: Session = Depends(get_db),
):
    cid = classstructure_id.strip().upper()
    cls = db.query(Classification).filter(Classification.classstructure_id == cid).first()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Classification '{cid}' not found.",
        )

    if data.description is not None:
        cls.description = data.description
    if data.use_with is not None:
        cls.use_with = [u.upper() for u in data.use_with]
    if data.status is not None:
        cls.status = data.status.upper()
    if data.org_id is not None:
        cls.org_id = data.org_id.strip().upper() if data.org_id else None
    if data.site_id is not None:
        cls.site_id = data.site_id.strip().upper() if data.site_id else None

    if data.classification_id is not None or data.parent_classstructure_id is not None:
        new_class_id = data.classification_id.strip().upper() if data.classification_id else cls.classification_id
        new_parent_id = (
            data.parent_classstructure_id.strip().upper()
            if data.parent_classstructure_id is not None
            else cls.parent_classstructure_id
        )
        if new_parent_id == cid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Classification cannot be its own parent.",
            )
        cls.classification_id = new_class_id
        cls.parent_classstructure_id = new_parent_id or None
        cls.hierarchy_path = _build_hierarchy_path(db, new_class_id, new_parent_id)

    db.commit()
    db.refresh(cls)
    return cls.to_dict(include_attributes=True)


@router.delete("/classifications/{classstructure_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classification(
    classstructure_id: str,
    db: Session = Depends(get_db),
):
    cid = classstructure_id.strip().upper()
    cls = db.query(Classification).filter(Classification.classstructure_id == cid).first()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Classification '{cid}' not found.",
        )

    children = db.query(Classification).filter(Classification.parent_classstructure_id == cid).all()
    if children:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete classification '{cid}' because it has {len(children)} child classification(s). Delete or reassign children first.",
        )

    db.delete(cls)
    db.commit()
    return None


# ==============================================================================
# ---- Classification Attribute Template Endpoints (ClassSpec) ----
# ==============================================================================

@router.post("/classifications/{classstructure_id}/attributes", status_code=status.HTTP_201_CREATED)
def add_classification_attribute(
    classstructure_id: str,
    data: ClassSpecCreate,
    db: Session = Depends(get_db),
):
    """Reuses or creates an attribute specification template attached to a classification."""
    cid = classstructure_id.strip().upper()
    cls = db.query(Classification).filter(Classification.classstructure_id == cid).first()
    if not cls:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classification not found.")

    attr_id = data.attribute_id.strip().upper()
    spec_id = f"{cid}:{attr_id}"

    existing = db.query(ClassSpec).filter(ClassSpec.id == spec_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attribute '{attr_id}' already exists in classification '{cid}'.",
        )

    # Ensure master attribute exists in catalog
    master = db.query(AssetAttribute).filter(AssetAttribute.attribute_id == attr_id).first()
    if not master:
        master = AssetAttribute(
            attribute_id=attr_id,
            description=data.description or attr_id,
            data_type=data.data_type.upper(),
            unit_of_measure=data.unit_of_measure,
            domain_id=data.domain_id,
            domain_values=data.domain_values,
            status="ACTIVE",
        )
        db.add(master)
        db.flush()

    spec = ClassSpec(
        id=spec_id,
        classstructure_id=cid,
        attribute_id=attr_id,
        section=data.section,
        description=data.description or master.description,
        data_type=data.data_type.upper() if data.data_type else master.data_type,
        unit_of_measure=data.unit_of_measure or master.unit_of_measure,
        domain_id=data.domain_id or master.domain_id,
        domain_values=data.domain_values if data.domain_values is not None else master.domain_values,
        default_value=data.default_value,
        mandatory=data.mandatory,
        apply_down_hierarchy=data.apply_down_hierarchy,
        display_sequence=data.display_sequence or (len(cls.attributes) + 1),
    )
    db.add(spec)
    db.commit()
    db.refresh(spec)
    return spec.to_dict()


@router.put("/classifications/{classstructure_id}/attributes/{attribute_id}")
def update_classification_attribute(
    classstructure_id: str,
    attribute_id: str,
    data: ClassSpecUpdate,
    db: Session = Depends(get_db),
):
    cid = classstructure_id.strip().upper()
    aid = attribute_id.strip().upper()
    spec_id = f"{cid}:{aid}"

    spec = db.query(ClassSpec).filter(ClassSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute template not found.")

    if data.section is not None:
        spec.section = data.section
    if data.description is not None:
        spec.description = data.description
    if data.data_type is not None:
        spec.data_type = data.data_type.upper()
    if data.unit_of_measure is not None:
        spec.unit_of_measure = data.unit_of_measure
    if data.domain_id is not None:
        spec.domain_id = data.domain_id
    if data.domain_values is not None:
        spec.domain_values = data.domain_values
    if data.default_value is not None:
        spec.default_value = data.default_value
    if data.mandatory is not None:
        spec.mandatory = data.mandatory
    if data.apply_down_hierarchy is not None:
        spec.apply_down_hierarchy = data.apply_down_hierarchy
    if data.display_sequence is not None:
        spec.display_sequence = data.display_sequence

    db.commit()
    db.refresh(spec)
    return spec.to_dict()


@router.delete("/classifications/{classstructure_id}/attributes/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classification_attribute(
    classstructure_id: str,
    attribute_id: str,
    db: Session = Depends(get_db),
):
    cid = classstructure_id.strip().upper()
    aid = attribute_id.strip().upper()
    spec_id = f"{cid}:{aid}"

    spec = db.query(ClassSpec).filter(ClassSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute template not found.")

    db.delete(spec)
    db.commit()
    return None


# ==============================================================================
# ---- Asset Specifications Endpoints ----
# ==============================================================================

@router.get("/assets/{site_id}/{asset_id}/specifications")
def get_asset_specifications(
    site_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(and_(Asset.site_id == sid, Asset.asset_id == aid)).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{aid}' not found.")

    cs_id = asset.classstructure_id
    specs_list = []

    if cs_id:
        attrs = _get_all_attributes_for_classification(db, cs_id)
        existing_specs = db.query(AssetSpec).filter(
            and_(AssetSpec.site_id == sid, AssetSpec.asset_id == aid)
        ).all()
        val_map = {s.attribute_id: s for s in existing_specs}

        for attr in attrs:
            val = val_map.get(attr["attribute_id"])
            specs_list.append({
                "attribute_id": attr["attribute_id"],
                "section": attr.get("section") or (val.section if val else None),
                "description": attr["description"],
                "data_type": attr["data_type"],
                "unit_of_measure": val.unit_of_measure if (val and val.unit_of_measure) else attr["unit_of_measure"],
                "domain_values": attr.get("domain_values") or [],
                "mandatory": attr["mandatory"],
                "inherited_from": attr.get("inherited_from"),
                "inherited_from_path": attr.get("inherited_from_path"),
                "aln_value": val.aln_value if val else attr.get("default_value"),
                "num_value": val.num_value if val else None,
                "date_value": val.date_value.isoformat() if (val and val.date_value) else None,
                "spec_id": val.id if val else None,
            })

    return {
        "asset_id": aid,
        "site_id": sid,
        "classstructure_id": asset.classstructure_id,
        "classification_path": asset.classification_path,
        "specifications": specs_list,
    }


@router.put("/assets/{site_id}/{asset_id}/specifications")
def update_asset_specifications(
    site_id: str,
    asset_id: str,
    data: ClassificationAssignUpdate,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(and_(Asset.site_id == sid, Asset.asset_id == aid)).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{aid}' not found.")

    if data.classstructure_id is not None:
        if data.classstructure_id == "" or data.classstructure_id.lower() == "none":
            asset.classstructure_id = None
            asset.classification_path = None
        else:
            new_cs_id = data.classstructure_id.strip().upper()
            cls = db.query(Classification).filter(Classification.classstructure_id == new_cs_id).first()
            if not cls:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Classification '{new_cs_id}' does not exist.")
            asset.classstructure_id = new_cs_id
            asset.classification_path = cls.hierarchy_path

    if data.specs is not None and asset.classstructure_id:
        for item in data.specs:
            attr_id = item.attribute_id.strip().upper()
            spec_pk = f"{sid}:{aid}:{attr_id}"
            spec_row = db.query(AssetSpec).filter(AssetSpec.id == spec_pk).first()
            if not spec_row:
                spec_row = AssetSpec(
                    id=spec_pk,
                    asset_id=aid,
                    site_id=sid,
                    classstructure_id=asset.classstructure_id,
                    attribute_id=attr_id,
                )
                db.add(spec_row)
            spec_row.classstructure_id = asset.classstructure_id
            spec_row.section = item.section
            spec_row.aln_value = item.aln_value
            spec_row.num_value = item.num_value
            spec_row.date_value = item.date_value
            if item.unit_of_measure is not None:
                spec_row.unit_of_measure = item.unit_of_measure

    db.commit()
    db.refresh(asset)
    return get_asset_specifications(sid, aid, db)


# ==============================================================================
# ---- Location Specifications Endpoints ----
# ==============================================================================

@router.get("/locations/{site_id}/{location_id}/specifications")
def get_location_specifications(
    site_id: str,
    location_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(and_(Location.site_id == sid, Location.location_id == lid)).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{lid}' not found.")

    cs_id = loc.classstructure_id
    specs_list = []

    if cs_id:
        attrs = _get_all_attributes_for_classification(db, cs_id)
        existing_specs = db.query(LocationSpec).filter(
            and_(LocationSpec.site_id == sid, LocationSpec.location_id == lid)
        ).all()
        val_map = {s.attribute_id: s for s in existing_specs}

        for attr in attrs:
            val = val_map.get(attr["attribute_id"])
            specs_list.append({
                "attribute_id": attr["attribute_id"],
                "section": attr.get("section") or (val.section if val else None),
                "description": attr["description"],
                "data_type": attr["data_type"],
                "unit_of_measure": val.unit_of_measure if (val and val.unit_of_measure) else attr["unit_of_measure"],
                "domain_values": attr.get("domain_values") or [],
                "mandatory": attr["mandatory"],
                "inherited_from": attr.get("inherited_from"),
                "inherited_from_path": attr.get("inherited_from_path"),
                "aln_value": val.aln_value if val else attr.get("default_value"),
                "num_value": val.num_value if val else None,
                "date_value": val.date_value.isoformat() if (val and val.date_value) else None,
                "spec_id": val.id if val else None,
            })

    return {
        "location_id": lid,
        "site_id": sid,
        "classstructure_id": loc.classstructure_id,
        "classification_path": loc.classification_path,
        "specifications": specs_list,
    }


@router.put("/locations/{site_id}/{location_id}/specifications")
def update_location_specifications(
    site_id: str,
    location_id: str,
    data: ClassificationAssignUpdate,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(and_(Location.site_id == sid, Location.location_id == lid)).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{lid}' not found.")

    if data.classstructure_id is not None:
        if data.classstructure_id == "" or data.classstructure_id.lower() == "none":
            loc.classstructure_id = None
            loc.classification_path = None
        else:
            new_cs_id = data.classstructure_id.strip().upper()
            cls = db.query(Classification).filter(Classification.classstructure_id == new_cs_id).first()
            if not cls:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Classification '{new_cs_id}' does not exist.")
            loc.classstructure_id = new_cs_id
            loc.classification_path = cls.hierarchy_path

    if data.specs is not None and loc.classstructure_id:
        for item in data.specs:
            attr_id = item.attribute_id.strip().upper()
            spec_pk = f"{sid}:{lid}:{attr_id}"
            spec_row = db.query(LocationSpec).filter(LocationSpec.id == spec_pk).first()
            if not spec_row:
                spec_row = LocationSpec(
                    id=spec_pk,
                    location_id=lid,
                    site_id=sid,
                    classstructure_id=loc.classstructure_id,
                    attribute_id=attr_id,
                )
                db.add(spec_row)
            spec_row.classstructure_id = loc.classstructure_id
            spec_row.section = item.section
            spec_row.aln_value = item.aln_value
            spec_row.num_value = item.num_value
            spec_row.date_value = item.date_value
            if item.unit_of_measure is not None:
                spec_row.unit_of_measure = item.unit_of_measure

    db.commit()
    db.refresh(loc)
    return get_location_specifications(sid, lid, db)
