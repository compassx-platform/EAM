import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Badge } from '../design-system/components/Badge';
import { Button } from '../design-system/components/Button';
import { History, RefreshCw, Cpu, User, ArrowRight, ShieldCheck, Clock } from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await api.getEvents(100);
      setEvents(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = entityFilter
    ? events.filter((e) => e.entity_type === entityFilter)
    : events;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cx-color-border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--cx-color-text)] flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <span>Append-Only Event Sourcing Audit Stream</span>
          </h2>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Section 2, Principle 1: Every state transition is permanently recorded as an immutable event with actor and gate trace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="cx-select w-40 text-xs"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="">All Entities</option>
            <option value="workorder">Work Orders</option>
            <option value="permit">Permits</option>
          </select>
          <Button size="sm" variant="secondary" onClick={loadEvents} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh Stream
          </Button>
        </div>
      </div>

      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--cx-color-text-muted)] animate-pulse">
            Loading event stream...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--cx-color-text-muted)]">
            No events recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="cx-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Entity</th>
                  <th>Event Type</th>
                  <th>State Transition</th>
                  <th>Actor</th>
                  <th>Audit Note / Gate Trace</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => {
                  const isSystem = ev.actor_type === 'system';
                  const comment = ev.payload?.comment || ev.payload?.reason;
                  const gateTrace = ev.payload?.gate_trace || [];

                  return (
                    <tr key={ev.event_id}>
                      <td className="font-mono text-[11px] text-[var(--cx-color-text-muted)]">
                        {ev.event_id ? ev.event_id.substring(0, 8) : '-'}...
                      </td>
                      <td>
                        <Badge
                          variant={ev.entity_type === 'workorder' ? 'primary' : 'success'}
                          size="sm"
                        >
                          {ev.entity_type}
                        </Badge>
                      </td>
                      <td className="font-mono font-bold text-xs text-[var(--cx-color-brand-primary)]">
                        {ev.event_type}
                      </td>
                      <td className="text-xs">
                        {ev.from_state ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="status" status={ev.from_state} size="sm">
                              {ev.from_state}
                            </Badge>
                            <ArrowRight className="w-3 h-3 text-gray-400" />
                            <Badge variant="status" status={ev.to_state} size="sm">
                              {ev.to_state}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="status" status={ev.to_state} size="sm">
                            {ev.to_state} (Initial)
                          </Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`p-1 rounded-full text-white ${
                              isSystem ? 'bg-amber-500' : 'bg-[var(--cx-color-brand-primary)]'
                            }`}
                          >
                            {isSystem ? (
                              <Cpu className="w-2.5 h-2.5" />
                            ) : (
                              <User className="w-2.5 h-2.5" />
                            )}
                          </span>
                          <span className="font-mono text-xs text-[var(--cx-color-text)]">
                            {ev.actor_id}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-md text-xs">
                        {comment && <div className="italic text-[var(--cx-color-text)]">"{comment}"</div>}
                        {gateTrace.length > 0 && (
                          <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3 h-3" />
                            <span>{gateTrace.length} Gates Verified (Passed)</span>
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-[var(--cx-color-text-muted)] whitespace-nowrap">
                        {new Date(ev.transaction_time).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
