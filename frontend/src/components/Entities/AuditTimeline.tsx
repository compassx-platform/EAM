import React from 'react';
import { EntityEvent } from '../../types';
import { Badge } from '../../design-system/components/Badge';
import { User, Cpu, ArrowRight, ShieldCheck, MessageSquare, Clock } from 'lucide-react';

interface AuditTimelineProps {
  events: EntityEvent[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-[var(--cx-color-text-muted)]">
        No event history recorded yet.
      </div>
    );
  }

  // Sort chronologically ascending or descending (most recent first)
  const sortedEvents = [...events].reverse();

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--cx-color-border)]">
      {sortedEvents.map((ev, index) => {
        const isSystem = ev.actor_type === 'system';
        const gateTrace = ev.payload?.gate_trace || [];
        const comment = ev.payload?.comment || ev.payload?.reason;
        const formattedDate = new Date(ev.transaction_time).toLocaleString();

        return (
          <div key={ev.event_id || index} className="relative group">
            {/* Timeline node icon */}
            <div
              className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[var(--cx-color-surface)] shadow-xs ${
                isSystem ? 'bg-amber-500 text-white' : 'bg-[var(--cx-color-brand-primary)] text-white'
              }`}
            >
              {isSystem ? <Cpu className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
            </div>

            {/* Event Card */}
            <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3.5 shadow-xs">
              {/* Event Header */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[var(--cx-color-brand-primary)]">
                    {ev.event_type}
                  </span>
                  <Badge variant={isSystem ? 'warning' : 'default'} size="sm">
                    {isSystem ? 'System Actor' : 'Human Actor'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[var(--cx-color-text-muted)]">
                  <Clock className="w-3 h-3" />
                  <span>{formattedDate}</span>
                </div>
              </div>

              {/* State Transition */}
              <div className="flex items-center gap-2 text-xs py-1">
                <span className="text-[var(--cx-color-text-muted)] font-medium">State change:</span>
                {ev.from_state ? (
                  <>
                    <Badge variant="status" status={ev.from_state} size="sm">
                      {ev.from_state}
                    </Badge>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                  </>
                ) : (
                  <span className="text-[11px] italic text-[var(--cx-color-text-muted)]">Initial</span>
                )}
                <Badge variant="status" status={ev.to_state} size="sm">
                  {ev.to_state}
                </Badge>
              </div>

              {/* Actor */}
              <div className="text-[11px] text-[var(--cx-color-text-muted)] mt-1 flex items-center gap-1.5">
                <span className="font-medium text-[var(--cx-color-text)]">Actor:</span>
                <span className="font-mono">{ev.actor_id}</span>
              </div>

              {/* Comment / Reason */}
              {comment && (
                <div className="mt-2 p-2 bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border-subtle)] rounded text-xs text-[var(--cx-color-text)] flex items-start gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span className="italic">"{comment}"</span>
                </div>
              )}

              {/* Gate Trace if any */}
              {gateTrace.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-[var(--cx-color-border-subtle)]">
                  <div className="text-[10px] font-bold text-[var(--cx-color-text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Evaluated Gates ({gateTrace.length})</span>
                  </div>
                  <div className="space-y-1">
                    {gateTrace.map((g: any, gIdx: number) => (
                      <div
                        key={gIdx}
                        className="text-[11px] flex items-center justify-between px-2 py-1 rounded bg-[var(--cx-color-surface-subtle)]"
                      >
                        <span className="font-medium">{g.label}</span>
                        <span className="text-[10px] text-emerald-600 font-bold">PASSED</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
