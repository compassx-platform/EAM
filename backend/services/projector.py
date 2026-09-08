from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from backend.models.entities import get_entity_models

def rebuild_entity_from_events(db: Session, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Rebuilds the current-state materialized row for an entity by replaying its entire event log.
    Validates Event Sourcing Principle 1 (Section 2).
    """
    EntityModel, EventModel = get_entity_models(entity_type)
    
    events = (
        db.query(EventModel)
        .filter(EventModel.entity_id == entity_id)
        .order_by(EventModel.transaction_time.asc())
        .all()
    )

    if not events:
        raise ValueError(f"No events found for {entity_type} '{entity_id}'")

    current_status = None
    last_event_id = None
    custom_fields = {}
    created_at = None
    updated_at = None

    for ev in events:
        if ev.from_state is None and ev.to_state:
            # CREATED event
            current_status = ev.to_state
            created_at = ev.transaction_time
        else:
            current_status = ev.to_state

        last_event_id = ev.event_id
        updated_at = ev.transaction_time

        # If payload contained field delta, apply
        if ev.payload and isinstance(ev.payload, dict):
            delta = ev.payload.get("custom_fields_delta")
            if delta and isinstance(delta, dict):
                custom_fields.update(delta)

    entity = db.query(EntityModel).filter(EntityModel.id == entity_id).first()
    if not entity:
        # Re-create cache row
        first_event = events[0]
        entity = EntityModel(
            id=entity_id,
            entity_type=entity_type.lower(),
            status=current_status,
            workflow_version="standard_v1",  # Re-bound or default
            last_event_id=last_event_id,
            custom_fields=custom_fields,
            created_at=created_at or updated_at,
            updated_at=updated_at,
        )
        db.add(entity)
    else:
        entity.status = current_status
        entity.last_event_id = last_event_id
        entity.custom_fields.update(custom_fields)
        entity.updated_at = updated_at

    db.commit()
    db.refresh(entity)
    return entity.to_dict()

def rebuild_all_entities(db: Session, entity_type: str) -> int:
    """
    Replays all event streams for all instances of an entity_type to rebuild the cache table.
    """
    EntityModel, EventModel = get_entity_models(entity_type)
    
    unique_ids = db.query(EventModel.entity_id).distinct().all()
    rebuilt_count = 0
    for (eid,) in unique_ids:
        rebuild_entity_from_events(db, entity_type, eid)
        rebuilt_count += 1
    return rebuilt_count
