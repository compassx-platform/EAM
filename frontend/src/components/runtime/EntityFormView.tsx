import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  FileText,
  History,
  Layers,
  Loader2,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Workflow,
  X,
  Zap,
  Info,
  Users,
} from 'lucide-react';
import { api } from '../../api/client';
import { isItemVisible, withWorkflowStatus } from '../../lib/conditions';
import type {
  EntityField,
  EntityFormItem,
  EntityRecord,
  EntityEvent,
  ValidTransition,
  ChecklistItem,
  ResolvedList,
  ConditionDefinition,
  ConditionTraceItem,
  Person,
  PersonGroup,
} from '../../types';
import type { AttachedFile } from './EntityCreateForm';

export interface EntityFormViewProps {
  entity?: EntityRecord | null;
  recordId?: string | null;
  entityType?: string;
  onClose?: () => void;
  onRecordUpdated?: () => void;
  isModal?: boolean;
}

interface ResolvedField {
  key: string;
  name: string;
  label?: string;
  type: string;
  required: boolean;
  options: string[];
  checklistItems?: ChecklistItem[];
  placeholder?: string;
  accept?: string;
  maxFileSizeMb?: number;
  allowMultiple?: boolean;
  maxFiles?: number;
  referenceEntityType?: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  requested: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-blue-100 text-blue-800 border-blue-200',
  isolationprecheck: 'bg-purple-100 text-purple-800 border-purple-200',
  riskassessed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
  expired: 'bg-orange-100 text-orange-800 border-orange-200',
};

function statusBadge(s?: string) {
  if (!s) return 'bg-gray-100 text-gray-700 border-gray-200';
  return STATUS_BADGE[s.toLowerCase()] ?? 'bg-blue-50 text-blue-700 border-blue-200';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useContainerSize(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !active) return;
    const update = () => {
      setWidth(Math.round(node.getBoundingClientRect().width));
      setMounted(true);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(node);
      return () => ro.disconnect();
    }
    return undefined;
  }, [active]);
  return { width, mounted, containerRef };
}

const TITLE_KEYS = ['title', 'name', 'subject', 'summary', 'label'];

