from sqlalchemy import Column, String
from backend.database import Base
from backend.models.base import EntityBaseMixin, EntityEventBaseMixin

class DynamicEntity(EntityBaseMixin, Base):
    """
    Universal entity storage for all user-defined entity types.
    Polymorphically stores any user-defined schema via entity_type and custom_fields.
    """
    __tablename__ = "dynamic_entity"

class DynamicEntityEvent(EntityEventBaseMixin, Base):
    """
    Universal immutable event log for all user-defined entity types.
    """
    __tablename__ = "dynamic_entity_event"

# Generic aliases
EntityInstance = DynamicEntity
EntityEvent = DynamicEntityEvent

def get_entity_models(entity_type: str = ""):
    """
    Returns the polymorphic entity and event models used for all user-defined entities.
    """
    return DynamicEntity, DynamicEntityEvent
