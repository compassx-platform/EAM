import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  RefreshCw,
  X,
  CheckCircle2,
  Zap,
  AlertCircle,
  Clock,
  User,
  Filter,
} from 'lucide-react';
import { api } from '../../api/client';
import type { InAppNotification, Person } from '../../types';
import { navigate } from '../../lib/router';

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return isoString;
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'task_assigned':
      return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
    case 'workflow_action':
      return <Zap className="h-4 w-4 text-indigo-600" />;
    case 'system_alert':
      return <AlertCircle className="h-4 w-4 text-amber-600" />;
    default:
      return <Bell className="h-4 w-4 text-gray-500" />;
  }
}

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'task_assigned' | 'workflow_action'>('all');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('ALL');
  const [peopleList, setPeopleList] = useState<Person[]>([]);

  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch people directory for recipient switcher
  useEffect(() => {
    api.listPersons({ limit: 100 })
      .then((res) => setPeopleList(res.items || []))
      .catch(() => {});
  }, []);

  // Fetch unread count & list
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const recipientParam = selectedRecipient === 'ALL' ? undefined : selectedRecipient;
      const res = await api.listNotifications({
        recipient_id: recipientParam,
        limit: 50,
      });
      setNotifications(res.items || []);
      setUnreadCount(res.unread_count ?? 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRecipient]);

  // Periodic lightweight poll every 20s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Outside click & Escape to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const updated = await api.markNotificationRead(id, true);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: updated.read_at } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const recipientParam = selectedRecipient === 'ALL' ? undefined : selectedRecipient;
      await api.markAllNotificationsRead(recipientParam);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.deleteNotification(id);
      const target = notifications.find((n) => n.id === id);
      if (target && !target.is_read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNavigateToEntity = (notif: InAppNotification) => {
    if (notif.link_url) {
      navigate(notif.link_url);
      setIsOpen(false);
      if (!notif.is_read) {
        handleMarkAsRead(notif.id);
      }
      return;
    }
    if (notif.entity_type && notif.entity_id) {
      navigate(`/records`, { type: notif.entity_type, id: notif.entity_id });
      setIsOpen(false);
      if (!notif.is_read) {
        handleMarkAsRead(notif.id);
      }
    }
  };

  // Filtered list
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.is_read;
    if (activeTab === 'task_assigned') return n.category === 'task_assigned';
    if (activeTab === 'workflow_action') return n.category === 'workflow_action';
    return true;
  });

  return (
    <div className="relative inline-block text-left">
      {/* Bell Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggleOpen}
        title="Notification Center"
        aria-label="Notification Center"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          isOpen
            ? 'border-gray-300 bg-gray-100 text-gray-900 shadow-xs'
            : 'border-gray-200/80 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white shadow-xs animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Level 2 Floating Contextually Anchored Notification Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="fixed right-4 top-14 z-50 flex w-[420px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-150 max-h-[calc(100vh-80px)] overflow-hidden"
        >
          {/* Pointer Notch */}
          <div className="pointer-events-none absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white shadow-xs" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200/60">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                title="Mark all as read"
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  unreadCount === 0
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>

              <button
                type="button"
                onClick={fetchNotifications}
                title="Refresh notifications"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors ml-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Recipient Switcher Bar */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/70 px-4 py-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 font-medium text-[11px]">
              <User className="h-3.5 w-3.5 text-gray-400" />
              <span>Recipient:</span>
            </div>
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none max-w-[220px] truncate"
            >
              <option value="ALL">All Broadcast & Users</option>
              {peopleList.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {p.display_name} ({p.person_id})
                </option>
              ))}
            </select>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-100 bg-white px-4 py-2">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'unread'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('task_assigned')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'task_assigned'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Tasks
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workflow_action')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'workflow_action'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Actions
            </button>
          </div>

          {/* Notification List Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-[440px]">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-2">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-gray-700">No notifications</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {activeTab === 'unread'
                    ? "You've read all your notifications."
                    : 'New task assignments and workflow notices will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const hasLink = Boolean(notif.link_url || (notif.entity_type && notif.entity_id));
                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (hasLink) handleNavigateToEntity(notif);
                      else if (!notif.is_read) handleMarkAsRead(notif.id);
                    }}
                    className={`group relative flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                      notif.is_read
                        ? 'bg-white hover:bg-slate-50/80'
                        : 'bg-blue-50/30 hover:bg-blue-50/60'
                    }`}
                  >
                    {/* Unread indicator bar */}
                    {!notif.is_read && (
                      <div className="absolute left-1 top-4 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-blue-100" />
                    )}

                    {/* Icon */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 mt-0.5">
                      {getCategoryIcon(notif.category)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-xs truncate ${
                            notif.is_read ? 'font-medium text-gray-800' : 'font-bold text-gray-900'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Footer tags / actions */}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {notif.entity_id && (
                            <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-700 border border-gray-200/60">
                              {notif.entity_type?.toUpperCase()}: {notif.entity_id}
                              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 capitalize">
                            {notif.category.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Hover Row Actions */}
                    <div className="absolute right-2 top-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-md p-0.5 border border-gray-200/80 shadow-xs">
                      {!notif.is_read ? (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          title="Mark as read"
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await api.markNotificationRead(notif.id, false);
                            setNotifications((prev) =>
                              prev.map((n) => (n.id === notif.id ? { ...n, is_read: false } : n))
                            );
                            setUnreadCount((c) => c + 1);
                          }}
                          title="Mark as unread"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDelete(notif.id, e)}
                        title="Delete notification"
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
