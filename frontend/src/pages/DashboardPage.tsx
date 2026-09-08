import React, { useState, useEffect } from 'react';
import { SystemStats } from '../types';
import { api } from '../api/client';
import { Card } from '../design-system/components/Card';
import { Badge } from '../design-system/components/Badge';
import { Button } from '../design-system/components/Button';
import {
  ClipboardList,
  FileCheck2,
  Workflow,
  ShieldCheck,
  History,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Play,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (page: string, entityType?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getEvents(8)]).then(([sRes, evRes]) => {
      setStats(sRes);
      setRecentEvents(evRes);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#2272B4]/10 via-blue-50 to-transparent dark:from-[#2272B4]/20 dark:via-gray-900 dark:to-transparent border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="primary" size="sm">
                COMPASSX EAM V1
              </Badge>
              <span className="text-xs text-[var(--cx-color-text-muted)] font-mono">
                Event-Sourced & CQRS Architecture
              </span>
            </div>
            <h1 className="text-xl font-bold text-[var(--cx-color-text)]">
              Enterprise Asset Management (EAM) & Safety Interlocking
            </h1>
            <p className="text-xs text-[var(--cx-color-text-muted)] mt-1 max-w-2xl">
              Generic state machine engine with hard-separated deterministic enforcement gates.
              Guarantees that high-risk maintenance operations cannot start without active safety permits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => onNavigate('workorders', 'workorder')}
              icon={<ClipboardList className="w-4 h-4" />}
            >
              Open Work Orders
            </Button>
            <Button
              variant="secondary"
              onClick={() => onNavigate('permits', 'permit')}
              icon={<FileCheck2 className="w-4 h-4" />}
            >
              Safety Permits
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--cx-color-text-muted)] uppercase">
              Work Orders
            </span>
            <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--cx-color-text)]">
              {stats?.workorders.total ?? '-'}
            </span>
            <span className="text-xs text-blue-600 font-medium">
              ({stats?.workorders.in_progress ?? 0} In Progress)
            </span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--cx-color-text-muted)] uppercase">
              Permits to Work
            </span>
            <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--cx-color-text)]">
              {stats?.permits.total ?? '-'}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              ({stats?.permits.active ?? 0} Active)
            </span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--cx-color-text-muted)] uppercase">
              Immutable Event Log
            </span>
            <div className="p-2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <History className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--cx-color-text)]">
              {stats?.total_events ?? '-'}
            </span>
            <span className="text-xs text-[var(--cx-color-text-muted)] font-medium">
              Audit Events
            </span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--cx-color-text-muted)] uppercase">
              Enforcement Gates
            </span>
            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--cx-color-text)]">
              {stats?.gates_count ?? '-'}
            </span>
            <span className="text-xs text-[var(--cx-color-text-muted)] font-medium">
              Parameterized Rules
            </span>
          </div>
        </Card>
      </div>

      {/* Spec §13 Step 12 Interlocking Verification Flow Guide */}
      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--cx-color-border)] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <h3 className="text-sm font-bold text-[var(--cx-color-text)]">
              Spec §13 Checkpoint: WorkOrder ↔ Permit Interlocking Lifecycle
            </h3>
          </div>
          <Badge variant="primary" size="sm">
            Core Architectural Proof
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border-subtle)] rounded-[var(--cx-radius-md)] space-y-1.5">
            <div className="font-bold text-[var(--cx-color-text)] flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900 text-[var(--cx-color-brand-primary)] flex items-center justify-center font-bold text-[10px]">
                1
              </span>
              <span>Create & Issue Permit</span>
            </div>
            <p className="text-[11px] text-[var(--cx-color-text-muted)]">
              Create a Hot Work permit. Requires <b>Safety Officer</b> role to trigger <code className="text-blue-600">ISSUED</code> gate.
            </p>
          </div>

          <div className="p-3 bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border-subtle)] rounded-[var(--cx-radius-md)] space-y-1.5">
            <div className="font-bold text-[var(--cx-color-text)] flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900 text-[var(--cx-color-brand-primary)] flex items-center justify-center font-bold text-[10px]">
                2
              </span>
              <span>Link to Work Order</span>
            </div>
            <p className="text-[11px] text-[var(--cx-color-text-muted)]">
              Create a WorkOrder with <code className="text-blue-600">linked_permit_id</code> referencing the permit.
            </p>
          </div>

          <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-[var(--cx-radius-md)] space-y-1.5">
            <div className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px]">
                3
              </span>
              <span>Gate Enforcement</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Attempting to trigger <code className="font-bold">STARTED</code> before permit is Active is strictly <b>BLOCKED</b> by gate.
            </p>
          </div>

          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-[var(--cx-radius-md)] space-y-1.5">
            <div className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-[10px]">
                4
              </span>
              <span>Activate & Execute</span>
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Once Permit is <code className="font-bold">Active</code>, WorkOrder start succeeds into <code className="font-bold">InProgress</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Event Audit Stream */}
      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--cx-color-border)] pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-[var(--cx-color-text)]">
              Live System Event Stream (Command-Side Writes)
            </h3>
          </div>
          <button
            onClick={() => onNavigate('audit')}
            className="text-xs font-semibold text-[var(--cx-color-brand-primary)] hover:underline flex items-center gap-1"
          >
            <span>View Full Audit Log</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="cx-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Event Type</th>
                <th>State Change</th>
                <th>Actor</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((ev, idx) => (
                <tr key={idx}>
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
                      <span>
                        {ev.from_state} &rarr; <b>{ev.to_state}</b>
                      </span>
                    ) : (
                      <span>
                        Initial &rarr; <b>{ev.to_state}</b>
                      </span>
                    )}
                  </td>
                  <td className="text-xs font-mono text-[var(--cx-color-text-muted)]">
                    {ev.actor_id}
                  </td>
                  <td className="text-xs text-[var(--cx-color-text-muted)] whitespace-nowrap">
                    {new Date(ev.transaction_time).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
