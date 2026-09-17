from sqlalchemy import Column, String
from backend.database import Base
from backend.models.base import EntityBaseMixin, EntityEventBaseMixin

# Concrete Entity Tables at launch (Section 3.1)

class WorkOrder(EntityBaseMixin, Base):
    __tablename__ = "workorder"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.entity_type = "workorder"

class WorkOrderEvent(EntityEventBaseMixin, Base):
    __tablename__ = "workorder_event"

class Permit(EntityBaseMixin, Base):
    __tablename__ = "permit"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.entity_type = "permit"

class PermitEvent(EntityEventBaseMixin, Base):
    __tablename__ = "permit_event"

class PMSchedule(EntityBaseMixin, Base):
    __tablename__ = "pm_schedule"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.entity_type = "pm_schedule"

class PMScheduleEvent(EntityEventBaseMixin, Base):
    __tablename__ = "pm_schedule_event"

class DynamicEntity(EntityBaseMixin, Base):
    __tablename__ = "dynamic_entity"

class DynamicEntityEvent(EntityEventBaseMixin, Base):
    __tablename__ = "dynamic_entity_event"

# Entity Registry to map dynamic entity_type parameter to physical models
ENTITY_REGISTRY = {
    "workorder": {
        "model": WorkOrder,
        "event_model": WorkOrderEvent,
        "display_name": "Work Order",
    },
    "permit": {
        "model": Permit,
        "event_model": PermitEvent,
        "display_name": "Permit to Work",
    },
    "pm_schedule": {
        "model": PMSchedule,
        "event_model": PMScheduleEvent,
        "display_name": "PM Schedule",
    },
}

def get_entity_models(entity_type: str):
    entity_key = entity_type.lower()
    if entity_key in ENTITY_REGISTRY:
        return ENTITY_REGISTRY[entity_key]["model"], ENTITY_REGISTRY[entity_key]["event_model"]
    return DynamicEntity, DynamicEntityEvent
