from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from backend.models.notification import InAppNotification
from backend.models.base import generate_uuid, utc_now


def dispatch_notification(
    db: Session,
    recipient_id: str,
    title: str,
    message: str,
    category: str = "task_assigned",
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    link_url: Optional[str] = None,
    sender_id: str = "system:workflow-engine",
    auto_commit: bool = False,
) -> InAppNotification:
    """Dispatches a new in-app notification to a specific recipient (person_id or user)."""
    clean_recipient = str(recipient_id).strip()
    clean_title = str(title).strip()
    clean_message = str(message).strip()

    notification = InAppNotification(
        id=generate_uuid(),
        recipient_id=clean_recipient,
        sender_id=str(sender_id).strip() if sender_id else "system:workflow-engine",
        title=clean_title,
        message=clean_message,
        category=category or "task_assigned",
        entity_type=entity_type.lower() if entity_type else None,
        entity_id=str(entity_id) if entity_id else None,
        link_url=link_url,
        is_read=False,
        read_at=None,
        created_at=utc_now(),
    )
    db.add(notification)
    if auto_commit:
        db.commit()
        db.refresh(notification)
    else:
        db.flush()
    return notification


def mark_notification_read(
    db: Session,
    notification_id: str,
    is_read: bool = True,
) -> Optional[InAppNotification]:
    """Marks a single notification as read or unread."""
    notification = db.query(InAppNotification).filter(InAppNotification.id == notification_id).first()
    if not notification:
        return None
    notification.is_read = is_read
    notification.read_at = utc_now() if is_read else None
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_notifications_read(
    db: Session,
    recipient_id: Optional[str] = None,
) -> int:
    """Marks all notifications (optionally filtered by recipient_id) as read."""
    query = db.query(InAppNotification).filter(InAppNotification.is_read == False)
    if recipient_id:
        query = query.filter(InAppNotification.recipient_id == recipient_id)
    unread_items = query.all()
    now = utc_now()
    count = len(unread_items)
    for n in unread_items:
        n.is_read = True
        n.read_at = now
    db.commit()
    return count


def get_unread_count(
    db: Session,
    recipient_id: Optional[str] = None,
) -> int:
    """Returns total unread notifications count."""
    query = db.query(InAppNotification).filter(InAppNotification.is_read == False)
    if recipient_id:
        query = query.filter(InAppNotification.recipient_id == recipient_id)
    return query.count()