function getEntityTitle(e: { custom_fields?: Record<string, unknown> } | null | undefined): string | null {
  if (!e) return null;
  const cf = e.custom_fields || {};
  for (const k of TITLE_KEYS) {
    const v = cf[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return null;
}

export function EntityFormView({
  entity: initialEntity,
  recordId: initialRecordId,
  entityType: propType,
  onClose,
  onRecordUpdated,
  isModal = false,
}: EntityFormViewProps) {
  const [entityRecord, setEntityRecord] = useState<EntityRecord | null>(initialEntity || null);
  const [events, setEvents] = useState<EntityEvent[]>([]);
  const [validTransitions, setValidTransitions] = useState<ValidTransition[]>([]);
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [conditionMap, setConditionMap] = useState<Record<string, { label: string; type: string }>>({});
  const [resolved, setResolved] = useState<Record<string, ResolvedList>>({});
  const [persons, setPersons] = useState<Person[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [firingEvent, setFiringEvent] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const activeId = initialRecordId || initialEntity?.id || '';
  const entityType = propType || initialEntity?.entity_type || (entityRecord as any)?.entity_type || '';

  const { width, mounted, containerRef } = useContainerSize(loaded);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoaded(false);
    setErr(null);

    try {
      const [formRes, condList, fieldsRes, personsRes, groupsRes] = await Promise.all([
        api.getForm(entityType).catch(() => ({ layout: [], fields: [], cols: 12, row_height: 40 })),
        api.listConditions(entityType).catch(() => [] as ConditionDefinition[]),
        api.listFields(entityType).catch(() => [] as EntityField[]),
        api.listPersons({ limit: 200 }).catch(() => ({ items: [] })),
        api.listPersonGroups().catch(() => ({ items: [] })),
      ]);

      const cMap: Record<string, { label: string; type: string }> = {};
      for (const g of condList) cMap[g.id] = { label: g.label, type: g.type };
      setConditionMap(cMap);
      setConditions(condList);
      setFields(fieldsRes);
      setPersons(personsRes.items || []);
      setPersonGroups(groupsRes.items || []);

      const layout = ((formRes.layout || []) as Array<any>).map((it) => {
        const isGroup = Boolean(it.isGroup ?? it.is_group ?? it.i?.startsWith('group:'));
        const isHeader = Boolean(it.isHeader ?? it.is_header ?? it.i?.startsWith('header:'));
        return {
          ...it,
          isHeader,
          isGroup,
          is_header: undefined,
          is_group: undefined,
          fieldName: it.fieldName ?? it.field_name ?? (isHeader || isGroup ? null : it.i),
          fieldType: it.fieldType ?? it.field_type ?? null,
          optionsList: it.optionsList ?? it.options_list ?? null,
          options_list: undefined,
          hiddenOptions: it.hiddenOptions ?? it.hidden_options ?? [],
          hidden_options: undefined,
          groupId: it.groupId ?? it.group_id ?? (isGroup ? it.i : null),
          group_id: undefined,
          groupTitle: it.groupTitle ?? it.group_title ?? (isGroup ? (it.label || 'Group') : null),
          group_title: undefined,
          visibilityCondition: it.visibilityCondition ?? it.visibility_condition ?? null,
          visibility_condition: undefined,
          accept: it.accept ?? undefined,
          maxFileSizeMb: it.maxFileSizeMb ?? it.max_file_size_mb ?? 10,
          allowMultiple: it.allowMultiple ?? it.allow_multiple ?? false,
          maxFiles: it.maxFiles ?? it.max_files ?? 5,
        };
      });
      setItems(layout);
      setCols(formRes.cols || 12);
      setRowHeight(formRes.row_height || 40);

      const layoutKeys = layout.map((it) => it.optionsList).filter((k): k is string => Boolean(k));
      const fieldKeys = (formRes.fields || fieldsRes || [])
        .map((f: EntityField) => f.option_list_key)
        .filter((k): k is string => Boolean(k));
      const keys = [...new Set([...layoutKeys, ...fieldKeys])];
      if (keys.length > 0) {
        const r = await api.resolveLists(keys).catch(() => ({ resolved: {} }));
        setResolved(r.resolved || {});
      }

      // Fetch Entity and Valid Transitions
      if (activeId) {
        const [entityDetail, validRes] = await Promise.all([
          api.getEntity(entityType, activeId),
          api.listValidTransitions(entityType, activeId).catch(() => ({ valid_transitions: [] })),
        ]);
        setEntityRecord(entityDetail.entity);
        setEvents(entityDetail.events || []);
        setValidTransitions(validRes.valid_transitions || []);
      } else if (initialEntity) {
        setEntityRecord(initialEntity);
        const validRes = await api.listValidTransitions(entityType, initialEntity.id).catch(() => ({ valid_transitions: [] }));
        setValidTransitions(validRes.valid_transitions || []);
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to load record');
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, [activeId, entityType, initialEntity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Current entity custom fields + workflow status
  const currentEntity = entityRecord || initialEntity;
  const customFields: Record<string, unknown> = currentEntity?.custom_fields || {};
  const baseConditionValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(customFields)) {
    if (v === null || v === undefined) {
      baseConditionValues[k] = '';
    } else if (typeof v === 'object') {
      baseConditionValues[k] = JSON.stringify(v);
    } else {
      baseConditionValues[k] = String(v);
    }
  }
  const valuesForCondition = withWorkflowStatus(baseConditionValues, currentEntity?.status);

  const byName = useMemo(() => new Map(fields.map((f) => [f.field_name, f])), [fields]);

  const resolveItem = (it: EntityFormItem): ResolvedField | null => {
    if (it.isHeader || it.isGroup) return null;
    if (it.fieldType) {
      const list = it.optionsList ? resolved[it.optionsList] : undefined;
      let options = it.options || [];
      let checklistItems: ChecklistItem[] | undefined;
      if (list) {
        if (list.kind === 'options') options = list.items as string[];
        else if (list.kind === 'checklist') checklistItems = list.items as ChecklistItem[];
      }
      const hidden = new Set(it.hiddenOptions || (it as any).hidden_options || []);
      if (hidden.size > 0) {
        options = options.filter((opt) => !hidden.has(opt));
        if (checklistItems) {
          checklistItems = checklistItems.filter((item) => !hidden.has(item.label));
        }
      }
      return {
        key: it.i,
        name: it.fieldName || it.i,
        label: it.label ?? undefined,
        type: it.fieldType,
        required: Boolean(it.required),
        options,
        checklistItems,
        placeholder: it.placeholder ?? undefined,
        accept: it.accept ?? undefined,
        maxFileSizeMb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? 10,
        allowMultiple: it.allowMultiple ?? (it as any).allow_multiple ?? false,
        maxFiles: it.maxFiles ?? (it as any).max_files ?? 5,
        referenceEntityType:
          (it as any).referenceEntityType ||
          (it as any).reference_entity_type ||
          (it.fieldName === 'assigned_to' ? 'person' : it.fieldName === 'owner_group' ? 'person_group' : null),
      };
    }
    const f = byName.get(it.i);
    if (!f) return null;
    let options = f.select_options || [];
    if (f.option_list_key && resolved[f.option_list_key]) {
      const list = resolved[f.option_list_key];
      if (list.kind === 'options') options = list.items as string[];
    }
    return {
      key: it.i,
      name: f.field_name,
      type: f.field_type,
      required: f.required,
      options,
      checklistItems: undefined,
      referenceEntityType:
        f.reference_entity_type ||
        (f.field_name === 'assigned_to' ? 'person' : f.field_name === 'owner_group' ? 'person_group' : null),
    };
  };

  const currentlyVisibleItems = items.filter((it) => {
    if (!it.isHeader && !it.isGroup && resolveItem(it) === null) {
      return false;
    }
    return isItemVisible(it, items, valuesForCondition, conditions);
  });

  const handleFireTransition = async (t: ValidTransition) => {
    if (!currentEntity || firingEvent) return;
    setFiringEvent(t.event_type);
    setTransitionError(null);
    try {
      await api.transition(entityType, {
        entity_id: currentEntity.id,
        event_type: t.event_type,
      });
      await loadData(true);
      onRecordUpdated?.();
    } catch (e: any) {
      setTransitionError(e.message || `Failed to fire transition "${t.event_type}"`);
    } finally {
      setFiringEvent(null);
    }
  };

  const hasLayout = items.length > 0;
  const entityTitleStr = getEntityTitle(currentEntity);

  const content = (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Surface Navigation & Record Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-3.5 shrink-0 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>{entityTitleStr || `${entityType} Record`}</span>
            </h1>
            {currentEntity?.status && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(currentEntity.status)}`}>
                {currentEntity.status}
              </span>
            )}
          </div>

          {currentEntity && (
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 font-semibold">{entityType}</span>
              <span>·</span>
              <span className="truncate max-w-[140px]" title={currentEntity.id}>ID: {currentEntity.id}</span>
              {currentEntity.workflow_version && (
                <>
                  <span>·</span>
                  <span>{currentEntity.workflow_version}</span>
                </>
              )}
              {currentEntity.created_at && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-sans text-gray-400">
                    <Clock className="h-3 w-3" />
                    {new Date(currentEntity.created_at).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Header Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Audit Timeline Sidebar Toggle Button */}
          <button
            type="button"
            onClick={() => setAuditLogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-2xs transition-colors"
            title="View audit timeline & event history"
          >
            <History className="h-3.5 w-3.5 text-gray-500" />
            <span>Audit Log</span>
            {events.length > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] font-mono text-gray-600">
                {events.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => loadData(true)}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-2xs transition-colors"
            title="Refresh record"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {onClose && isModal && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Form Body Surface */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 min-h-0 bg-slate-100/60">
        {!loaded ? (
          <div className="flex flex-col items-center justify-center py-28 text-gray-400">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600 mb-3" />
            <p className="text-xs font-medium text-gray-500">Loading full page form layout…</p>
          </div>
        ) : err ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700 shadow-xs">
            <p className="font-semibold text-sm mb-1">Failed to load record</p>
            <p>{err}</p>
          </div>
        ) : !currentEntity ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center text-xs text-gray-400 shadow-xs">
            No record found for identifier <span className="font-mono font-bold">{activeId}</span>.
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Top Workflow Actions Banner: Drive workflow directly from full-page form */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Current Stage: <span className="text-blue-700">{currentEntity.status}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {validTransitions.length > 0
                    ? `Click an action to transition this ${entityType} record to the next workflow stage.`
                    : `This record is currently in state "${currentEntity.status}".`}
                </p>
              </div>

              {/* Action Buttons: Directly fire the event on 1 click */}
              <div className="flex flex-wrap items-center gap-2">
                {validTransitions.length === 0 ? (
                  <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200/60">
                    No actions available from this state
                  </span>
                ) : (
                  validTransitions.map((t) => {
                    const isFiring = firingEvent === t.event_type;
                    const isAnyFiring = firingEvent !== null;
                    const condCount = (t.conditions || []).length;
                    return (
                      <button
                        key={t.event_type}
                        type="button"
                        disabled={isAnyFiring}
                        onClick={() => handleFireTransition(t)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 active:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isFiring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 text-blue-200" />
                        )}
                        <span>{t.event_type}</span>
                        {condCount > 0 && (
                          <span
                            title={(t.conditions || []).map((c) => conditionMap[c]?.label || c).join(', ')}
                            className="flex items-center gap-0.5 rounded bg-blue-800/80 px-1.5 py-0.2 text-[10px] font-mono text-blue-100"
                          >
                            <ShieldCheck className="h-2.5 w-2.5 text-amber-300" /> {condCount}
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 opacity-60" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Inline Transition Error Banner if condition or execution fails */}
            {transitionError && (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 shadow-2xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <ShieldX className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{transitionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTransitionError(null)}
                  className="rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-700 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Document Sheet Container */}
            <div className="rounded-2xl border border-gray-200/80 bg-white p-6 sm:p-10 shadow-xs mb-8">
              {/* Document Sheet Heading */}
              <div className="mb-6 border-b border-gray-100 pb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">
                    {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Record Form
                  </h2>
                  <span className="font-mono text-xs text-gray-400">
                    v{currentEntity.workflow_version || '1.0'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Document layout reflecting the registered fields and conditional stage rules.
                </p>
              </div>

              {hasLayout ? (
                <div ref={containerRef}>
                  {mounted && (
                    <GridLayout
                      width={width}
                      layout={currentlyVisibleItems}
                      compactor={verticalCompactor}
                      gridConfig={{
                        cols,
                        rowHeight,
                        margin: [16, 16],
                        containerPadding: [0, 0],
                      }}
                      dragConfig={{ enabled: false }}
                      resizeConfig={{ enabled: false }}
                      className="rounded-lg"
                    >
                      {currentlyVisibleItems.map((it) => {
                        if (it.isGroup) {
                          return (
                            <div
                              key={it.i}
                              className="flex h-full w-full flex-col justify-center rounded-xl border border-gray-200 bg-slate-50/50 p-4 shadow-2xs"
                            >
                              <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 shrink-0 text-gray-500" />
                                <span className="text-sm font-semibold text-gray-900">
                                  {it.label || it.groupTitle || 'Group'}
                                </span>
                              </div>
                              {it.placeholder && (
                                <p className="text-xs text-gray-500 mt-1">{it.placeholder}</p>
                              )}
                            </div>
                          );
                        }
                        if (it.isHeader) {
                          return (
                            <div
                              key={it.i}
                              className="flex h-full w-full flex-col justify-center pt-2 pb-1 border-b border-gray-100"
                            >
                              <h3 className="text-sm sm:text-base font-bold text-gray-900">
                                {it.label || 'Section Header'}
                              </h3>
                              {it.placeholder && (
                                <p className="text-xs text-gray-500 mt-0.5">{it.placeholder}</p>
                              )}
                            </div>
                          );
                        }
                        const fieldDef = resolveItem(it);
                        if (!fieldDef) return null;
                        const rawVal = customFields[it.fieldName || it.i] ?? customFields[it.i];
                        return (
                          <ReadOnlyFillCell
                            key={it.i}
                            def={fieldDef}
                            value={rawVal}
                            itemHeight={it.h}
                            persons={persons}
                            personGroups={personGroups}
                          />
                        );
                      })}
                    </GridLayout>
                  )}
                </div>
              ) : (
                /* Fallback when no form layout exists */
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
                    No custom form builder layout has been published for entity type{' '}
                    <span className="font-mono font-bold">{entityType}</span>. Displaying all recorded custom fields.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(customFields).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-gray-900">{k}</span>
                        <ReadOnlyWidget
                          def={{
                            key: k,
                            name: k,
                            type: k === 'assigned_to' || k.toLowerCase().includes('person') ? 'entity_reference' : k === 'owner_group' || k.toLowerCase().includes('group') ? 'entity_reference' : 'text',
                            required: false,
                            options: [],
                            referenceEntityType: k === 'assigned_to' ? 'person' : k === 'owner_group' ? 'person_group' : null,
                          }}
                          value={v}
                          persons={persons}
                          personGroups={personGroups}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audit Timeline Slide-Over Sidebar */}
      {auditLogOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Dimmed backdrop */}
          <div
            className="fixed inset-0 bg-gray-900/20 backdrop-blur-2xs transition-opacity"
            onClick={() => setAuditLogOpen(false)}
          />

          {/* Sidebar drawer panel */}
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-gray-200 animate-in slide-in-from-right duration-200">
            {/* Sidebar Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-700" />
                <h3 className="text-sm font-bold text-gray-900">Audit Timeline</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-600">
                  {events.length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="Refresh event history"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setAuditLogOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sidebar Content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-gray-400">
                  <History className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="font-semibold text-gray-600">No recorded events yet</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Events and transitions will appear here as the workflow runs.</p>
                </div>
              ) : (
                <ol className="relative flex flex-col border-l border-gray-200 ml-3">
                  {[...events].reverse().map((ev) => (
                    <li key={ev.event_id} className="relative pl-5 pb-5">
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600 shadow-2xs" />
                      <EventRow ev={ev} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-xs overflow-y-auto">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 overflow-hidden flex flex-col">
      {content}
    </div>
  );
}

// --- Read-only Grid Cell: Stacked Label + Input --------------------------------------
const ReadOnlyFillCell = forwardRef<
  HTMLDivElement,
  {
    def: ResolvedField;
    value: unknown;
    itemHeight?: number;
    persons?: Person[];
    personGroups?: PersonGroup[];
    className?: string;
    style?: CSSProperties;
  }
>(function ReadOnlyFillCell({ def, value, itemHeight = 1, persons = [], personGroups = [], className, style }, ref) {
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full flex-col justify-center py-1`}
    >
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
        <span className="truncate" title={def.label || def.name}>
          {def.label || def.name}
        </span>
        {def.required && <span className="text-red-500">*</span>}
      </label>
      <div className="min-w-0 flex-1">
        <ReadOnlyWidget def={def} value={value} itemHeight={itemHeight} persons={persons} personGroups={personGroups} />
      </div>
    </div>
  );
});

// --- Widget Renderers in Read-Only Mode -----------------------------------------------
function ReadOnlyWidget({
  def,
  value,
  itemHeight = 1,
  persons = [],
  personGroups = [],
}: {
  def: ResolvedField;
  value: unknown;
  itemHeight?: number;
  persons?: Person[];
  personGroups?: PersonGroup[];
}) {
  const boxCls = 'w-full rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs text-gray-900 font-medium shadow-2xs';

  // 1. File Attachment
  if (def.type === 'file') {
    let files: AttachedFile[] = [];
    if (Array.isArray(value)) {
      files = value.filter((f) => f && typeof f === 'object' && f.name);
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) files = parsed.filter((f) => f && typeof f === 'object' && f.name);
      } catch {}
    }

    if (files.length === 0) {
      return (
        <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-400 italic">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" /> No files attached
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {files.map((f, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 shadow-2xs"
          >
            <Paperclip className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="max-w-[160px] truncate text-xs font-semibold text-gray-800" title={f.name}>
              {f.name}
            </span>
            <span className="font-mono text-[10px] text-gray-500 shrink-0">
              {formatFileSize(f.size)}
            </span>
            {f.dataUrl && (
              <a
                href={f.dataUrl}
                download={f.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-2.5 w-2.5" /> Download
              </a>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 2. Checklist
  if (def.type === 'checklist') {
    const tasks = def.checklistItems ?? [];
    let checkedSet = new Set<string>();
    if (Array.isArray(value)) {
      checkedSet = new Set(value.map((s) => String(s)));
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) checkedSet = new Set(parsed.map((s) => String(s)));
      } catch {
        checkedSet = new Set(value.split(',').map((s) => s.trim()));
      }
    }

    if (tasks.length === 0) {
      return (
        <span className="text-xs text-gray-400 italic">
          {checkedSet.size > 0 ? [...checkedSet].join(', ') : 'No checklist items'}
        </span>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-2xs">
        {tasks.map((t) => {
          const isDone = checkedSet.has(t.label);
          return (
            <div
              key={t.label}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs ${
                isDone ? 'bg-blue-50/40 text-gray-900' : 'text-gray-500'
              }`}
            >
              <input
                type="checkbox"
                checked={isDone}
                readOnly
                disabled
                className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
              />
              <span className={isDone ? 'font-medium text-gray-900' : 'text-gray-500'}>
                {t.label}
              </span>
              {t.required && (
                <span className={`ml-auto text-[10px] font-bold ${isDone ? 'text-blue-600' : 'text-amber-600'}`}>
                  {isDone ? '✓ Completed' : 'Required'}
                </span>
              )}
              {t.assigned_role && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] text-gray-500">
                  {t.assigned_role}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Dynamic Table
  if (def.type === 'table') {
    let rows: Record<string, string>[] = [];
    if (Array.isArray(value)) {
      rows = value as Record<string, string>[];
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) rows = parsed;
      } catch {}
    }
    const cols = def.options && def.options.length > 0 ? def.options : (rows.length > 0 ? Object.keys(rows[0]) : []);

    if (rows.length === 0) {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-center text-xs text-gray-400 italic">
          No table rows recorded
        </div>
      );
    }

    return (
      <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600 border-b border-gray-200 font-semibold">
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 font-semibold text-gray-700">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50/50">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-gray-800">
                    {row[c] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 4. Selection / Radio Choice Cards
  if (def.type === 'selection') {
    const valStr = String(value ?? '');
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.map((o) => {
          const isSelected = valStr === o;
          const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={o}
              className={`rounded-xl border p-4 text-left flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-300 bg-blue-50/20 ring-1 ring-blue-600/30 shadow-xs'
                  : 'border-gray-200 bg-white opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <div
                  className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
                    isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
              </div>
              {desc && (
                <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Checkbox Group Choice Cards
  if (def.type === 'checkbox_group') {
    let checkedList: string[] = [];
    if (Array.isArray(value)) checkedList = value.map(String);
    else if (typeof value === 'string') checkedList = value.split(',').map((s) => s.trim());

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.map((o) => {
          const isSelected = checkedList.includes(o);
          const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={o}
              className={`rounded-xl border p-4 text-left flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-300 bg-blue-50/20 ring-1 ring-blue-600/30 shadow-xs'
                  : 'border-gray-200 bg-white opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  disabled
                  className="accent-blue-600 h-4 w-4 rounded"
                />
              </div>
              {desc && (
                <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 6. Boolean Toggle Badges
  if (def.type === 'boolean') {
    const isYes = value === true || value === 'yes' || value === 'true';
    return (
      <div className="flex items-center gap-3">
        <div
          className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
            isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-200 bg-gray-50/50 text-gray-400 opacity-60'
          }`}
        >
          Yes
        </div>
        <div
          className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
            !isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-200 bg-gray-50/50 text-gray-400 opacity-60'
          }`}
        >
          No
        </div>
      </div>
    );
  }

  // 7. Long Text
  if (def.type === 'long_text') {
    return (
      <div className={`${boxCls} whitespace-pre-wrap leading-relaxed min-h-[60px]`}>
        {value ? String(value) : <span className="text-gray-400 italic">None</span>}
      </div>
    );
  }

  // 8. Entity Reference (Person or Person Group)
  if (def.type === 'entity_reference' || def.referenceEntityType) {
    const isPerson = def.referenceEntityType === 'person' || def.name === 'assigned_to' || def.name.toLowerCase().includes('person');
    const isGroup = def.referenceEntityType === 'person_group' || def.name === 'owner_group' || def.name.toLowerCase().includes('group');

    if (isPerson) {
      const pid = String(value || '');
      const p = persons.find((x) => x.person_id === pid);
      return (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-medium text-gray-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-gray-500" />
            <span>
              {p ? (
                <span>
                  <strong className="font-semibold text-gray-900">{p.display_name}</strong>{' '}
                  <span className="font-mono text-gray-400 text-[11px]">({p.person_id})</span>
                </span>
              ) : pid ? (
                <span className="font-mono font-semibold text-gray-900">{pid}</span>
              ) : (
                <span className="text-gray-400 italic">Unassigned</span>
              )}
            </span>
          </div>
          {pid && (
            <a
              href={`#/people/${encodeURIComponent(pid)}`}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              View Person
            </a>
          )}
        </div>
      );
    }

    if (isGroup) {
      const gname = String(value || '');
      const g = personGroups.find((x) => x.group_name === gname);
      return (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-medium text-gray-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-gray-500" />
            <span>
              {g ? (
                <span>
                  <strong className="font-mono font-semibold text-gray-900">{g.group_name}</strong>
                  {g.description ? <span className="text-gray-500"> — {g.description}</span> : ''}
                </span>
              ) : gname ? (
                <span className="font-mono font-semibold text-gray-900">{gname}</span>
              ) : (
                <span className="text-gray-400 italic">No Group</span>
              )}
            </span>
          </div>
          {gname && (
            <a
              href={`#/people/groups/${encodeURIComponent(gname)}`}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              View Group
            </a>
          )}
        </div>
      );
    }
  }

  // 9. Text / Date / Time / Email / Phone / URL / Number
  return (
    <div className={boxCls}>
      {value !== undefined && value !== null && String(value).trim() !== '' ? (
        String(value)
      ) : (
        <span className="text-gray-400 italic">Empty</span>
      )}
    </div>
  );
}

// ---- Event Log Row ------------------------------------------------------------------
function EventRow({ ev }: { ev: EntityEvent }) {
  const [open, setOpen] = useState(false);
  const gateTrace = (ev.payload?.condition_trace as ConditionTraceItem[] | undefined) ?? null;
  const routing = ev.payload?.routing as any;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-700">
          {ev.event_type}
        </span>
        {ev.from_state && (
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            {ev.from_state} <ArrowRight className="h-3 w-3" /> <span className="font-medium text-gray-700">{ev.to_state}</span>
          </span>
        )}
        <span className="text-[10px] text-gray-400">{ev.actor_id}</span>
        {ev.transaction_time && (
          <span className="text-[10px] text-gray-400">{new Date(ev.transaction_time).toLocaleString()}</span>
        )}
      </div>
      {gateTrace && gateTrace.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {gateTrace.map((g) => (
            <span
              key={g.condition_id}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${g.effective_pass ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
            >
              {g.effective_pass ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldX className="h-2.5 w-2.5" />}
              {g.label} — {g.reason}
            </span>
          ))}
        </div>
      )}
      {routing && (
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          {routing.choices?.map((c: any) => (
            <span
              key={c.choice_index}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                c.matched ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400 line-through'
              }`}
            >
              {c.matched ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              c{String(c.choice_index)}→{c.to}
            </span>
          ))}
        </div>
      )}
      {(ev.payload?.comment || Object.keys(ev.payload || {}).length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[10px] font-medium text-gray-400 hover:text-blue-600"
        >
          {open ? 'hide' : 'show'} payload
        </button>
      )}
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-50 p-2 text-[10px] text-gray-600 border border-gray-200">
          {JSON.stringify(ev.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
