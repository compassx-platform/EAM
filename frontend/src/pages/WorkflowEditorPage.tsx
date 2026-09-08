import React, { useState, useEffect } from 'react';
import { WorkflowDefinition } from '../types';
import { api } from '../api/client';
import { Tabs, TabItem } from '../design-system/components/Tabs';
import { WorkflowCanvas } from '../components/Canvas/WorkflowCanvas';
import { VersionPublishBar } from '../components/Versioning/VersionPublishBar';
import { SimulatePanel } from '../components/Simulator/SimulatePanel';
import { ClipboardList, FileCheck2, Workflow, Sparkles } from 'lucide-react';

export const WorkflowEditorPage: React.FC = () => {
  const [activeEntityType, setActiveEntityType] = useState<string>('workorder');
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowDefinition | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'simulator'>('canvas');
  const [loading, setLoading] = useState(true);

  const entityTabs: TabItem[] = [
    {
      id: 'workorder',
      label: 'Work Order Workflow',
      icon: <ClipboardList className="w-4 h-4 text-blue-600" />,
    },
    {
      id: 'permit',
      label: 'Permit to Work Workflow',
      icon: <FileCheck2 className="w-4 h-4 text-emerald-600" />,
    },
  ];

  const editorTabs: TabItem[] = [
    {
      id: 'canvas',
      label: 'Visual State Machine Canvas',
      icon: <Workflow className="w-4 h-4" />,
    },
    {
      id: 'simulator',
      label: 'Transition Gate Sandbox (Try It)',
      icon: <Sparkles className="w-4 h-4 text-amber-500" />,
    },
  ];

  const loadWorkflows = async (type: string) => {
    setLoading(true);
    try {
      const list = await api.listWorkflows(type);
      setWorkflows(list);
      // Select published version by default or first available
      const published = list.find((w) => w.status === 'published');
      setCurrentWorkflow(published || list[0] || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows(activeEntityType);
  }, [activeEntityType]);

  const handleSaveDraft = async () => {
    if (!currentWorkflow) return;
    try {
      const nextVersionLabel =
        currentWorkflow.status === 'published'
          ? `${activeEntityType}_v${workflows.length + 1}_draft`
          : currentWorkflow.version_label;

      const saved = await api.saveWorkflowDraft({
        id: currentWorkflow.status === 'published' ? undefined : currentWorkflow.id,
        entity_type: activeEntityType,
        version_label: nextVersionLabel,
        definition: currentWorkflow.definition,
      });

      alert(`Workflow draft saved as '${saved.version_label}'.`);
      await loadWorkflows(activeEntityType);
      setCurrentWorkflow(saved);
    } catch (err: any) {
      alert(`Save draft error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Entity Switcher Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="text-sm font-bold text-[var(--cx-color-text)]">
            Workflow Architecture & State Machine Graph
          </h2>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            User-editable declarative data orchestrating lifecycle progression (Section 2, Principle 5).
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[var(--cx-color-surface)] p-1 rounded-lg border border-[var(--cx-color-border)] shadow-xs">
          <button
            type="button"
            onClick={() => setActiveEntityType('workorder')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeEntityType === 'workorder'
                ? 'bg-[var(--cx-color-brand-primary)] text-white shadow-xs font-bold'
                : 'text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Work Order Workflow</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveEntityType('permit')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeEntityType === 'permit'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Permit to Work Workflow</span>
          </button>
        </div>
      </div>

      {loading || !currentWorkflow ? (
        <div className="p-12 text-center text-xs text-[var(--cx-color-text-muted)] animate-pulse">
          Loading workflow state machine definition...
        </div>
      ) : (
        <div className="space-y-5">
          {/* Version / Publish Bar */}
          <VersionPublishBar
            workflow={currentWorkflow}
            allVersions={workflows}
            onWorkflowUpdated={(updated) => {
              setCurrentWorkflow(updated);
              loadWorkflows(activeEntityType);
            }}
            onSelectVersion={(id) => {
              const sel = workflows.find((w) => w.id === id);
              if (sel) setCurrentWorkflow(sel);
            }}
            onSaveDraft={handleSaveDraft}
          />

          {/* Canvas vs Simulator Subtabs */}
          <Tabs
            tabs={editorTabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as any)}
          />

          {activeTab === 'canvas' && (
            <WorkflowCanvas
              workflow={currentWorkflow}
              onChange={(updated) => setCurrentWorkflow(updated)}
              entityType={activeEntityType}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatePanel
              entityType={activeEntityType}
              workflow={currentWorkflow}
            />
          )}
        </div>
      )}
    </div>
  );
};
