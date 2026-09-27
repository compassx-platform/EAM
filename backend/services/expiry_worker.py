import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from backend.services.escalation_engine import run_escalations_and_timers

logger = logging.getLogger("expiry_worker")

def check_and_expire_permits(db: Session) -> List[Dict[str, Any]]:
    """
    Autonomous watchdog runner powered by the Enterprise Escalations Engine.
    Executes database-defined escalations and dynamic node SLA timers with zero hardcoded scripts.
    """
    return run_escalations_and_timers(db)
