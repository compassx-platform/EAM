import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { Escalation, EntityTypeDefinition } from '../../types';
import { EscalationList } from './EscalationList';
import { EscalationEditor } from './EscalationEditor';
import { EscalationLogs } from './EscalationLogs';

export function EscalationsView() {
  const [view, setView] = useState<'list' | 'editor' | 'logs'>('list');
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [logEscalationId, setLogEscalationId] = useState<string | undefined>(undefined);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [escList, types] = await Promise.all([
        api.listEscalations(),
        api.listEntityTypes().catch(() => []),
      ]);
      setEscalations(escList);
      setEntityTypes(types);
    } catch (err: any) {
      flash('err', err.message || 'Failed to load escalations');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNew = () => {
    setSelectedEscalation(null);
    setView('editor');
  };

  const handleEdit = (esc: Escalation) => {
    setSelectedEscalation(esc);
    setView('editor');
  };

  const handleViewLogs = (escId?: string) => {
    setLogEscalationId(escId);
    setView('logs');
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await api.activateEscalation(id, active);
      flash('ok', `Escalation ${id} ${active ? 'activated' : 'deactivated'}.`);
      loadData();
    } catch (err: any) {
      flash('err', err.message || 'Failed to toggle status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete escalation "${id}"?`)) return;
    try {
      await api.deleteEscalation(id);
      flash('ok', `Escalation "${id}" deleted.`);
      loadData();
    } catch (err: any) {
      flash('err', err.message || 'Failed to delete escalation');
    }
  };

  const handleRunSingle = async (id: string) => {
    try {
      const res = await api.runEscalation(id);
      flash('ok', `Escalation evaluated. ${res.triggered_count} action(s) triggered.`);
      loadData();
    } catch (err: any) {
      flash('err', err.message || 'Failed to execute escalation');
    }
  };

  const handleRunAll = async () => {
    try {
      const res = await api.runAllEscalations();
      flash('ok', `Watchdogs ran across all active rules. ${res.triggered_count} action(s) triggered.`);
      loadData();
    } catch (err: any) {
      flash('err', err.message || 'Failed to run watchdogs');
    }
  };

  const handleSave = async (escPayload: Partial<Escalation>) => {
    try {
      if (selectedEscalation?.id) {
        await api.updateEscalation(selectedEscalation.id, escPayload);
        flash('ok', `Escalation "${selectedEscalation.id}" updated.`);
      } else {
        await api.createEscalation(escPayload);
        flash('ok', `Escalation "${escPayload.name}" created.`);
      }
      setView('list');
      loadData();
    } catch (err: any) {
      flash('err', err.message || 'Failed to save escalation');
      throw err;
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col min-h-0 overflow-hidden bg-white">
      {notice && (
        <div
          className={`absolute top-4 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-lg transition-all ${
            notice.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {view === 'editor' ? (
        <EscalationEditor
          escalation={selectedEscalation}
          entityTypes={entityTypes}
          onBack={() => setView('list')}
          onSave={handleSave}
          onRun={selectedEscalation ? handleRunSingle : undefined}
          onViewLogs={selectedEscalation ? handleViewLogs : undefined}
        />
      ) : view === 'logs' ? (
        <EscalationLogs
          escalationId={logEscalationId}
          onBack={() => setView('list')}
        />
      ) : (
        <EscalationList
          escalations={escalations}
          entityTypes={entityTypes}
          loading={loading}
          onNew={handleNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onRunSingle={handleRunSingle}
          onRunAll={handleRunAll}
          onViewLogs={handleViewLogs}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
