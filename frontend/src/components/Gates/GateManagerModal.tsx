import React, { useState, useEffect } from 'react';
import { GateInstance } from '../../types';
import { api } from '../../api/client';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import { Modal } from '../../design-system/components/Modal';
import { ConditionBuilder } from './ConditionBuilder';
import { ShieldCheck, Plus, Trash2, Edit2, ShieldAlert } from 'lucide-react';

interface GateManagerModalProps {
  entityType: string;
}

export const GateManagerModal: React.FC<GateManagerModalProps> = ({ entityType }) => {
  const [gates, setGates] = useState<GateInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingGate, setEditingGate] = useState<Partial<GateInstance> | null>(null);

  const loadGates = async () => {
    setLoading(true);
    try {
      const res = await api.listGates(entityType);
      setGates(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGates();
  }, [entityType]);

  const handleSaveGate = async (gate: Partial<GateInstance>) => {
    try {
      await api.saveGate(gate);
      setIsBuilderOpen(false);
      setEditingGate(null);
      loadGates();
    } catch (err: any) {
      alert(`Error saving gate: ${err.message}`);
    }
  };

  const handleDeleteGate = async (id: string) => {
    if (confirm(`Delete gate instance '${id}'?`)) {
      try {
        await api.deleteGate(id);
        loadGates();
      } catch (err: any) {
        alert(`Error deleting gate: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--cx-color-text)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <span>Parameterized Gate Instances Registry ({entityType})</span>
          </h3>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Reusable business and compliance enforcement gates attached to state machine transitions (Section 3.6).
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setEditingGate(null);
            setIsBuilderOpen(true);
          }}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Create Gate Instance
        </Button>
      </div>

      {/* Table of Gates */}
      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] overflow-hidden shadow-xs">
        <table className="cx-table">
          <thead>
            <tr>
              <th>Gate Label</th>
              <th>Gate Type</th>
              <th>Enforcement Parameters</th>
              <th>Failure Policy</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.id}>
                <td className="font-semibold text-xs text-[var(--cx-color-text)]">
                  <div>{g.label}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{g.id}</div>
                </td>
                <td>
                  <Badge variant="primary" size="sm">
                    {g.gate_type}
                  </Badge>
                </td>
                <td className="font-mono text-[11px] text-[var(--cx-color-text-muted)] max-w-xs truncate">
                  {JSON.stringify(g.params)}
                </td>
                <td>
                  <Badge variant={g.failure_policy === 'block' ? 'error' : 'warning'} size="sm">
                    {g.failure_policy === 'block' ? 'Fail-Closed (Block)' : 'Fail-Open (Allow)'}
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingGate(g);
                        setIsBuilderOpen(true);
                      }}
                      className="p-1 text-gray-500 hover:text-[var(--cx-color-brand-primary)] rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGate(g.id)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Condition Builder Modal */}
      <Modal
        isOpen={isBuilderOpen}
        onClose={() => {
          setIsBuilderOpen(false);
          setEditingGate(null);
        }}
        title={editingGate ? 'Edit Gate Instance' : 'Create New Reusable Gate Instance'}
        description="Attach this gate instance to any state machine transition."
        maxWidth="lg"
      >
        <ConditionBuilder
          entityType={entityType}
          initialGate={editingGate || undefined}
          onSave={handleSaveGate}
          onCancel={() => {
            setIsBuilderOpen(false);
            setEditingGate(null);
          }}
        />
      </Modal>
    </div>
  );
};
