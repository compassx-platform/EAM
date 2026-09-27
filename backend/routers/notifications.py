from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.notification import InAppNotification
from backend.services.notification_service import (
    dispatch_notification,
    mark_notification_read,
    mark_all_notifications_read,
    get_unread_count,
)

router = APIRouter(prefix="/notifications", tags=["In-App Notifications"])


class NotificationCreateInput(BaseModel):
    recipient_id: str = Field(..., description="Target person ID or user ID (e.g. 'ENG-001' or 'ALL')")
    title: str = Field(..., max_length=255)
    message: str
    category: Optional[str] = Field("task_assigned", description="task_assigned | workflow_action | system_alert | status_changed")
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    link_url: Optional[str] = None
    sender_id: Optional[str] = "system:workflow-engine"


class NotificationReadInput(BaseModel):
    is_read: bool = True


class MarkAllReadInput(BaseModel):
    recipient_id: Optional[str] = None


@router.get("")
def list_notifications(
    recipient_id: Optional[str] = Query(None, description="Filter by recipient (person_id or user)"),
    is_read: Optional[bool] = Query(None, description="Filter by read/unread status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(InAppNotification)
    if recipient_id:
        # Include notifications addressed to this recipient or 'ALL' broadcast
        query = query.filter(InAppNotification.recipient_id.in_([recipient_id, "ALL"]))
    if is_read is not None:
        query = query.filter(InAppNotification.is_read == is_read)
    if category:
        query = query.filter(InAppNotification.category == category)

    total = query.count()
    items = query.order_by(InAppNotification.created_at.desc()).offset(offset).limit(limit).all()
    unread_count = get_unread_count(db, recipient_id=recipient_id)

    return {
        "items": [n.to_dict() for n in items],
        "total": total,
        "unread_count": unread_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/unread-count")
@router.get("/unread_count")
def get_notifications_unread_count(
    recipient_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    count = get_unread_count(db, recipient_id=recipient_id)
    return {"unread_count": count}


@router.post("")
def create_notification(
    payload: NotificationCreateInput,
    db: Session = Depends(get_db),
):
    notification = dispatch_notification(
        db=db,
        recipient_id=payload.recipient_id,
        title=payload.title,
        message=payload.message,
        category=payload.category or "task_assigned",
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        link_url=payload.link_url,
        sender_id=payload.sender_id or "system:workflow-engine",
        auto_commit=True,
    )
    return notification.to_dict()


@router.patch("/{notification_id}/read")
@router.put("/{notification_id}/read")
def update_notification_read(
    notification_id: str,
    payload: Optional[NotificationReadInput] = None,
    db: Session = Depends(get_db),
):
    is_read = payload.is_read if payload is not None else True
    notification = mark_notification_read(db, notification_id, is_read=is_read)
    if not notification:
        raise HTTPException(status_code=404, detail=f"Notification '{notification_id}' not found")
    return notification.to_dict()


@router.post("/mark-all-read")
@router.post("/mark_all_read")
def mark_all_read(
    payload: Optional[MarkAllReadInput] = None,
    recipient_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    target_recipient = (payload.recipient_id if payload and payload.recipient_id else recipient_id)
    count = mark_all_notifications_read(db, recipient_id=target_recipient)
    return {"marked_count": count}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    db: Session = Depends(get_db),
):
    notification = db.query(InAppNotification).filter(InAppNotification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail=f"Notification '{notification_id}' not found")
    db.delete(notification)
    db.commit()
    return {"deleted": True, "id": notification_id}
