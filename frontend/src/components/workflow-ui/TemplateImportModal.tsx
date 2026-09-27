import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  Package,
  Layers,
  ShieldCheck,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Loader2,
  Wrench,
  ShieldAlert,
  DollarSign,
  AlertTriangle,
  FileCode,
  FileCheck,
  Copy,
  Info
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  WorkflowTemplateManifest,
  WorkflowBundle,
  WorkflowImportPayload,
  WorkflowImportResult,
  EntityTypeDefinition
} from '../../types';

export interface TemplateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (result: WorkflowImportResult) => void;
  initialEntityType?: string;
}

export function TemplateImportModal({
  isOpen,
  onClose,
  onImportSuccess,
  initialEntityType,
}: TemplateImportModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'upload'>('templates');
  const [templates, setTemplates] = useState<WorkflowTemplateManifest[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<WorkflowBundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);

  // Upload state
  const [uploadedJsonText, setUploadedJsonText] = useState('');
  const [uploadedBundle, setUploadedBundle] = useState<WorkflowBundle | null>(null);
  const [uploadParseError, setUploadParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import configuration
  const [targetEntityType, setTargetEntityType] = useState(initialEntityType || '');
  const [customEntityType, setCustomEntityType] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState<'new_draft' | 'overwrite_draft'>('new_draft');
  const [importConditions, setImportConditions] = useState(true);
  const [importRoles, setImportRoles] = useState(true);
  const [importFieldsAndForms, setImportFieldsAndForms] = useState(true);
  const [activateImmediately, setActivateImmediately] = useState(false);

  // Execution state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<WorkflowImportResult | null>(null);

  // Load initial templates and entity types
  useEffect(() => {
    if (!isOpen) return;
    setLoadingTemplates(true);
    setImportError(null);
    setImportResult(null);

    Promise.all([
      api.listWorkflowTemplates().catch(() => [] as WorkflowTemplateManifest[]),
      api.listEntityTypes().catch(() => [] as EntityTypeDefinition[]),
    ])
      .then(([tmpls, ets]) => {
        setTemplates(tmpls);
        setEntityTypes(ets);
        if (tmpls.length > 0 && !selectedTemplateId) {
          handleSelectTemplate(tmpls[0].template_id);
        }
      })
      .finally(() => setLoadingTemplates(false));
  }, [isOpen]);

  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setLoadingBundle(true);
    setImportError(null);
    try {
      const bundle = await api.getWorkflowTemplate(templateId);
      setSelectedBundle(bundle);
      if (!targetEntityType) {
        setTargetEntityType(bundle.manifest?.entity_type || 'workorder');
      }
    } catch (err: any) {
      setImportError(err.message || 'Failed to load template bundle');
    } finally {
      setLoadingBundle(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setUploadedJsonText(text);
        const parsed = JSON.parse(text);
        if (!parsed.workflow && !parsed.states) {
          throw new Error("Invalid package: missing 'workflow' or 'states' definition");
        }
        setUploadedBundle(parsed);
        setUploadParseError(null);
        if (parsed.manifest?.entity_type) {
          setTargetEntityType(parsed.manifest.entity_type);
        }
      } catch (err: any) {
        setUploadParseError(err.message || 'Failed to parse JSON file');
        setUploadedBundle(null);
      }
    };
    reader.readAsText(file);
  };

  const handleJsonTextChange = (text: string) => {
    setUploadedJsonText(text);
    if (!text.trim()) {
      setUploadedBundle(null);
      setUploadParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed.workflow && !parsed.states) {
        throw new Error("JSON must contain a 'workflow' or 'states' object");
      }
      setUploadedBundle(parsed);
      setUploadParseError(null);
      if (parsed.manifest?.entity_type) {
        setTargetEntityType(parsed.manifest.entity_type);
      }
    } catch (err: any) {
      setUploadParseError(err.message);
      setUploadedBundle(null);
    }
  };

  const activeBundle = activeTab === 'templates' ? selectedBundle : uploadedBundle;

  const handleExecuteImport = async () => {
    if (!activeBundle) return;
    const finalEntity = customEntityType.trim() ? customEntityType.trim().toLowerCase() : targetEntityType;
    if (!finalEntity) {
      setImportError('Please select or enter a target entity type.');
      return;
    }

    setImporting(true);
    setImportError(null);

    const payload: WorkflowImportPayload = {
      bundle: activeBundle,
      target_entity_type: finalEntity,
      conflict_strategy: conflictStrategy,
      import_conditions: importConditions,
      import_roles: importRoles,
      import_fields_and_forms: importFieldsAndForms,
      activate_immediately: activateImmediately,
      created_by: 'admin@compassx.io',
    };

    try {
      const res = await api.importWorkflow(payload);
      setImportResult(res);
      onImportSuccess(res);
    } catch (err: any) {
      let msg = err.message || 'Failed to import workflow bundle';
      if (err.detail?.errors) {
        msg = err.detail.errors.join('; ');
      } else if (err.detail?.message) {
        msg = `${err.detail.message}: ${(err.detail.errors || []).join('; ')}`;
      }
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[88vh] max-h-[850px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">
                  Workflow Template Packages & Import
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-gray-600">
                  v1.0 Bundle
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Deploy curated industry workflows or import portable definition bundles into your environment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Segmented Tab Bar */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('templates')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'templates'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Template Library</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'upload'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Upload className="h-3.5 w-3.5 text-gray-600" />
                <span>Custom JSON Bundle</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Column: Selector (Templates or JSON File Drop) */}
          <div className="flex w-2/5 flex-col border-r border-gray-100 bg-slate-50/50 min-h-0">
            {activeTab === 'templates' ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="border-b border-gray-100 px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Pre-Built Industry Templates ({templates.length})
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {loadingTemplates ? (
                    <div className="flex flex-col items-center justify-center p-8 text-xs text-gray-400 gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <span>Loading templates...</span>
                    </div>
                  ) : (
                    templates.map((tmpl) => {
                      const isSelected = selectedTemplateId === tmpl.template_id;
                      return (
                        <div
                          key={tmpl.template_id}
                          onClick={() => handleSelectTemplate(tmpl.template_id)}
                          className={`cursor-pointer rounded-xl border p-3 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/60 shadow-xs ring-1 ring-blue-500/20'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-gray-100 border-gray-200 text-gray-700'
                                }`}
                              >
                                {tmpl.icon === 'Wrench' ? (
                                  <Wrench className="h-3.5 w-3.5" />
                                ) : tmpl.icon === 'ShieldAlert' ? (
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                ) : tmpl.icon === 'DollarSign' ? (
                                  <DollarSign className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <span className="font-semibold text-xs text-gray-900 truncate">
                                {tmpl.name}
                              </span>
                            </div>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600 shrink-0">
                              {tmpl.complexity}
                            </span>
                          </div>

                          <p className="mt-1.5 line-clamp-2 text-[11px] text-gray-500 leading-relaxed">
                            {tmpl.description}
                          </p>

                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-gray-100/80 pt-2 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3 text-gray-400" />
                              <strong className="text-gray-700">{tmpl.state_count}</strong> states
                            </span>
                            <span className="text-gray-300">•</span>
                            <span>
                              <strong className="text-gray-700">{tmpl.transition_count}</strong> transitions
                            </span>
                            {tmpl.condition_count !== undefined && tmpl.condition_count > 0 && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span className="flex items-center gap-1">
                                  <ShieldCheck className="h-3 w-3 text-blue-600" />
                                  <strong className="text-gray-700">{tmpl.condition_count}</strong> cond
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full min-h-0 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Upload Workflow JSON
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 shadow-2xs hover:bg-gray-50"
                  >
                    <Upload className="h-3 w-3 text-gray-500" />
                    <span>Browse File</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Drop Target Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center hover:border-blue-400 hover:bg-blue-50/20 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                    <FileCode className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold text-gray-800">
                    Click to browse or drop .json package
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Supports CompassX bundles and raw workflow JSON schemas
                  </div>
                </div>

                <div className="flex flex-col flex-1 min-h-0 gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Or Paste Raw JSON Package:
                  </label>
                  <textarea
                    value={uploadedJsonText}
                    onChange={(e) => handleJsonTextChange(e.target.value)}
                    placeholder='{"manifest": {...}, "workflow": {"states": [...], "transitions": [...]}}'
                    className="flex-1 w-full font-mono text-[11px] rounded-lg border border-gray-200 bg-white p-2.5 text-gray-800 focus:border-blue-500 focus:outline-none resize-none shadow-2xs"
                  />
                </div>

                {uploadParseError && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{uploadParseError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Package Inspector & Import Configurator */}
          <div className="flex w-3/5 flex-col min-h-0 overflow-y-auto p-5 bg-white">
            {loadingBundle ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span>Loading package details...</span>
              </div>
            ) : activeBundle ? (
              <div className="space-y-5">
                {/* Bundle Header Banner */}
                <div className="rounded-xl border border-gray-200 bg-slate-50/60 p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-gray-900">
                        {activeBundle.manifest?.name || 'Imported Workflow Package'}
                      </h3>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-gray-700">
                      {activeBundle.manifest?.version_label || 'v1.0'}
                    </span>
                  </div>
                  {activeBundle.manifest?.description && (
                    <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                      {activeBundle.manifest.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600 border-t border-gray-200/60 pt-2.5">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-gray-400" />
                      <strong>{activeBundle.workflow?.states?.length || 0}</strong> States
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>
                      <strong>{activeBundle.workflow?.transitions?.length || 0}</strong> Transitions
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                      <strong>{activeBundle.conditions?.length || 0}</strong> Conditions
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <strong>{activeBundle.roles?.length || 0}</strong> Roles
                    </span>
                  </div>
                </div>

                {/* Workflow Topology Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                      Workflow States & Flow Path
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Entry: <strong className="text-gray-700">{activeBundle.workflow?.entry_state || activeBundle.workflow?.states?.[0] || 'Start'}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5">
                    {(activeBundle.workflow?.states || []).map((state, idx) => {
                      const isTerminal = (activeBundle.workflow?.terminal_states || []).includes(state);
                      const isEntry = state === (activeBundle.workflow?.entry_state || activeBundle.workflow?.states?.[0]);
                      return (
                        <React.Fragment key={state}>
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-semibold border ${
                              isEntry
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : isTerminal
                                ? 'bg-gray-100 text-gray-800 border-gray-300'
                                : 'bg-white text-gray-700 border-gray-200'
                            }`}
                          >
                            {state}
                          </span>
                          {idx < (activeBundle.workflow?.states || []).length - 1 && (
                            <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Import Destination & Configuration */}
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                    Import Destination & Rules
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Target Entity Type */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700">
                        Target Entity Type
                      </label>
                      <select
                        value={targetEntityType}
                        onChange={(e) => {
                          setTargetEntityType(e.target.value);
                          setCustomEntityType('');
                        }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none shadow-2xs"
                      >
                        {entityTypes.map((et) => (
                          <option key={et.name} value={et.name}>
                            {et.display_name} ({et.name})
                          </option>
                        ))}
                        <option value="custom">+ Create New Entity Type</option>
                      </select>
                      {targetEntityType === 'custom' && (
                        <input
                          type="text"
                          placeholder="e.g. calibration_task"
                          value={customEntityType}
                          onChange={(e) => setCustomEntityType(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                        />
                      )}
                    </div>

                    {/* Conflict Strategy */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700">
                        Draft Versioning Strategy
                      </label>
                      <select
                        value={conflictStrategy}
                        onChange={(e) => setConflictStrategy(e.target.value as any)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none shadow-2xs"
                      >
                        <option value="new_draft">Create Next Draft Revision (Safe)</option>
                        <option value="overwrite_draft">Overwrite Current Draft (if exists)</option>
                      </select>
                    </div>
                  </div>

                  {/* Component Checkbox Toggles */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 block">
                      Component Synchronization Options
                    </span>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importConditions}
                        onChange={(e) => setImportConditions(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span>
                        Import & merge Condition Definitions (
                        <strong className="text-gray-900">{activeBundle.conditions?.length || 0}</strong> bundled)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importRoles}
                        onChange={(e) => setImportRoles(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span>
                        Import & register Workflow Roles (
                        <strong className="text-gray-900">{activeBundle.roles?.length || 0}</strong> bundled)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importFieldsAndForms}
                        onChange={(e) => setImportFieldsAndForms(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span>Import entity fields and form layout (if included)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1 border-t border-gray-200/60">
                      <input
                        type="checkbox"
                        checked={activateImmediately}
                        onChange={(e) => setActivateImmediately(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <span className="font-semibold text-gray-900">
                        Activate (Publish) Process immediately upon import
                      </span>
                    </label>
                  </div>
                </div>

                {importError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{importError}</span>
                  </div>
                )}

                {importResult && (
                  <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-900 animate-in fade-in">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Workflow Package Imported Successfully!</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-800 pt-1">
                      <div>Entity Type: <strong>{importResult.summary.entity_type}</strong></div>
                      <div>Revision: <strong>{importResult.summary.version_label}</strong> ({importResult.summary.status})</div>
                      <div>States: <strong>{importResult.summary.states_count}</strong></div>
                      <div>Transitions: <strong>{importResult.summary.transitions_count}</strong></div>
                      <div>Conditions Merged: <strong>{importResult.summary.conditions_imported}</strong></div>
                      <div>Roles Merged: <strong>{importResult.summary.roles_imported}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 gap-2">
                <Package className="h-8 w-8 text-gray-300" />
                <span>Select a template or upload a JSON package to preview</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/80 px-6 py-3 shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-gray-400" />
            <span>Templates are validated against §6 graph rules before ingestion.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!activeBundle || importing}
              onClick={handleExecuteImport}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Deploy & Import Process</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
