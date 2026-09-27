import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  Layers,
  ListTodo,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  UserCheck,
  Workflow,
  X,
  Zap,
  Info,
  Users,
  ChevronDown,
  Database,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Play,
  Compass,
  Timer,
  Save,
} from 'lucide-react';
import { api } from '../../api/client';
import { isItemVisible, isItemReadOnly, isTabVisible, withWorkflowStatus } from '../../lib/conditions';
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
  TaskAssignment,
  WorkflowDefinition,
  Workflow as WorkflowType,
  FormTab,
} from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';
import { WorkflowInstanceVisualizer, useLiveCountdown } from './WorkflowInstanceVisualizer';
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
  submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-blue-100 text-blue-800 border-blue-200',
  in_progress: 'bg-sky-100 text-sky-800 border-sky-200',
  isolationprecheck: 'bg-purple-100 text-purple-800 border-purple-200',
  riskassessed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
  expired: 'bg-orange-100 text-orange-800 border-orange-200',
  expire: 'bg-orange-100 text-orange-800 border-orange-200',
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

function formatActionTitle(t: ValidTransition): string {
  if (t.button_label && t.button_label.trim()) return t.button_label.trim();
  if (t.label && t.label.trim()) return t.label.trim();
  const raw = t.event_type || 'Action';
  if (raw === raw.toUpperCase() && raw.includes('_')) {
    return raw
      .split('_')
      .map((w, idx) => {
        const lower = w.toLowerCase();
        if (idx > 0 && ['for', 'to', 'in', 'on', 'and', 'by', 'of', 'with'].includes(lower)) return lower;
        if (w === 'JSA' || w === 'PTW' || w === 'LOTO' || w === 'EAM' || w === 'QA' || w === 'EHS') return w;
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }
  return raw;
}

function getActionButtonClass(t: ValidTransition): string {
  const isDanger =
    t.button_style === 'danger' ||
    ['REJECT', 'CANCEL', 'FAIL', 'ABORT', 'TERMINATE'].some((k) =>
      t.event_type.toUpperCase().includes(k)
    );

  const isSecondary =
    t.button_style === 'secondary' ||
    ['SUSPEND', 'HOLD', 'PAUSE', 'RETURN', 'CLOSE'].some((k) =>
      t.event_type.toUpperCase().includes(k)
    );

  if (isDanger) {
    return 'inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  }

  if (isSecondary) {
    return 'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  }

  return 'inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 active:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
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
  const displayTransitions = useMemo(() => {
    return validTransitions.filter((t) => {
      const eventUpper = (t.event_type || '').toUpperCase();
      const isInternalAutomatedEvent = ['START', 'TRUE', 'FALSE', 'AUTO', 'EXPIRED', 'TIMEOUT'].includes(eventUpper);
      if (isInternalAutomatedEvent) return false;
      return true;
    });
  }, [validTransitions]);
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [tabs, setTabs] = useState<FormTab[]>([
    { id: 'general', label: 'General Details', is_default: true },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('general');
  const [fields, setFields] = useState<EntityField[]>([]);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [conditionMap, setConditionMap] = useState<Record<string, { label: string; type: string }>>({});
  const [resolved, setResolved] = useState<Record<string, ResolvedList>>({});
  const [persons, setPersons] = useState<Person[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>([]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [escalatingTaskId, setEscalatingTaskId] = useState<string | null>(null);
  const [scanningEscalations, setScanningEscalations] = useState(false);
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  const [firingEvent, setFiringEvent] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [hasPublishedWorkflow, setHasPublishedWorkflow] = useState<boolean>(true);
  const [noWorkflowMessage, setNoWorkflowMessage] = useState<string | null>(null);
  const [subprocessData, setSubprocessData] = useState<any>(null);
  const [launchingSubprocess, setLaunchingSubprocess] = useState(false);
  const [linkedModalRecord, setLinkedModalRecord] = useState<{ entityType: string; id: string } | null>(null);
  const [workflowDef, setWorkflowDef] = useState<WorkflowDefinition | null>(null);
  const [interactionNavFeedback, setInteractionNavFeedback] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const activeId = initialRecordId || initialEntity?.id || '';
  const entityType = propType || initialEntity?.entity_type || (entityRecord as any)?.entity_type || '';

  const { width, mounted, containerRef } = useContainerSize(loaded);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoaded(false);
    setErr(null);

    try {
      const [formRes, condList, fieldsRes, personsRes, groupsRes, wfListRes] = await Promise.all([
        api.getForm(entityType).catch(() => ({ layout: [], fields: [], tabs: [], cols: 12, row_height: 40 })),
        api.listConditions(entityType).catch(() => [] as ConditionDefinition[]),
        api.listFields(entityType).catch(() => [] as EntityField[]),
        api.listPersons({ limit: 200 }).catch(() => ({ items: [] })),
        api.listPersonGroups().catch(() => ({ items: [] })),
        api.listWorkflows(entityType).catch(() => [] as WorkflowType[]),
      ]);

      const pubWf = (wfListRes || []).find((w) => w.status === 'published') || wfListRes[0];
      if (pubWf && pubWf.definition) {
        setWorkflowDef(pubWf.definition);
      }

      const cMap: Record<string, { label: string; type: string }> = {};
      for (const g of condList) cMap[g.id] = { label: g.label, type: g.type };
      setConditionMap(cMap);
      setConditions(condList);
      setFields(fieldsRes);
      setPersons(personsRes.items || []);
      setPersonGroups(groupsRes.items || []);

      const loadedTabs: FormTab[] =
        formRes.tabs && formRes.tabs.length > 0
          ? formRes.tabs
          : [{ id: 'general', label: 'General Details', is_default: true }];
      setTabs(loadedTabs);
      const defaultTab = loadedTabs.find((t) => t.is_default) || loadedTabs[0];
      setActiveTabId((prev) => {
        const exists = loadedTabs.some((t) => t.id === prev);
        return exists ? prev : defaultTab ? defaultTab.id : 'general';
      });

      const layout = ((formRes.layout || []) as Array<any>).map((it) => {
        const isGroup = Boolean(it.isGroup ?? it.is_group ?? it.i?.startsWith('group:'));
        const isHeader = Boolean(it.isHeader ?? it.is_header ?? it.i?.startsWith('header:'));
        const tabId = it.tabId ?? it.tab_id ?? (loadedTabs[0]?.id || 'general');
        return {
          ...it,
          isHeader,
          isGroup,
          tabId,
          tab_id: tabId,
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

      let loadedCustomFields: Record<string, unknown> = {};
      // Fetch Entity, Valid Transitions, Task Assignments, and Subprocess Status
      if (activeId) {
        const [entityDetail, validRes, taskRes, subRes] = await Promise.all([
          api.getEntity(entityType, activeId),
          api.listValidTransitions(entityType, activeId).catch(() => ({ valid_transitions: [], has_published_workflow: false })),
          api.listTaskAssignments({ entity_type: entityType, entity_id: activeId }).catch(() => ({ items: [], total: 0 })),
          api.getSubprocess(entityType, activeId).catch(() => null),
        ]);
        setEntityRecord(entityDetail.entity);
        loadedCustomFields = entityDetail.entity?.custom_fields || {};
        setEvents(entityDetail.events || []);
        setValidTransitions(validRes.valid_transitions || []);
        setTaskAssignments(taskRes.items || []);
        setSubprocessData(subRes);
        const hasPub = (validRes as any).has_published_workflow !== false;
        setHasPublishedWorkflow(hasPub);
        setNoWorkflowMessage((validRes as any).message || (!hasPub ? `No published workflow is available for "${entityType}". Please publish a workflow in Workflow Studio.` : null));
      } else if (initialEntity) {
        setEntityRecord(initialEntity);
        loadedCustomFields = initialEntity.custom_fields || {};
        const [validRes, taskRes, subRes] = await Promise.all([
          api.listValidTransitions(entityType, initialEntity.id).catch(() => ({ valid_transitions: [], has_published_workflow: false })),
          api.listTaskAssignments({ entity_type: entityType, entity_id: initialEntity.id }).catch(() => ({ items: [], total: 0 })),
          api.getSubprocess(entityType, initialEntity.id).catch(() => null),
        ]);
        setValidTransitions(validRes.valid_transitions || []);
        setTaskAssignments(taskRes.items || []);
        setSubprocessData(subRes);
        const hasPub = (validRes as any).has_published_workflow !== false;
        setHasPublishedWorkflow(hasPub);
        setNoWorkflowMessage((validRes as any).message || (!hasPub ? `No published workflow is available for "${entityType}". Please publish a workflow in Workflow Studio.` : null));
      }

      const initialVals: Record<string, string> = {};
      for (const [k, v] of Object.entries(loadedCustomFields)) {
        if (v === null || v === undefined) {
          initialVals[k] = '';
        } else if (typeof v === 'boolean') {
          initialVals[k] = v ? 'yes' : 'no';
        } else if (typeof v === 'object') {
          initialVals[k] = JSON.stringify(v);
        } else if (typeof v === 'string' && (v.trim().toLowerCase() === 'true' || v.trim().toLowerCase() === 'false')) {
          initialVals[k] = v.trim().toLowerCase() === 'true' ? 'yes' : 'no';
        } else {
          initialVals[k] = String(v);
        }
      }
      setValues(initialVals);
      setIsDirty(false);
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
  const currentStage = currentEntity?.workflow_stage || currentEntity?.stage || currentEntity?.status || '';
  const currentStatus = currentEntity?.status || currentStage;
  const isTerminal = useMemo(() => {
    const s = (currentStatus || '').toLowerCase();
    return ['closed', 'cancelled', 'expired'].includes(s);
  }, [currentStatus]);

  const conditionValues = useMemo(() => {
    const baseConditionValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(customFields)) {
      if (v === null || v === undefined) {
        baseConditionValues[k] = '';
      } else if (typeof v === 'boolean') {
        baseConditionValues[k] = v ? 'yes' : 'no';
      } else if (typeof v === 'object') {
        baseConditionValues[k] = JSON.stringify(v);
      } else if (typeof v === 'string' && (v.trim().toLowerCase() === 'true' || v.trim().toLowerCase() === 'false')) {
        baseConditionValues[k] = v.trim().toLowerCase() === 'true' ? 'yes' : 'no';
      } else {
        baseConditionValues[k] = String(v);
      }
    }
    const merged = { ...baseConditionValues, ...values };
    return withWorkflowStatus(merged, currentStatus, currentStage);
  }, [customFields, values, currentStatus, currentStage]);

  const valuesForCondition = conditionValues;

  // Workflow Stage Timer / Expiry calculation
  const currentNodeMeta = useMemo(() => {
    if (!workflowDef || !currentStage) return null;
    return (workflowDef.nodes || []).find((n) => n.name === currentStage || n.name === currentEntity?.status) || null;
  }, [workflowDef, currentStage, currentEntity?.status]);

  const timeLimitHours = currentNodeMeta?.time_limit_hours ?? null;

  const targetDueTime = useMemo(() => {
    if (!currentStage) return null;
    const entryEvent = events.filter((e) => e.to_state === currentStage || e.to_state === currentEntity?.status).slice(-1)[0];
    const enteredTime = entryEvent?.transaction_time || currentEntity?.updated_at || currentEntity?.created_at || new Date().toISOString();

    if (timeLimitHours && Number(timeLimitHours) > 0) {
      const enteredMs = new Date(enteredTime).getTime();
      return new Date(enteredMs + Number(timeLimitHours) * 3600 * 1000).toISOString();
    }
    const cf = currentEntity?.custom_fields || (currentEntity as any)?.data || {};
    const expiryField = cf.valid_to || cf.expires_at || cf.due_date;
    if (expiryField) {
      return new Date(expiryField).toISOString();
    }
    return null;
  }, [currentEntity, events, timeLimitHours, currentStage]);

  const enteredTime = useMemo(() => {
    if (!currentStage) return null;
    const entryEvent = events.filter((e) => e.to_state === currentStage || e.to_state === currentEntity?.status).slice(-1)[0];
    return entryEvent?.transaction_time || currentEntity?.updated_at || currentEntity?.created_at || null;
  }, [currentEntity, events, currentStage]);

  const stageCountdown = useLiveCountdown(targetDueTime, enteredTime);

  useEffect(() => {
    if (stageCountdown.isExpired && stageCountdown.hasTimer) {
      const timer = setTimeout(() => {
        loadData(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [stageCountdown.isExpired, stageCountdown.hasTimer, loadData]);

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

  const visibleTabs = useMemo(() => {
    return tabs.filter((tab) => isTabVisible(tab, valuesForCondition, conditions));
  }, [tabs, valuesForCondition, conditions]);

  // Keep activeTabId in sync with visibleTabs
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTabId]);

  const tabFilteredVisibleItems = useMemo(() => {
    const fallbackTab = tabs[0]?.id || 'general';
    return currentlyVisibleItems.filter((it) => {
      const itTab = it.tabId ?? (it as any).tab_id ?? fallbackTab;
      return itTab === activeTabId;
    });
  }, [currentlyVisibleItems, tabs, activeTabId]);

  const hasLayout = items.length > 0;

  const fallbackFields =
    !hasLayout && fields.length > 0 ? [...fields].sort((a, b) => a.field_name.localeCompare(b.field_name)) : [];

  const fieldOptions = (f: EntityField): string[] => {
    if (f.option_list_key && resolved[f.option_list_key]) {
      const list = resolved[f.option_list_key];
      if (list.kind === 'options') return list.items as string[];
    }
    return f.select_options || [];
  };

  const handleValueChange = (it: EntityFormItem, val: string) => {
    setIsDirty(true);
    setValues((prev) => {
      const next = { ...prev, [it.i]: val };
      if (it.fieldName) {
        next[it.fieldName] = val;
      }
      return next;
    });
  };

  const handleFallbackChange = (fieldName: string, val: string) => {
    setIsDirty(true);
    setValues((prev) => ({ ...prev, [fieldName]: val }));
  };

  const getCustomFieldsDelta = (): Record<string, unknown> => {
    const activeDefs: ResolvedField[] = [
      ...items
        .filter((it) => !it.isHeader && !it.isGroup && resolveItem(it) !== null)
        .map((it) => resolveItem(it)!),
      ...fallbackFields.map((f) => ({
        key: f.field_name,
        name: f.field_name,
        label: f.label || f.field_name,
        type: f.field_type,
        required: Boolean(f.required),
        options: fieldOptions(f),
        checklistItems:
          f.option_list_key && resolved[f.option_list_key]?.kind === 'checklist'
            ? (resolved[f.option_list_key].items as ChecklistItem[])
            : undefined,
      })),
    ];
    return toCustomFields(values, activeDefs);
  };

  const handleSaveFields = async () => {
    if (!currentEntity) return;
    setSavingFields(true);
    setTransitionError(null);
    setSaveSuccess(false);
    try {
      const delta = getCustomFieldsDelta();
      await api.updateEntityFields(entityType, currentEntity.id, delta);
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadData(true);
      onRecordUpdated?.();
    } catch (e: any) {
      setTransitionError(e.message || 'Failed to save form fields');
    } finally {
      setSavingFields(false);
    }
  };

  const handleFireTransition = async (t: ValidTransition) => {
    if (!currentEntity || firingEvent) return;
    setFiringEvent(t.event_type);
    setTransitionError(null);
    try {
      const delta = getCustomFieldsDelta();
      await api.transition(entityType, {
        entity_id: currentEntity.id,
        event_type: t.event_type,
        custom_fields_delta: delta,
      });
      setIsDirty(false);
      await loadData(true);
      onRecordUpdated?.();
    } catch (e: any) {
      setTransitionError(e.message || `Failed to fire transition "${t.event_type}"`);
    } finally {
      setFiringEvent(null);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setCompletingTaskId(taskId);
    try {
      await api.updateTaskStatus(taskId, {
        status: 'COMPLETED',
        completed_by: 'Current User',
      });
      await loadData(true);
      onRecordUpdated?.();
    } catch (err: any) {
      setTransitionError(err.message || 'Failed to complete task assignment');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleEscalateTask = async (taskId: string) => {
    setEscalatingTaskId(taskId);
    try {
      await api.escalateTask(taskId);
      await loadData(true);
      onRecordUpdated?.();
    } catch (err: any) {
      setTransitionError(err.message || 'Failed to escalate task assignment');
    } finally {
      setEscalatingTaskId(null);
    }
  };

  const handleScanEscalations = async () => {
    setScanningEscalations(true);
    try {
      await api.triggerEscalationCheck();
      await loadData(true);
      onRecordUpdated?.();
    } catch (err: any) {
      setTransitionError(err.message || 'Failed to scan task escalations');
    } finally {
      setScanningEscalations(false);
    }
  };

  const handleLaunchSubprocess = async () => {
    if (!activeId) return;
    setLaunchingSubprocess(true);
    try {
      await api.launchSubprocess(entityType, activeId);
      await loadData(true);
      onRecordUpdated?.();
    } catch (err: any) {
      setTransitionError(err.message || 'Failed to launch child subprocess');
    } finally {
      setLaunchingSubprocess(false);
    }
  };

  const currentStateNode = useMemo(() => {
    if (!workflowDef || !currentStage) return null;
    const nodes = workflowDef.nodes || [];
    return nodes.find((n) => n.name === currentStage || n.name === currentEntity?.status) || null;
  }, [workflowDef, currentStage, currentEntity?.status]);

  const isInteractionState = currentStateNode?.kind === 'interaction';

  const autoSwitchedKeyRef = useRef<string | null>(null);

  // Maximo-aligned Interaction Node auto-tab switching (runs once on stage entry)
  useEffect(() => {
    if (!isInteractionState || visibleTabs.length === 0) return;
    const currentStageKey = currentEntity ? `${currentEntity.id}:${currentStage || currentEntity.status}` : null;
    if (!currentStageKey || autoSwitchedKeyRef.current === currentStageKey) return;

    const targetKey = currentStateNode?.interaction_tab?.toLowerCase()?.trim();
    if (targetKey && targetKey !== 'main' && targetKey !== 'details' && targetKey !== 'edit') {
      const matchedTab = visibleTabs.find(
        (t) => t.id.toLowerCase() === targetKey || t.label.toLowerCase() === targetKey
      );
      if (matchedTab) {
        autoSwitchedKeyRef.current = currentStageKey;
        if (matchedTab.id !== activeTabId) {
          setActiveTabId(matchedTab.id);
        }
        return;
      }
    }
    // If the active tab is 'general' and there is a non-default step-specific tab visible (e.g. 'sop'), switch to it once
    if (visibleTabs.length > 1) {
      const stepSpecificTab = visibleTabs.find((t) => !t.is_default && t.id !== 'general');
      if (stepSpecificTab) {
        autoSwitchedKeyRef.current = currentStageKey;
        if (activeTabId === 'general') {
          setActiveTabId(stepSpecificTab.id);
        }
        return;
      }
    }
    autoSwitchedKeyRef.current = currentStageKey;
  }, [isInteractionState, currentStateNode?.interaction_tab, visibleTabs, currentEntity, currentStage]);

  const handleJumpToInteractionTarget = () => {
    if (!currentStateNode) return;
    const targetApp = (currentStateNode.interaction_app || 'records').toLowerCase();
    const targetTab = (currentStateNode.interaction_tab || 'details').toLowerCase();

    // Check if targetTab matches any visible form tab
    const matchedTab = visibleTabs.find(
      (t) => t.id.toLowerCase() === targetTab || t.label.toLowerCase() === targetTab
    );
    if (matchedTab) {
      setActiveTabId(matchedTab.id);
      const el = document.getElementById('record-form-grid');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      setInteractionNavFeedback(`Switched to tab "${matchedTab.label}"`);
    } else if (targetTab === 'history' || targetApp === 'history') {
      setAuditLogOpen(true);
      setInteractionNavFeedback('Opened Audit Timeline history log');
    } else if (targetTab === 'assignments' || targetTab === 'tasks') {
      const el = document.getElementById('workflow-tasks-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      setInteractionNavFeedback('Focused Workflow Task Assignments section');
    } else if (targetTab === 'files' || targetTab === 'attachments') {
      const el = document.getElementById('attachments-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      setInteractionNavFeedback('Focused Attached Files & Media section');
    } else if (targetTab === 'edit' || targetApp === 'forms') {
      const el = document.getElementById('record-form-grid');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      setInteractionNavFeedback('Focused Form Fields editor');
    } else {
      setInteractionNavFeedback(`Navigated to ${targetApp} / ${targetTab}`);
    }

    setTimeout(() => {
      setInteractionNavFeedback(null);
    }, 4000);
  };

  const handleCompleteInteraction = async () => {
    if (validTransitions.length === 0) {
      setTransitionError('No outgoing transition configured from this interaction step');
      return;
    }
    const resumeEvent = currentStateNode?.resume_event || 'NEXT';
    const targetTrans =
      validTransitions.find((t) => t.event_type === resumeEvent) ||
      validTransitions.find((t) => t.event_type === 'NEXT' || t.event_type === 'CONTINUE' || t.event_type === 'DONE') ||
      validTransitions[0];
    if (targetTrans) {
      handleFireTransition(targetTrans);
    }
  };

  // Initial state check (Record Creation / Draft)
  const isInitialDraftState = useMemo(() => {
    const s = (currentStatus || currentStage || '').toLowerCase();
    const initSt = (workflowDef?.initial_state || 'draft').toLowerCase();
    return s === initSt || s === 'draft' || s === 'requested' || s === 'new';
  }, [currentStatus, currentStage, workflowDef?.initial_state]);

  const computeItemReadOnly = useCallback((it: EntityFormItem): boolean => {
    // 1. Terminal states are strictly read-only
    if (isTerminal) return true;

    // 2. Check if explicitly configured via field-level condition rules (action: 'readonly' or 'editable')
    const itCond = it.visibilityCondition ?? (it as any).visibility_condition;
    const hasExplicitFieldRule = Boolean(
      (itCond?.rules?.length && (itCond.action === 'readonly' || itCond.action === 'editable')) ||
      (itCond?.condition_id && (itCond.action === 'readonly' || itCond.action === 'editable'))
    );

    if (hasExplicitFieldRule) {
      return isItemReadOnly(it, items, valuesForCondition, conditions, tabs);
    }

    // 3. Check if parent tab has an explicit interactivity rule (action: 'readonly' or 'editable')
    const itTabId = it.tabId ?? (it as any).tab_id ?? tabs[0]?.id;
    const parentTab = tabs.find((t) => t.id === itTabId);
    if (parentTab?.visibility_condition) {
      const tabAction = parentTab.visibility_condition.action;
      if (tabAction === 'readonly' || tabAction === 'editable') {
        return isItemReadOnly(it, items, valuesForCondition, conditions, tabs);
      }
    }

    // 4. Initial draft / creation state is editable by default
    if (isInitialDraftState) {
      return false;
    }

    // 5. In an active interaction node step, items on the designated interaction tab (or custom interaction tabs) are editable
    if (isInteractionState) {
      const itTab = it.tabId ?? (it as any).tab_id ?? 'general';
      const targetTab = currentStateNode?.interaction_tab?.toLowerCase()?.trim();
      if (targetTab) {
        if (itTab.toLowerCase() === targetTab || parentTab?.label?.toLowerCase() === targetTab) {
          return false;
        }
      } else {
        if (itTab !== 'general') {
          return false;
        }
      }
    }

    // 6. Default across all other post-creation workflow stages (e.g. Approval, Review, Active): Read-Only!
    return true;
  }, [isTerminal, isInitialDraftState, isInteractionState, currentStateNode, items, tabs, valuesForCondition, conditions]);

  const computeFallbackReadOnly = useCallback((_fieldName: string): boolean => {
    if (isTerminal) return true;
    if (isInitialDraftState) return false;
    return true;
  }, [isTerminal, isInitialDraftState]);

  const entityTitleStr = getEntityTitle(currentEntity);

  const expiryValue =
    currentEntity?.custom_fields?.expiry_date ||
    currentEntity?.custom_fields?.valid_until ||
    currentEntity?.custom_fields?.valid_to ||
    currentEntity?.custom_fields?.expires_at ||
    currentEntity?.custom_fields?.due_date ||
    currentEntity?.custom_fields?.expiry;
  const isExpiredStatus = currentEntity?.status?.toLowerCase() === 'expired';
  const isPastExpiryDate = useMemo(() => {
    if (!expiryValue) return false;
    try {
      const exp = new Date(String(expiryValue).replace('Z', '+00:00'));
      return !isNaN(exp.getTime()) && exp.getTime() < Date.now();
    } catch {
      return false;
    }
  }, [expiryValue]);

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
            {currentEntity?.workflow_stage && currentEntity.workflow_stage !== currentEntity.status && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-gray-700">
                Step: {currentEntity.workflow_stage}
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
          {/* Workflow Trace & Visualizer Button */}
          <button
            type="button"
            onClick={() => setVisualizerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-2xs transition-colors"
            title="View runtime workflow step trace and execution visualizer"
          >
            <Workflow className="h-3.5 w-3.5 text-blue-600" />
            <span>Workflow Trace</span>
          </button>

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

      {/* Expiry Status Notice Banners */}
      {isExpiredStatus && (
        <div className="flex items-center justify-between gap-3 border-b border-orange-200 bg-orange-50/90 px-6 py-2.5 text-xs text-orange-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
            <span>
              <strong>Permit Expired:</strong> This permit has exceeded its validity limit{expiryValue ? ` (${new Date(String(expiryValue)).toLocaleString()})` : ''}. Hazardous work on site is suspended until re-validated with updated atmospheric gas tests or closed.
            </span>
          </div>
        </div>
      )}

      {!isExpiredStatus && isPastExpiryDate && (currentEntity?.status === 'Active' || currentEntity?.status === 'Suspended') && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/90 px-6 py-2.5 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Validity Limit Exceeded:</strong> Scheduled expiry limit ({new Date(String(expiryValue)).toLocaleString()}) has passed. This record is queued for automated system expiry.
            </span>
          </div>
        </div>
      )}

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
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Current Stage: <span className="text-blue-700">{currentStage || currentEntity.status}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {validTransitions.length > 0
                      ? `Click an action to transition this ${entityType} record to the next workflow stage.`
                      : `This record is currently in state "${currentStage || currentEntity.status}".`}
                  </p>
                </div>

                {/* Live Active Countdown Timer Badge */}
                {stageCountdown.hasTimer && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-1.5 text-teal-950 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Timer className={`h-4 w-4 text-teal-600 ${stageCountdown.isExpired ? '' : 'animate-spin'}`} />
                      <span className="text-teal-900">
                        {stageCountdown.isExpired ? 'Timer Elapsed' : 'Timer Running:'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs font-bold text-teal-950">
                      <span>{stageCountdown.isExpired ? '00:00' : stageCountdown.formattedDigital}</span>
                      <span className="font-sans text-[11px] font-normal text-teal-700">
                        ({stageCountdown.isExpired ? 'Auto-advancing…' : `${stageCountdown.formatted} left`})
                      </span>
                    </div>
                    <div className="w-16 h-1.5 bg-teal-200/80 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-teal-600 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${stageCountdown.progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons: Directly fire the event on 1 click */}
              <div className="flex flex-wrap items-center gap-2">
                {displayTransitions.length === 0 ? (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border ${
                    !hasPublishedWorkflow
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200/60'
                  }`}>
                    {!hasPublishedWorkflow && <Info className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    <span>
                      {!hasPublishedWorkflow
                        ? (noWorkflowMessage || `No published workflow is available for "${entityType}". Please publish a workflow in Workflow Studio.`)
                        : 'No manual user actions available from this state'}
                    </span>
                  </div>
                ) : (
                  displayTransitions.map((t) => {
                    const isFiring = firingEvent === t.event_type;
                    const isAnyFiring = firingEvent !== null;
                    const condCount = (t.conditions || []).length;
                    const buttonTitle = formatActionTitle(t);
                    const buttonClass = getActionButtonClass(t);
                    const tooltipText = t.instructions || t.description || undefined;
                    return (
                      <button
                        key={t.event_type}
                        type="button"
                        disabled={isAnyFiring}
                        onClick={() => handleFireTransition(t)}
                        title={tooltipText}
                        className={buttonClass}
                      >
                        {isFiring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 opacity-80" />
                        )}
                        <span>{buttonTitle}</span>
                        {condCount > 0 && (
                          <span
                            title={(t.conditions || []).map((c) => conditionMap[c]?.label || c).join(', ')}
                            className="flex items-center gap-0.5 rounded bg-black/15 px-1.5 py-0.2 text-[10px] font-mono"
                          >
                            <ShieldCheck className="h-2.5 w-2.5 text-amber-300" /> {condCount}
                          </span>
                        )}
                        {tooltipText && (
                          <span title={tooltipText} className="opacity-70">
                            <Info className="h-3 w-3" />
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 opacity-60" />
                      </button>
                    );
                  })
                )}

                {!isTerminal && (
                  <button
                    type="button"
                    disabled={savingFields || (!isDirty && !saveSuccess)}
                    onClick={handleSaveFields}
                    className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                      isDirty
                        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                        : saveSuccess
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-400 cursor-not-allowed opacity-75'
                    }`}
                    title={isDirty ? 'Save changes to record fields' : 'No unsaved changes'}
                  >
                    {savingFields ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : saveSuccess ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>{savingFields ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save Changes'}</span>
                  </button>
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

            {/* Interaction Node Action Directive Banner */}
            {isInteractionState && currentStateNode && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-sky-100 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 text-sky-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-sky-950">
                      Required User Interaction
                    </h3>
                    <span className="rounded-full bg-sky-100 border border-sky-200 px-2.5 py-0.5 text-[10px] font-semibold text-sky-800">
                      Target: {currentStateNode.interaction_app || 'Records'} / {currentStateNode.interaction_tab || 'Details'}
                    </span>
                  </div>
                  <span className="text-[11px] text-sky-600/90 font-medium hidden sm:inline">
                    Maximo Interaction Dialog Step
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1 max-w-xl">
                    <p className="font-semibold text-gray-900">
                      {currentStateNode.task_instructions || currentStateNode.description || `Please navigate to the ${currentStateNode.interaction_tab || 'details'} view and complete the required inputs.`}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Stage: <span className="font-mono font-medium text-gray-700">{currentStage || currentEntity?.status}</span> · Once your inputs are verified, click complete to proceed.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleJumpToInteractionTarget}
                      className="flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-900 shadow-2xs transition-colors"
                      title="Navigate directly to the interaction target tab or workspace"
                    >
                      <Compass className="h-3.5 w-3.5 text-sky-600" />
                      <span>Jump to View</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCompleteInteraction}
                      disabled={Boolean(firingEvent)}
                      className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 shadow-2xs transition-colors disabled:opacity-50"
                      title="Advance to the next workflow stage"
                    >
                      {firingEvent ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span>Complete Interaction</span>
                    </button>
                  </div>
                </div>

                {interactionNavFeedback && (
                  <div className="mt-2.5 rounded-md bg-sky-100/70 px-2.5 py-1 text-[11px] font-medium text-sky-800 animate-in fade-in flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-sky-700" />
                    <span>{interactionNavFeedback}</span>
                  </div>
                )}
              </div>
            )}

            {/* Subprocess Status / Relationship Banner */}
            {subprocessData && (subprocessData.is_subprocess_state || subprocessData.child_subprocess || subprocessData.is_child_record) && (
              <div className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-fuchsia-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                      {subprocessData.is_child_record ? 'Parent Workflow Relationship' : 'Child Subprocess Execution'}
                    </h3>
                  </div>
                  {subprocessData.is_subprocess_state && (
                    <span className="rounded-full bg-fuchsia-50 border border-fuchsia-200 px-2.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                      Subprocess Stage Active
                    </span>
                  )}
                </div>

                {/* Case 1: Active Subprocess State / Linked Child Subprocess */}
                {(subprocessData.is_subprocess_state || subprocessData.child_subprocess) && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-fuchsia-100 bg-fuchsia-50/30 p-3.5 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">
                          {subprocessData.subprocess_node?.subprocess_id || 'Subprocess Flow'}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600 uppercase">
                          {subprocessData.child_subprocess?.child_entity_type || subprocessData.subprocess_node?.target_entity_type || entityType}
                        </span>
                        {subprocessData.child_subprocess ? (
                          <span className={`rounded-full border px-2 py-0.2 text-[11px] font-semibold ${statusBadge(subprocessData.child_subprocess.child_status)}`}>
                            {subprocessData.child_subprocess.child_status}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.2 text-[11px] font-semibold text-amber-700">
                            Awaiting Initiation
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {subprocessData.child_subprocess
                          ? `Child record ID: ${subprocessData.child_subprocess.child_id}. Completing child workflow will automatically advance parent step.`
                          : `Current state '${currentEntity?.status}' is configured as a child sub-routine.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {subprocessData.child_subprocess ? (
                        <button
                          type="button"
                          onClick={() => setLinkedModalRecord({
                            entityType: subprocessData.child_subprocess.child_entity_type,
                            id: subprocessData.child_subprocess.child_id,
                          })}
                          className="flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-white px-3 py-1.5 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-50 shadow-2xs transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open Child Record</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleLaunchSubprocess}
                          disabled={launchingSubprocess}
                          className="flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700 shadow-2xs transition-colors disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>{launchingSubprocess ? 'Launching...' : 'Launch Subprocess'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Case 2: This Record is a Child Subprocess */}
                {subprocessData.is_child_record && subprocessData.parent_workflow && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          Parent Process: {subprocessData.parent_workflow.parent_entity_type.toUpperCase()}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                          ID: {subprocessData.parent_workflow.parent_entity_id?.slice(0, 8)}
                        </span>
                        {subprocessData.parent_workflow.parent_status && (
                          <span className={`rounded-full border px-2 py-0.2 text-[11px] font-semibold ${statusBadge(subprocessData.parent_workflow.parent_status)}`}>
                            {subprocessData.parent_workflow.parent_status}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        This record is a sub-routine spawned from stage '{subprocessData.parent_workflow.parent_state}'.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setLinkedModalRecord({
                          entityType: subprocessData.parent_workflow.parent_entity_type,
                          id: subprocessData.parent_workflow.parent_entity_id,
                        })}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 shadow-2xs transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View Parent Record</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workflow Task Assignments: Active assignments created by workflow task states */}
            {taskAssignments.length > 0 && (
              <div id="workflow-tasks-section" className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-gray-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                      Workflow Task Assignments
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {taskAssignments.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length} active
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleScanEscalations}
                      disabled={scanningEscalations}
                      title="Run escalation check for overdue tasks"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${scanningEscalations ? 'animate-spin text-blue-600' : 'text-gray-500'}`} />
                      <span>Check Escalations</span>
                    </button>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                      Maximo-aligned escalation & delegation engine
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {taskAssignments.map((task) => {
                    const isCurrentState = task.state_name === currentEntity?.status;
                    const isPending = task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS';
                    const isOverdue = Boolean(
                      isPending &&
                      task.due_date &&
                      new Date(task.due_date).getTime() < Date.now()
                    );
                    const assignedPerson = task.assigned_person_id
                      ? persons.find((p) => p.person_id === task.assigned_person_id)
                      : null;
                    const assigneeLabel = assignedPerson
                      ? `${assignedPerson.display_name} (${task.assigned_person_id})`
                      : task.assigned_person_id
                        ? task.assigned_person_id
                        : task.assigned_group_name
                          ? `Group: ${task.assigned_group_name}`
                          : task.assigned_email
                            ? `Email: ${task.assigned_email}`
                            : 'Unassigned';

                    return (
                      <div
                        key={task.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 text-xs transition-colors ${
                          isPending
                            ? isCurrentState
                              ? isOverdue
                                ? 'border-amber-300 bg-amber-50/40 shadow-2xs'
                                : 'border-blue-200 bg-blue-50/40 shadow-2xs'
                              : isOverdue
                                ? 'border-amber-200 bg-amber-50/20'
                                : 'border-gray-200 bg-white'
                            : 'border-gray-200/60 bg-gray-50/60 text-gray-500'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Status Badge */}
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                task.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : task.status === 'ESCALATED'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : task.status === 'DELEGATED'
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : task.status === 'REJECTED'
                                        ? 'bg-red-100 text-red-800 border border-red-200'
                                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {task.status === 'COMPLETED' ? (
                                <>
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                  <span>Completed</span>
                                </>
                              ) : task.status === 'ESCALATED' ? (
                                <>
                                  <TrendingUp className="h-2.5 w-2.5 text-amber-600" />
                                  <span>Escalated</span>
                                </>
                              ) : task.status === 'DELEGATED' ? (
                                <>
                                  <Users className="h-2.5 w-2.5 text-purple-600" />
                                  <span>Delegated</span>
                                </>
                              ) : task.status === 'REJECTED' ? (
                                <>
                                  <X className="h-2.5 w-2.5 text-red-600" />
                                  <span>Rejected</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-2.5 w-2.5 text-blue-600" />
                                  <span>Pending</span>
                                </>
                              )}
                            </span>

                            {/* Overdue Alert Badge */}
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 border border-red-200 animate-pulse">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>Overdue</span>
                              </span>
                            )}

                            <span className="font-semibold text-gray-900">
                              Stage: {task.state_name}
                            </span>

                            {task.role_id && (
                              <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                                <UserCheck className="h-3 w-3 text-gray-500" />
                                <span>Role: {task.role_id}</span>
                              </span>
                            )}

                            {task.resolution_trace && (
                              <InfoTooltip text={`Role Resolution Trace: ${JSON.stringify(task.resolution_trace)}`} />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600 text-[11px]">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Assignee:</span>
                              <span className="font-medium text-gray-800">{assigneeLabel}</span>
                            </div>

                            {task.due_date && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                <span className="text-gray-400">Due:</span>
                                <span className={`font-medium ${isOverdue ? 'text-red-700 font-bold' : 'text-gray-700'}`}>
                                  {new Date(task.due_date).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            )}

                            {task.time_limit_hours && !task.due_date && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                <span className="text-gray-400">SLA:</span>
                                <span className="font-medium text-gray-700">{task.time_limit_hours}h limit</span>
                              </div>
                            )}

                            {task.escalated_to_person_id && (
                              <div className="flex items-center gap-1 text-amber-800">
                                <TrendingUp className="h-3 w-3 text-amber-600" />
                                <span className="text-amber-700 font-medium">
                                  Escalated to: {task.escalated_to_person_name || task.escalated_to_person_id}
                                </span>
                              </div>
                            )}
                          </div>

                          {task.instructions && (
                            <p className="mt-1 text-gray-600 text-xs italic bg-white/80 rounded px-2 py-1 border border-gray-200/50">
                              "{task.instructions}"
                            </p>
                          )}
                        </div>

                        {/* Task Action Buttons */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                disabled={completingTaskId === task.id || escalatingTaskId === task.id}
                                onClick={() => handleCompleteTask(task.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs hover:border-gray-300 transition-colors disabled:opacity-50"
                              >
                                {completingTaskId === task.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" />
                                ) : (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                )}
                                <span>Complete</span>
                              </button>

                              <button
                                type="button"
                                disabled={completingTaskId === task.id || escalatingTaskId === task.id}
                                onClick={() => handleEscalateTask(task.id)}
                                title="Escalate task to supervisor or delegate"
                                className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-amber-50 border border-gray-200 hover:border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:text-amber-800 shadow-2xs transition-colors disabled:opacity-50"
                              >
                                {escalatingTaskId === task.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                                ) : (
                                  <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                                )}
                                <span>Escalate</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-400">
                              {task.completed_at
                                ? `Completed ${new Date(task.completed_at).toLocaleDateString()}`
                                : task.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Document Sheet Container */}
            <div id="record-form-grid" className="rounded-2xl border border-gray-200/80 bg-white p-6 sm:p-10 shadow-xs mb-8">
              {/* Document Sheet Heading */}
              <div className="mb-6 border-b border-gray-100 pb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-gray-900">
                      {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Record Form
                    </h2>
                    {isDirty && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700">
                        Unsaved edits
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Document layout reflecting the registered fields and conditional stage rules.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isDirty && !isTerminal && (
                    <button
                      type="button"
                      disabled={savingFields}
                      onClick={handleSaveFields}
                      className="flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer"
                    >
                      {savingFields ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </button>
                  )}
                  <span className="font-mono text-xs text-gray-400">
                    v{currentEntity.workflow_version || '1.0'}
                  </span>
                </div>
              </div>

              {/* Master Form Tab Strip */}
              {visibleTabs.length > 1 && (
                <div className="mb-6 flex items-center justify-between border-b border-gray-200">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {visibleTabs.map((tab) => {
                      const isActive = tab.id === activeTabId;
                      const fallbackTab = tabs[0]?.id || 'general';
                      const count = currentlyVisibleItems.filter(
                        (it) => (it.tabId ?? (it as any).tab_id ?? fallbackTab) === tab.id
                      ).length;
                      const isInteractionTarget =
                        isInteractionState &&
                        currentStateNode?.interaction_tab &&
                        (currentStateNode.interaction_tab.toLowerCase() === tab.id.toLowerCase() ||
                          currentStateNode.interaction_tab.toLowerCase() === tab.label.toLowerCase());

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTabId(tab.id)}
                          className={`relative flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                            isActive
                              ? 'border-blue-600 text-blue-700 bg-blue-50/20'
                              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                              isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {count}
                          </span>
                          {isInteractionTarget && (
                            <span
                              className="flex h-2 w-2 rounded-full bg-sky-500 animate-ping"
                              title="Target of current interaction step"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasLayout ? (
                tabFilteredVisibleItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-xs text-gray-400">
                      No fields configured or visible in "{visibleTabs.find((t) => t.id === activeTabId)?.label || 'this tab'}" for the current record state.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div ref={containerRef}>
                      {mounted && (
                        <GridLayout
                          width={width}
                          layout={tabFilteredVisibleItems}
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
                          {tabFilteredVisibleItems.map((it) => {
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
                            const isReadOnly = computeItemReadOnly(it);
                            const currentVal = values[it.i] ?? (it.fieldName ? values[it.fieldName] : '') ?? '';
                            return (
                              <FillCell
                                key={it.i}
                                def={fieldDef}
                                value={currentVal}
                                itemHeight={it.h}
                                readOnly={isReadOnly}
                                persons={persons}
                                personGroups={personGroups}
                                onChange={(v) => handleValueChange(it, v)}
                              />
                            );
                          })}
                        </GridLayout>
                      )}
                    </div>

                    {fallbackFields.length > 0 && (
                      <div className="mt-8 flex flex-col gap-4 pt-4 border-t border-gray-100">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                          Additional Fields
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {fallbackFields.map((f) => (
                            <FieldRow
                              key={`fallback-${f.field_name}`}
                              def={{
                                key: f.field_name,
                                name: f.field_name,
                                label: f.label || f.field_name,
                                type: f.field_type,
                                required: Boolean(f.required),
                                options: fieldOptions(f),
                                referenceEntityType:
                                  f.reference_entity_type ||
                                  (f.field_name === 'assigned_to' ? 'person' : f.field_name === 'owner_group' ? 'person_group' : null),
                              }}
                              value={values[f.field_name] ?? ''}
                              persons={persons}
                              personGroups={personGroups}
                              readOnly={computeFallbackReadOnly(f.field_name)}
                              onChange={(v) => handleFallbackChange(f.field_name, v)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
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
                        <FieldRow
                          key={k}
                          def={{
                            key: k,
                            name: k,
                            label: k,
                            type: k === 'assigned_to' || k.toLowerCase().includes('person') ? 'entity_reference' : k === 'owner_group' || k.toLowerCase().includes('group') ? 'entity_reference' : 'text',
                            required: false,
                            options: [],
                            referenceEntityType: k === 'assigned_to' ? 'person' : k === 'owner_group' ? 'person_group' : null,
                          }}
                          value={values[k] ?? (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}
                          persons={persons}
                          personGroups={personGroups}
                          readOnly={computeFallbackReadOnly(k)}
                          onChange={(newVal) => handleFallbackChange(k, newVal)}
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

      {/* Runtime Workflow Step Visualizer Modal */}
      {currentEntity && (
        <WorkflowInstanceVisualizer
          isOpen={visualizerOpen}
          onClose={() => setVisualizerOpen(false)}
          entity={currentEntity}
          entityType={entityType}
          events={events}
          taskAssignments={taskAssignments}
        />
      )}

      {/* Linked Child or Parent Entity Modal */}
      {linkedModalRecord && (
        <EntityFormView
          isModal={true}
          entityType={linkedModalRecord.entityType}
          recordId={linkedModalRecord.id}
          onClose={() => {
            setLinkedModalRecord(null);
            loadData(true);
          }}
          onRecordUpdated={() => {
            loadData(true);
            onRecordUpdated?.();
          }}
        />
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

// --- grid cell: stacked label+input on clean white card form ----
const FillCell = forwardRef<HTMLDivElement, {
  def: ResolvedField;
  value: string;
  itemHeight?: number;
  readOnly?: boolean;
  persons?: Person[];
  personGroups?: PersonGroup[];
  onChange: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}>(function FillCell({ def, value, itemHeight = 1, readOnly = false, persons = [], personGroups = [], onChange, className, style }, ref) {
  const id = useId();
  const rows = def.type === 'long_text' ? Math.max(2, Math.round((itemHeight * 40) / 24)) : 1;
  const input = makeInput(def, id, value, onChange, rows, readOnly, persons, personGroups);
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full flex-col justify-center py-1 ${
        readOnly ? 'opacity-90' : ''
      }`}
    >
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
        <span className="truncate" title={def.label || def.name}>{def.label || def.name}</span>
        {def.required && <span className="text-red-500">*</span>}
        {def.placeholder && (
          <span title={def.placeholder} className="group relative">
            <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
          </span>
        )}
        {readOnly && (
          <span className="rounded bg-amber-50 border border-amber-200 px-1 font-mono text-[9px] font-semibold text-amber-700">
            Read-only
          </span>
        )}
      </label>
      <div className="min-w-0 flex-1">{input}</div>
    </div>
  );
});

// --- full-width vertical label+input row (used for auto-appended fields) ----
function FieldRow({
  def,
  value,
  persons = [],
  personGroups = [],
  readOnly = false,
  onChange,
}: {
  def: ResolvedField;
  value: string;
  persons?: Person[];
  personGroups?: PersonGroup[];
  readOnly?: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-semibold text-gray-900">
        {def.label || def.name}
        {def.required && <span className="text-red-500">*</span>}
        {readOnly && (
          <span className="ml-auto rounded bg-amber-50 border border-amber-200 px-1 font-mono text-[9px] font-semibold text-amber-700">
            Read-only
          </span>
        )}
      </label>
      {makeInput(def, id, value, onChange, 3, readOnly, persons, personGroups)}
    </div>
  );
}

function makeInput(
  def: ResolvedField,
  id: string,
  value: string,
  onChange: (v: string) => void,
  textareaRows?: number,
  readOnly = false,
  persons: Person[] = [],
  personGroups: PersonGroup[] = []
) {
  const cls = `w-full rounded-md border px-3 py-2 text-xs transition-colors shadow-2xs ${
    readOnly
      ? 'border-gray-200 bg-gray-100/90 text-gray-500 cursor-not-allowed select-none'
      : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
  }`;

  if (def.type === 'long_text') {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        disabled={readOnly}
        readOnly={readOnly}
        rows={textareaRows ?? 3}
        placeholder={def.placeholder || ''}
        className={`${cls} h-full min-h-[36px] resize-none leading-relaxed`}
      />
    );
  }
  if (def.type === 'selection') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.length === 0 ? (
          <span className="text-xs text-gray-400">No options defined</span>
        ) : (
          def.options.map((o) => {
            const isSelected = value === o;
            const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
            const title = parts[0].trim();
            const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

            return (
              <div
                key={o}
                onClick={() => !readOnly && onChange(o)}
                className={`rounded-lg border p-4 text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
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
          })
        )}
      </div>
    );
  }
  if (def.type === 'checkbox_group') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.length === 0 ? (
          <span className="text-xs text-gray-400">No options defined</span>
        ) : (
          def.options.map((o) => {
            const checked = value.split(',').map((s) => s.trim()).includes(o);
            const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
            const title = parts[0].trim();
            const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

            return (
              <label
                key={o}
                className={`rounded-lg border p-4 text-left flex flex-col justify-between transition-all cursor-pointer ${
                  checked
                    ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                    <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly}
                    onChange={() => !readOnly && onChange(toggleMulti(value, o))}
                    className="accent-blue-600 h-4 w-4 rounded"
                  />
                </div>
                {desc && (
                  <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
                )}
              </label>
            );
          })
        )}
      </div>
    );
  }
  if (def.type === 'boolean') {
    const rawLower = typeof value === 'string' ? value.trim().toLowerCase() : (typeof value === 'boolean' ? (value ? 'true' : 'false') : '');
    const isYes = (value as any) === true || rawLower === 'true' || rawLower === 'yes' || rawLower === '1';
    const isNo = (value as any) === false || rawLower === 'false' || rawLower === 'no' || rawLower === '0';
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange('yes')}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
            isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-2xs'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange('no')}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
            isNo
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-2xs'
          }`}
        >
          No
        </button>
      </div>
    );
  }

  if (def.type === 'checklist') {
    const tasks = def.checklistItems ?? [];
    if (tasks.length === 0) {
      return <span className="text-[11px] text-gray-400">No tasks defined for this checklist</span>;
    }
    const checked = new Set(parseCheckedList(value));
    const toggle = (label: string) => {
      if (readOnly) return;
      const next = new Set(checked);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onChange(JSON.stringify([...next]));
    };
    return (
      <div className="flex w-full flex-col gap-1.5">
        {tasks.map((t) => {
          const done = checked.has(t.label);
          const pendingReq = !done && t.required;
          return (
            <label
              key={t.label}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                readOnly
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100/70 text-gray-400'
                  : done
                  ? 'border-blue-200 bg-blue-50/50 cursor-pointer'
                  : pendingReq
                  ? 'border-amber-200 bg-amber-50/40 cursor-pointer'
                  : 'border-gray-300 bg-white cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={done}
                disabled={readOnly}
                onChange={() => toggle(t.label)}
                className="accent-blue-600 h-3.5 w-3.5"
              />
              <span className={done ? 'font-medium text-gray-900' : readOnly ? 'text-gray-500' : 'text-gray-800'}>
                {t.label}
              </span>
              {t.required && (
                <span className="ml-auto shrink-0 text-[10px] font-medium text-amber-600">
                  {done ? 'required ✓' : 'required'}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (def.type === 'table') {
    return <DynamicTable def={def} value={value} onChange={onChange} readOnly={readOnly} />;
  }
  if (def.type === 'file') {
    return <FileInput def={def} value={value} onChange={onChange} readOnly={readOnly} />;
  }
  if (def.type === 'dropdown' || def.type === 'select') {
    return (
      <div className="relative w-full">
        <select
          id={id}
          value={value}
          disabled={readOnly}
          onChange={(e) => !readOnly && onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
        >
          <option value="">{def.placeholder || 'Select…'}</option>
          {(def.options || []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <Database className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
      </div>
    );
  }
  if (def.type === 'entity_reference' || def.referenceEntityType) {
    const isPerson = def.referenceEntityType === 'person' || def.name === 'assigned_to' || def.name.toLowerCase().includes('person');
    const isGroup = def.referenceEntityType === 'person_group' || def.name === 'owner_group' || def.name.toLowerCase().includes('group');

    if (isPerson) {
      return (
        <div className="relative w-full">
          <select
            id={id}
            value={value}
            disabled={readOnly}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
          >
            <option value="">{def.placeholder || 'Select Person…'}</option>
            {persons.map((p) => (
              <option key={p.person_id} value={p.person_id}>
                {p.display_name} ({p.person_id})
              </option>
            ))}
          </select>
          <Users className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        </div>
      );
    }

    if (isGroup) {
      return (
        <div className="relative w-full">
          <select
            id={id}
            value={value}
            disabled={readOnly}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
          >
            <option value="">{def.placeholder || 'Select Person Group…'}</option>
            {personGroups.map((g) => (
              <option key={g.group_name} value={g.group_name}>
                {g.group_name} {g.description ? `— ${g.description}` : ''}
              </option>
            ))}
          </select>
          <Layers className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        </div>
      );
    }
  }
  const nativeType: Record<string, string> = {
    number: 'number',
    email: 'email',
    phone: 'tel',
    url: 'url',
    date: 'date',
    datetime: 'datetime-local',
    time: 'time',
  };
  return (
    <input
      id={id}
      type={nativeType[def.type] ?? 'text'}
      value={value}
      disabled={readOnly}
      readOnly={readOnly}
      onChange={(e) => !readOnly && onChange(e.target.value)}
      placeholder={def.placeholder || ''}
      className={cls}
    />
  );
}

/** Toggle one option in a comma-joined multi-select value string. */
function toggleMulti(current: string, option: string): string {
  const set = new Set(current ? current.split(',').map((s) => s.trim()).filter(Boolean) : []);
  if (set.has(option)) set.delete(option);
  else set.add(option);
  return [...set].join(',');
}

/** Parse the JSON-array value of a checklist field into checked task labels. */
function parseCheckedList(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s)).filter(Boolean);
  } catch {
    /* fall through */
  }
  return [];
}

/** Parse the JSON-array value of a file attachment field into AttachedFile items. */
function parseFileList(value: string): AttachedFile[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((f) => f && typeof f === 'object' && f.name);
    }
  } catch {
    /* fall through */
  }
  return [];
}

function FileInput({
  def,
  value,
  onChange,
  readOnly = false,
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const [files, setFiles] = useState<AttachedFile[]>(() => parseFileList(value));
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal files state when external value changes
  useEffect(() => {
    setFiles(parseFileList(value));
  }, [value]);

  const maxMb = def.maxFileSizeMb || 10;
  const maxBytes = maxMb * 1024 * 1024;
  const allowMultiple = Boolean(def.allowMultiple);
  const maxFiles = def.maxFiles || 5;

  const commit = (next: AttachedFile[]) => {
    setFiles(next);
    onChange(JSON.stringify(next));
  };

  const processFiles = (fileList: FileList | File[]) => {
    if (readOnly) return;
    setError(null);
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    if (!allowMultiple && (incoming.length > 1 || files.length >= 1)) {
      if (incoming.length > 1) {
        setError('Only a single file attachment is allowed.');
        return;
      }
    }

    if (allowMultiple && files.length + incoming.length > maxFiles) {
      setError(`Cannot attach more than ${maxFiles} files in total.`);
      return;
    }

    // Validate size
    for (const f of incoming) {
      if (f.size > maxBytes) {
        setError(`File "${f.name}" exceeds maximum allowed size of ${maxMb} MB.`);
        return;
      }
    }

    const readers: Promise<AttachedFile>[] = incoming.map(
      (f) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: f.name,
              size: f.size,
              type: f.type || 'application/octet-stream',
              dataUrl: reader.result as string,
              lastModified: f.lastModified,
            });
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        })
    );

    Promise.all(readers)
      .then((newAttachments) => {
        if (!allowMultiple) {
          commit(newAttachments.slice(0, 1));
        } else {
          commit([...files, ...newAttachments]);
        }
      })
      .catch(() => {
        setError('Failed to read file content.');
      });
  };

  const removeFile = (idx: number) => {
    if (readOnly) return;
    commit(files.filter((_, i) => i !== idx));
  };

  const handleDrag = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  if (readOnly && files.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/60 p-2 text-xs italic text-gray-400">
        No file attached
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple={allowMultiple}
        accept={def.accept || undefined}
        onChange={(e) => {
          if (e.target.files) {
            processFiles(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Dropzone area */}
      {!readOnly && (!files.length || (allowMultiple && files.length < maxFiles)) && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50/80'
              : 'border-gray-300 bg-gray-50/70 hover:border-blue-400 hover:bg-gray-100/70'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <Paperclip className="h-4 w-4 shrink-0 text-blue-600" />
            <span>{def.placeholder || 'Click or drag files to attach'}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-gray-400">
            {def.accept ? (
              <span className="rounded bg-gray-200/70 px-1 font-mono text-gray-600">{def.accept}</span>
            ) : (
              <span>Any file type</span>
            )}
            <span>·</span>
            <span>Max {maxMb} MB</span>
            {allowMultiple && (
              <>
                <span>·</span>
                <span>Max {maxFiles} files</span>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
          <X className="h-3 w-3" /> {error}
        </p>
      )}

      {/* Attached file list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 shadow-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="truncate text-xs font-medium text-gray-800" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-gray-400">
                  {formatFileSize(f.size)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {f.dataUrl && (
                  <a
                    href={f.dataUrl}
                    download={f.name}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                  >
                    Download
                  </a>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(idx);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dynamic-row table. Columns come from the form-builder definition (added at
 * build time); rows are added/removed by the user while filling the form.
 * The value binding is a JSON string of row objects keyed by column name.
 */
function parseTableRows(value: string): Record<string, string>[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => (row && typeof row === 'object' ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String((v ?? '') as unknown)])) : {}))
      .filter((row) => Object.keys(row).length > 0);
  } catch {
    return [];
  }
}

function DynamicTable({
  def,
  value,
  onChange,
  readOnly = false,
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const cols = def.options && def.options.length > 0 ? def.options : [''];
  const [rows, setRows] = useState<Record<string, string>[]>(() => parseTableRows(value));

  // Sync internal rows state when external value changes
  useEffect(() => {
    setRows(parseTableRows(value));
  }, [value]);

  const commit = (next: Record<string, string>[]) => {
    if (readOnly) return;
    setRows(next);
    onChange(JSON.stringify(next.filter((r) => Object.values(r).some((v) => v.trim() !== ''))));
  };

  const addRow = () => {
    if (readOnly) return;
    const empty = Object.fromEntries(cols.map((c) => [c, ''])) as Record<string, string>;
    commit([...rows, empty]);
  };

  const removeRow = (idx: number) => {
    if (readOnly) return;
    commit(rows.filter((_, i) => i !== idx));
  };

  const setCell = (rowIdx: number, col: string, cellValue: string) => {
    if (readOnly) return;
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [col]: cellValue } : r));
    commit(next);
  };

  return (
    <div className="w-full overflow-hidden rounded-md border border-gray-300">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              {cols.map((c) => (
                <th key={c} className="border-b border-gray-200 px-2 py-1.5 font-medium">
                  {c}
                </th>
              ))}
              {!readOnly && <th className="w-8 border-b border-gray-200" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + (readOnly ? 0 : 1)} className="px-2 py-2 text-center text-[11px] text-gray-400">
                  {readOnly ? 'No table rows entered.' : 'No rows yet — click “Add row”.'}
                </td>
              </tr>
            )}
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                {cols.map((c) => (
                  <td key={c} className="border-r border-gray-100 px-1 py-1 last:border-r-0">
                    <input
                      value={row[c] ?? ''}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={(e) => !readOnly && setCell(ri, c, e.target.value)}
                      className={`w-full rounded border px-1.5 py-1 text-xs ${
                        readOnly
                          ? 'border-transparent bg-gray-50 text-gray-600'
                          : 'border-transparent text-gray-800 focus:border-blue-400 focus:outline-none'
                      }`}
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(ri)}
                      title="Remove row"
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="border-t border-gray-200 bg-gray-50/60 px-2 py-1.5">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        </div>
      )}
    </div>
  );
}

function toCustomFields(values: Record<string, string>, defs: ResolvedField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const rawVal = values[def.key] ?? values[def.name];
    if (rawVal === undefined || rawVal === null) continue;
    const trimmed = String(rawVal).trim();
    if (trimmed === '') continue;
    const name = def.name || def.key;
    if (def.type === 'number') {
      const n = Number(trimmed);
      out[name] = Number.isNaN(n) ? trimmed : n;
    } else if (def.type === 'boolean') {
      const low = trimmed.toLowerCase();
      out[name] = low === 'yes' || low === 'true' || low === '1';
    } else if (def.type === 'checkbox_group') {
      out[name] = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (def.type === 'table') {
      out[name] = parseTableRows(trimmed);
    } else if (def.type === 'checklist') {
      out[name] = parseCheckedList(trimmed);
    } else if (def.type === 'file') {
      out[name] = parseFileList(trimmed);
    } else {
      out[name] = trimmed;
    }
  }
  return out;
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
