import logging
from datetime import datetime, timezone
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from backend.models.entities import DynamicEntity
from backend.services.command_handler import propose_transition

logger = logging.getLogger("expiry_worker")

def check_and_expire_permits(db: Session) -> List[Dict[str, Any]]:
    """
    Finds all active entity records with custom_fields.expiry_date < now() and transitions them to EXPIRED.
    Uses ordinary propose_transition with actor_type='system'.
    """
    now = datetime.now(timezone.utc)
    expired_results = []

    active_entities = db.query(DynamicEntity).filter(DynamicEntity.status == "Active").all()

    for p in active_entities:
        fields = p.custom_fields or {}
        expiry_str = fields.get("expiry_date")
        if not expiry_str:
            continue

        try:
            exp_date = datetime.fromisoformat(str(expiry_str).replace("Z", "+00:00"))
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)

            if exp_date < now:
                res = propose_transition(
                    db=db,
                    entity_type=p.entity_type,
                    entity_id=p.id,
                    event_type="EXPIRED",
                    actor_id="system:expiry-checker",
                    actor_type="system",
                    payload={"reason": f"Record expired automatically at {now.isoformat()} (expiry was {expiry_str})"}
                )
                expired_results.append({
                    "permit_id": p.id,
                    "previous_status": "Active",
                    "new_status": res.get("new_status"),
                    "event_id": res.get("event_id"),
                })
        except Exception as ex:
            logger.error(f"Error checking expiry for record '{p.id}': {str(ex)}")

    return expired_results
