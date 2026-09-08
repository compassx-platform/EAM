import React, { useState, useEffect } from 'react';
import { Badge } from '../../design-system/components/Badge';
import { Button } from '../../design-system/components/Button';
import { Tabs } from '../../design-system/components/Tabs';
import { AuditTimeline } from './AuditTimeline';
import { TransitionModal } from './TransitionModal';
import { EntityDetailResponse, ValidTransition } from '../../types';
import { api } from '../../api/client';
import {
  ArrowLeft,
  RotateCcw,
  Play,
  Clock,
  Layers,
  Hash,
  Link as LinkIcon,
  ShieldCheck,
  Calendar,
  DollarSign,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface EntityDetailViewProps {
  entityType: string;
  entityId: string;
  onBack: () => void;
  onNavigateToEntity?: (entityType: string, id: string) => void;
}

export const EntityDetailView: React.FC<EntityDetailViewProps> = ({
  entityType,
  entityId,
  onBack,
  onNavigateToEntity,
}) => {
  const [detail, setDetail] = useState<EntityDetailResponse | null>(null);
  const [validTransitions, setValidTransitions] = useState<ValidTransition[]>([]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'fields'>('timeline');
  const [selectedTransition, setSelectedTransition] = useState<ValidTransition | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dRes, vtRes] = await Promise.all([
        api.getEntity(entityType, entityId),
        api.getValidTransitions(entityType, entityId),
      ]);
      setDetail(dRes);
      setValidTransitions(vtRes.valid_transitions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [entityType, entityId]);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await api.rebuildEntity(entityType, entityId);
      setRebuildMsg('Current-state materialized row successfully rebuilt by replaying event logs.');
      setTimeout(() => setRebuildMsg(null), 4000);
      await loadData();
    } catch (err: any) {
      alert(`Rebuild error: ${err.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="p-8 text-center text-xs text-[var(--cx-color-text-muted)] animate-pulse">
        Loading entity details and state machine transitions...
      </div>
    );
  }

  const { entity, events } = detail;
  const customFields = entity.custom_fields || {};
  const displayName = entityType === 'workorder' ? 'Work Order' : entityType === 'permit' ? 'Permit to Work' : entityType;

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {displayName} List</span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRebuild}
            loading={rebuilding}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            title="Replay append-only events to verify CQRS cache parity"
          >
            Rebuild from Events
          </Button>
        </div>
      </div>

      {rebuildMsg && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs rounded-md">
          {rebuildMsg}
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <Badge variant="status" status={entity.status}>
                {entity.status}
              </Badge>
              <h1 className="text-lg font-bold text-[var(--cx-color-text)]">
                {customFields.title || `${displayName} #${entity.id.substring(0, 8)}`}
              </h1>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--cx-color-text-muted)] flex-wrap">
              <span className="flex items-center gap-1 font-mono">
                <Hash className="w-3.5 h-3.5" />
                {entity.id}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Version: {entity.workflow_version}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Updated: {new Date(entity.updated_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Valid Transitions Actions (Command API buttons) */}
          <div className="flex flex-wrap items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-[var(--cx-color-border)]">
            {validTransitions.length > 0 ? (
              validTransitions.map((vt) => (
                <Button
                  key={vt.event_type}
                  variant="primary"
                  size="md"
                  onClick={() => setSelectedTransition(vt)}
                  icon={<Play className="w-3.5 h-3.5" />}
                  title={`Trigger ${vt.event_type} -> ${vt.to_state}`}
                >
                  {vt.event_type.replace(/_/g, ' ')}
                </Button>
              ))
            ) : (
              <div className="text-xs text-[var(--cx-color-text-muted)] italic px-3 py-1.5 bg-[var(--cx-color-surface-subtle)] rounded-md border border-[var(--cx-color-border)]">
                No outgoing transitions (Terminal State)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Custom Fields & Linked Permits Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Custom Fields Card */}
        <div className="md:col-span-1 bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-5 shadow-xs space-y-4">
          <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider border-b border-[var(--cx-color-border)] pb-2">
            Attributes & Custom Fields
          </div>

          <div className="space-y-3 text-xs">
            {Object.entries(customFields).map(([k, v]) => {
              if (k === 'linked_permit_id' && v) {
                return (
                  <div key={k} className="p-2.5 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md">
                    <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      <span>Linked Permit (Cross-Entity Gate)</span>
                    </div>
                    <div className="font-mono text-xs font-bold text-[var(--cx-color-brand-primary)] mt-1">
                      {String(v)}
                    </div>
                    {onNavigateToEntity && (
                      <button
                        onClick={() => onNavigateToEntity('permit', String(v))}
                        className="mt-1.5 text-[11px] text-[var(--cx-color-brand-primary)] hover:underline font-semibold block"
                      >
                        Open Linked Permit →
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div key={k}>
                  <div className="text-[10px] font-semibold text-[var(--cx-color-text-muted)] uppercase">
                    {k.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-medium text-[var(--cx-color-text)] mt-0.5 break-words">
                    {v !== null && v !== undefined && v !== '' ? String(v) : <span className="italic text-gray-400">None</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit Timeline / Event Log */}
        <div className="md:col-span-2 bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--cx-color-border)] pb-3 mb-4">
            <div>
              <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider">
                Append-Only Event Sourcing Audit Log
              </div>
              <div className="text-[11px] text-[var(--cx-color-text-muted)]">
                Immutable record of every state transition & gate evaluation.
              </div>
            </div>
            <Badge variant="primary" size="sm">
              {events.length} Events
            </Badge>
          </div>

          <AuditTimeline events={events} />
        </div>
      </div>

      {/* Transition Modal */}
      {selectedTransition && (
        <TransitionModal
          isOpen={true}
          onClose={() => setSelectedTransition(null)}
          entity={entity}
          transition={selectedTransition}
          onTransitionSuccess={loadData}
        />
      )}
    </div>
  );
};
