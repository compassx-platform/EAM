import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GridLayout,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Loader2, History, Calendar, X, Plus, Settings2, ShieldCheck, Lock, Eye, EyeOff, Pencil } from 'lucide-react';
import { api } from '../../api/client';
import type {
  EntityField,
  EntityFormItem,
  GenericFieldType,
  EntityFieldType,
  FormVersion,
  FormTab,
  OptionListSummary,
  ResolvedList,
  ConditionDefinition,
} from '../../types';
import {
  nextItemId,
  nextY,
  normalizeFormLayout,
} from './formUtils';
import { FormToolbar } from './FormToolbar';
import { FormPalette } from './FormPalette';
import { FormCanvasItem } from './FormCanvasItem';
import { FormInspector } from './FormInspector';
import { FormPreviewModal } from './FormPreviewModal';
import { FormJsonModal } from './FormJsonModal';
import { TabSettingsModal } from './TabSettingsModal';
import { ConditionModal } from '../workflow-ui/ConditionModal';
import { ConditionList } from '../conditions/ConditionList';

interface FormBuilderProps {
  entityType: string;
  onBack: () => void;
  onChanged: () => void;
}

/** Maps a registry field type to its default form widget + grid size. */
function widgetForField(fieldType: EntityFieldType): { fieldType: GenericFieldType; w: number; h: number } {
  switch (fieldType) {
    case 'select':
      return { fieldType: 'dropdown', w: 6, h: 1 };
    case 'selection':
      return { fieldType: 'selection', w: 6, h: 2 };
    case 'checkbox_group':
      return { fieldType: 'checkbox_group', w: 6, h: 2 };
    case 'boolean':
      return { fieldType: 'boolean', w: 6, h: 1 };
    case 'long_text':
      return { fieldType: 'long_text', w: 12, h: 3 };
    case 'date':
    case 'datetime':
    case 'time':
    case 'number':
    case 'email':
    case 'phone':
    case 'url':
      return { fieldType, w: 6, h: 1 };
    case 'table':
      return { fieldType: 'table', w: 12, h: 3 };
    case 'checklist':
      return { fieldType: 'checklist', w: 12, h: 4 };
    case 'file':
      return { fieldType: 'file', w: 12, h: 2 };
    default:
      return { fieldType: 'text', w: 6, h: 1 };
  }
}

export function FormBuilder({ entityType, onBack, onChanged }: FormBuilderProps) {
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [tabs, setTabs] = useState<FormTab[]>([
    { id: 'general', label: 'General Details', is_default: true },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('general');
  const [fields, setFields] = useState<EntityField[]>([]);
  const [workflowStates, setWorkflowStates] = useState<string[]>([]);
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [versionLabel, setVersionLabel] = useState('v1');
  const [selected, setSelected] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // Central conditions & shared lists
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [conditionTypes, setConditionTypes] = useState<any>(null);
  const [publishedLists, setPublishedLists] = useState<OptionListSummary[]>([]);
  const [resolvedLists, setResolvedLists] = useState<Record<string, ResolvedList>>({});

  // Status flags
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Modal states
  const [jsonOpen, setJsonOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<FormTab | null>(null);
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [conditionToEdit, setConditionToEdit] = useState<ConditionDefinition | null>(null);
  const [conditionAnchorY, setConditionAnchorY] = useState<number | null>(null);
  const [centralConditionsListOpen, setCentralConditionsListOpen] = useState(false);
  const [formHistoryOpen, setFormHistoryOpen] = useState(false);
  const [formHistory, setFormHistory] = useState<FormVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Canvas container measurement
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);
  const [mounted, setMounted] = useState(false);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const handleOpenHistory = async () => {
    setFormHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const history = await api.getFormHistory(entityType);
      setFormHistory(history);
    } catch {
      setFormHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleLoadFormSnapshot = (snap: FormVersion) => {
    const normalized = normalizeFormLayout(snap.layout || [], snap.cols || cols);
    setItems(normalized);
    if (snap.tabs && snap.tabs.length > 0) {
      setTabs(snap.tabs);
      setActiveTabId(snap.tabs[0].id);
    }
    setCols(snap.cols || cols);
    setRowHeight(snap.row_height || rowHeight);
    setVersionLabel(snap.version_label);
    setDirty(false);
    setFormHistoryOpen(false);
    flash('ok', `Loaded layout snapshot ${snap.version_label}`);
  };

  const refreshConditions = useCallback(async () => {
    try {
      const list = await api.listConditions(entityType);
      setConditions(list);
    } catch {
      /* ignore */
    }
  }, [entityType]);

  const ensureResolved = useCallback(
    async (keys: (string | null | undefined)[]) => {
      const needed = keys.filter(
        (k): k is string => Boolean(k) && !resolvedLists[k]
      );
      if (needed.length === 0) return;
      try {
        const res = await api.resolveLists(needed);
        setResolvedLists((prev) => ({ ...prev, ...res.resolved }));
      } catch {
        /* ignore */
      }
    },
    [resolvedLists]
  );

  // Initial data loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [formData, allFields, condList, condTypes, lists] = await Promise.all([
          api.getForm(entityType),
          api.listFields(entityType),
          api.listConditions(entityType).catch(() => []),
          api.listConditionTypes().catch(() => null),
          api.listLists().catch(() => []),
        ]);

        if (cancelled) return;

        const normalized = normalizeFormLayout(formData.layout || [], formData.cols || 12);
        setItems(normalized);
        const loadedTabs: FormTab[] =
          formData.tabs && formData.tabs.length > 0
            ? formData.tabs
            : [{ id: 'general', label: 'General Details', is_default: true }];
        setTabs(loadedTabs);
        const defaultTab = loadedTabs.find((t) => t.is_default) || loadedTabs[0];
        setActiveTabId(defaultTab ? defaultTab.id : 'general');

        setFields(formData.fields || allFields || []);
        setWorkflowStates(formData.workflow_states || []);
        setCols(formData.cols || 12);
        setRowHeight(formData.row_height || 40);
        setVersionLabel(formData.version_label || (formData.version_number ? `v${formData.version_number}` : 'v1'));
        setConditions(condList);
        setConditionTypes(condTypes);
        setPublishedLists(lists.filter((l) => l.status === 'published'));

        // Resolve any lists referenced in layout
        const listKeys = normalized
          .map((it) => it.optionsList)
          .filter((k): k is string => Boolean(k));
        if (listKeys.length > 0) {
          api
            .resolveLists(listKeys)
            .then((r) => {
              if (!cancelled) setResolvedLists(r.resolved);
            })
            .catch(() => {});
        }
      } catch (e: any) {
        if (!cancelled) flash('err', `Failed loading form: ${e.message}`);
      } finally {
        if (!cancelled) {
          setLoaded(true);
          setMounted(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entityType, flash]);

  // Resize measurement for react-grid-layout
  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        const w = Math.round(canvasRef.current.clientWidth);
        if (w > 0) setCanvasWidth(w);
      }
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      const ro = new ResizeObserver(updateSize);
      ro.observe(canvasRef.current);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [loaded]);

  // Layout mutation handlers
  const handleLayoutChange = (newLayout: Layout) => {
    const layoutMap = new Map<string, LayoutItem>();
    newLayout.forEach((li) => layoutMap.set(li.i, li));

    setItems((prev) =>
      prev.map((it) => {
        const updated = layoutMap.get(it.i);
        if (updated) {
          return {
            ...it,
            x: updated.x,
            y: updated.y,
            w: updated.w,
            h: updated.h,
          };
        }
        return it;
      })
    );
    setDirty(true);
  };

  const patchItem = (id: string, patch: Partial<EntityFormItem>) => {
    setItems((prev) => prev.map((it) => (it.i === id ? { ...it, ...patch } : it)));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.i !== id));
    setSelected((s) => (s === id ? null : s));
    setDirty(true);
  };

  // Tab management handlers
  const handleAddTab = () => {
    const count = tabs.length + 1;
    const newId = `tab_${count}`;
    const newLabel = `Tab ${count}`;
    const newTab: FormTab = {
      id: newId,
      label: newLabel,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setDirty(true);
    setEditingTab(newTab);
    setTabModalOpen(true);
  };

  const handleSaveTab = (updatedTab: FormTab, oldId: string) => {
    setTabs((prev) => {
      let updated = prev.map((t) => (t.id === oldId ? updatedTab : t));
      if (updatedTab.is_default) {
        updated = updated.map((t) => (t.id === updatedTab.id ? t : { ...t, is_default: false }));
      }
      return updated;
    });

    if (oldId !== updatedTab.id) {
      setItems((prev) =>
        prev.map((it) => {
          const itTab = it.tabId ?? (it as any).tab_id ?? (tabs[0]?.id || 'general');
          if (itTab === oldId) {
            return { ...it, tabId: updatedTab.id, tab_id: updatedTab.id };
          }
          return it;
        })
      );
      if (activeTabId === oldId) {
        setActiveTabId(updatedTab.id);
      }
    }
    setTabModalOpen(false);
    setEditingTab(null);
    setDirty(true);
    flash('ok', `Tab "${updatedTab.label}" updated.`);
  };

  const handleDeleteTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    const targetFallbackId = remaining.find((t) => t.is_default)?.id || remaining[0].id;
    setItems((prev) =>
      prev.map((it) => {
        const itTab = it.tabId ?? (it as any).tab_id ?? (tabs[0]?.id || 'general');
        if (itTab === tabId) {
          return { ...it, tabId: targetFallbackId, tab_id: targetFallbackId };
        }
        return it;
      })
    );
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(targetFallbackId);
    }
    setTabModalOpen(false);
    setEditingTab(null);
    setDirty(true);
    flash('ok', 'Tab deleted and fields reassigned.');
  };

  const addHeading = () => {
    const id = nextItemId('header');
    const fallbackTab = tabs[0]?.id || 'general';
    const currentTabId = activeTabId || fallbackTab;
    const currentTabItems = items.filter(
      (it) => (it.tabId ?? (it as any).tab_id ?? fallbackTab) === currentTabId
    );
    const y = nextY(currentTabItems, cols);
    const headingCount = items.filter((it) => it.isHeader).length + 1;
    const item: EntityFormItem = {
      i: id,
      x: 0,
      y,
      w: cols,
      h: 1,
      isHeader: true,
      label: `Section ${headingCount}`,
      tabId: currentTabId,
      tab_id: currentTabId,
    };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    setDirty(true);
  };

  const addGroup = (): string => {
    const id = nextItemId('group');
    const fallbackTab = tabs[0]?.id || 'general';
    const currentTabId = activeTabId || fallbackTab;
    const currentTabItems = items.filter(
      (it) => (it.tabId ?? (it as any).tab_id ?? fallbackTab) === currentTabId
    );
    const y = nextY(currentTabItems, cols);
    const groupCount = items.filter((it) => it.isGroup).length + 1;
    const title = `Group ${groupCount}`;
    const item: EntityFormItem = {
      i: id,
      x: 0,
      y,
      w: cols,
      h: 1,
      isGroup: true,
      groupId: id,
      label: title,
      groupTitle: title,
      tabId: currentTabId,
      tab_id: currentTabId,
    };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    setDirty(true);
    return id;
  };

  /** Maps a registry field to its default form widget + grid size + options source. */
  const addRegisteredField = (field: EntityField) => {
    const alreadyPlaced = new Set(
      items.map((it) => it.fieldName).filter((n): n is string => Boolean(n))
    );
    if (alreadyPlaced.has(field.field_name)) return;
    const id = nextItemId('field');
    const fallbackTab = tabs[0]?.id || 'general';
    const currentTabId = activeTabId || fallbackTab;
    const currentTabItems = items.filter(
      (it) => (it.tabId ?? (it as any).tab_id ?? fallbackTab) === currentTabId
    );
    const y = nextY(currentTabItems, cols);
    const { fieldType, w, h } = widgetForField(field.field_type);

    const item: EntityFormItem = {
      i: id,
      x: 0,
      y,
      w,
      h,
      label:
        field.label ||
        field.field_name
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      fieldName: field.field_name,
      fieldType,
      required: Boolean(field.required),
      tabId: currentTabId,
      tab_id: currentTabId,
      options:
        field.select_options && field.select_options.length > 0
          ? [...field.select_options]
          : fieldType === 'table'
          ? ['Column 1', 'Column 2', 'Column 3']
          : [],
      optionsList: field.option_list_key || null,
      minRows: fieldType === 'table' ? null : undefined,
      maxRows: fieldType === 'table' ? null : undefined,
      allowAddRows: fieldType === 'table' ? true : undefined,
      allowDeleteRows: fieldType === 'table' ? true : undefined,
      emptyStateText: fieldType === 'table' ? null : undefined,
    };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    setDirty(true);
    if (field.option_list_key) {
      ensureResolved([field.option_list_key]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveForm({
        entity_type: entityType,
        layout: items,
        tabs,
        cols,
        row_height: rowHeight,
      });
      if (res && Array.isArray(res.layout)) {
        setItems(normalizeFormLayout(res.layout, cols));
      }
      if (res && res.tabs && res.tabs.length > 0) {
        setTabs(res.tabs);
      }
      if (res && res.version_label) {
        setVersionLabel(res.version_label);
      } else if (res && res.version_number) {
        setVersionLabel(`v${res.version_number}`);
      }
      setDirty(false);
      onChanged();
      flash('ok', 'Form layout saved successfully.');
    } catch (e: any) {
      flash('err', `Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the custom form layout for "${entityType}"?`)) return;
    setDeleting(true);
    try {
      await api.deleteForm(entityType);
      setItems([]);
      setDirty(false);
      onChanged();
      flash('ok', 'Form layout reset.');
    } catch (e: any) {
      flash('err', `Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenConditionModal = (condition?: ConditionDefinition | null, anchorY?: number | null) => {
    setConditionToEdit(condition || null);
    setConditionAnchorY(anchorY || null);
    setConditionModalOpen(true);
  };

  const handleConditionSaved = (saved: ConditionDefinition) => {
    setConditionModalOpen(false);
    setConditionToEdit(null);
    setConditionAnchorY(null);
    refreshConditions();

    // If an item is currently selected, link this saved condition to it!
    if (selected) {
      const current = items.find((it) => it.i === selected);
      const action = current?.visibilityCondition?.action || 'show';
      patchItem(selected, {
        visibilityCondition: {
          action,
          condition_id: saved.id,
        },
        visibility_condition: {
          action,
          condition_id: saved.id,
        },
      });
    }
    flash('ok', `Condition "${saved.label}" saved and linked.`);
  };

  const placedFieldNames = useMemo(
    () => new Set(items.map((it) => it.fieldName).filter((n): n is string => Boolean(n))),
    [items]
  );

  const activeTabItems = useMemo(() => {
    const fallbackTab = tabs[0]?.id || 'general';
    return items.filter((it) => (it.tabId ?? (it as any).tab_id ?? fallbackTab) === activeTabId);
  }, [items, tabs, activeTabId]);

  const selectedItem = selected ? items.find((it) => it.i === selected) || null : null;

  return (
    <div className="flex h-full w-full flex-row min-h-0 overflow-hidden bg-white">
      {/* Left Field Palette taking full height */}
      <FormPalette
        registeredFields={fields}
        placedFieldNames={placedFieldNames}
        onAddHeading={addHeading}
        onAddGroup={addGroup}
        onAddRegisteredField={addRegisteredField}
      />

      {/* Main Studio Area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Toolbar */}
        <FormToolbar
          entityType={entityType}
          versionLabel={versionLabel}
          itemCount={items.length}
          conditions={conditions}
          dirty={dirty}
          saving={saving}
          deleting={deleting}
          notice={notice}
          onBack={onBack}
          onSave={handleSave}
          onDelete={handleDelete}
          onOpenJson={() => setJsonOpen(true)}
          onOpenPreview={() => setPreviewOpen(true)}
          onOpenHistory={handleOpenHistory}
          onOpenConditionsList={() => setCentralConditionsListOpen(true)}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden relative">
          {/* Center Grid Canvas */}
          <main
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
            className="relative min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-6 sm:p-10"
          >
            <div
              className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-8 sm:p-10 shadow-xs min-h-full flex flex-col"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelected(null);
              }}
            >
              {/* Form Title & Description matching reference design */}
              <div className="mb-4 shrink-0">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900">
                  {entityType.charAt(0).toUpperCase() + entityType.slice(1)} setup
                </h1>
                <p className="mt-0.5 text-xs text-gray-500">
                  Configure fields, master form tabs, and conditional logic rules for {entityType}.
                </p>
              </div>

              {/* Master Form Tab Strip */}
              <div className="mb-6 flex items-center justify-between border-b border-gray-200">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    const tabItemCount = items.filter(
                      (it) => (it.tabId ?? (it as any).tab_id ?? (tabs[0]?.id || 'general')) === tab.id
                    ).length;
                    const condId = tab.visibility_condition?.condition_id || tab.condition_id;
                    const cond = condId
                      ? conditions.find((c) => c.id === condId)
                      : null;
                    const action = tab.visibility_condition?.action || 'show';

                    return (
                      <div
                        key={tab.id}
                        className={`group flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                          isActive
                            ? 'border-blue-600 text-blue-700 bg-blue-50/20'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                        }`}
                        onClick={() => {
                          setActiveTabId(tab.id);
                          setSelected(null);
                        }}
                      >
                        <span>{tab.label}</span>

                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                            isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {tabItemCount}
                        </span>

                        {condId && (
                          <span
                            title={`Tab Rule (${action}): ${cond?.label || condId}`}
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-medium ${
                              action === 'readonly'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : action === 'editable'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : action === 'hide'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {action === 'readonly' ? (
                              <Lock className="h-2.5 w-2.5" />
                            ) : action === 'editable' ? (
                              <Pencil className="h-2.5 w-2.5" />
                            ) : action === 'hide' ? (
                              <EyeOff className="h-2.5 w-2.5" />
                            ) : (
                              <Eye className="h-2.5 w-2.5" />
                            )}
                            <span className="max-w-[80px] truncate">
                              {action === 'readonly'
                                ? 'Disable'
                                : action === 'editable'
                                ? 'Enable'
                                : action === 'hide'
                                ? 'Hide'
                                : 'Show'}
                            </span>
                          </span>
                        )}

                        <button
                          type="button"
                          title="Configure tab settings"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTab(tab);
                            setTabModalOpen(true);
                          }}
                          className={`rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors ${
                            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddTab}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors ml-1"
                    title="Add new tab to master form"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Tab</span>
                  </button>
                </div>
              </div>

              {!loaded ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-gray-400 py-20">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading form layout…</span>
                </div>
              ) : activeTabItems.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center my-4">
                  <span className="text-sm font-semibold text-gray-800">
                    No Fields in "{tabs.find((t) => t.id === activeTabId)?.label || 'this tab'}"
                  </span>
                  <p className="max-w-sm text-xs text-gray-500">
                    Click any widget or registered entity field on the left palette to add it to this tab.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={addHeading}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
                    >
                      + Add Section
                    </button>
                  </div>
                </div>
              ) : (
                <div ref={canvasRef} className="w-full flex-1 min-h-0">
                  {mounted && (
                    <GridLayout
                      width={canvasWidth > 0 ? canvasWidth : 800}
                      layout={activeTabItems}
                      compactor={verticalCompactor}
                      gridConfig={{
                        cols,
                        rowHeight,
                        margin: [16, 16],
                        containerPadding: [0, 0],
                      }}
                      dragConfig={{
                        enabled: true,
                        handle: '.drag-handle',
                      }}
                      resizeConfig={{
                        enabled: true,
                      }}
                      onLayoutChange={handleLayoutChange}
                      className="transition-all"
                    >
                      {activeTabItems.map((it) => {
                        const isSelected = selected === it.i;
                        const groupTitle = it.groupId
                          ? items.find((g) => g.isGroup && (g.groupId === it.groupId || g.i === it.groupId))?.label
                          : null;
                        const resolved = it.optionsList ? resolvedLists[it.optionsList] : null;
                        const itVal = formValues[it.i] ?? (it.fieldName ? formValues[it.fieldName] : '');

                        return (
                          <FormCanvasItem
                            key={it.i}
                            item={it}
                            isSelected={isSelected}
                            value={itVal}
                            onChange={(val) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [it.i]: val,
                                ...(it.fieldName ? { [it.fieldName]: val } : {}),
                              }))
                            }
                            resolvedList={resolved}
                            conditions={conditions}
                            groupTitle={groupTitle}
                            onSelect={(id) => setSelected(id)}
                            onRemove={removeItem}
                          />
                        );
                      })}
                    </GridLayout>
                  )}
                </div>
              )}
            </div>
          </main>

        {/* Right Inspector */}
        <FormInspector
          selectedItem={selectedItem}
          allItems={items}
          tabs={tabs}
          cols={cols}
          publishedLists={publishedLists}
          resolvedLists={resolvedLists}
          conditions={conditions}
          entityType={entityType}
          onPatchItem={patchItem}
          onRemoveItem={removeItem}
          onEnsureResolved={ensureResolved}
          onOpenConditionModal={handleOpenConditionModal}
          onCreateGroup={addGroup}
        />
      </div>
    </div>

      {/* Interactive Preview Modal */}
      {previewOpen && (
        <FormPreviewModal
          entityType={entityType}
          items={items}
          tabs={tabs}
          cols={cols}
          rowHeight={rowHeight}
          workflowStates={workflowStates}
          resolvedLists={resolvedLists}
          conditions={conditions}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* JSON Schema Modal */}
      {jsonOpen && (
        <FormJsonModal
          entityType={entityType}
          items={items}
          tabs={tabs}
          cols={cols}
          rowHeight={rowHeight}
          onClose={() => setJsonOpen(false)}
          onImport={(imported, importedTabs, newCols, newRowHeight) => {
            setItems(imported);
            setCols(newCols);
            setRowHeight(newRowHeight);
            if (importedTabs && importedTabs.length > 0) {
              setTabs(importedTabs);
              setActiveTabId(importedTabs[0].id);
            }
            setDirty(true);
            flash('ok', `Imported ${imported.length} items from schema JSON.`);
          }}
        />
      )}

      {/* Tab Settings Modal */}
      {tabModalOpen && editingTab && (
        <TabSettingsModal
          tab={editingTab}
          allTabs={tabs}
          conditions={conditions}
          onSave={handleSaveTab}
          onDelete={handleDeleteTab}
          onClose={() => {
            setTabModalOpen(false);
            setEditingTab(null);
          }}
          onOpenConditionModal={() => handleOpenConditionModal()}
        />
      )}

      {/* Central Condition Modal (Create/Edit condition definition) */}
      {conditionModalOpen && (
        <ConditionModal
          variant="dialog"
          anchorY={conditionAnchorY}
          entityType={entityType}
          conditionTypes={conditionTypes}
          fields={fields}
          initial={conditionToEdit}
          onClose={() => {
            setConditionModalOpen(false);
            setConditionToEdit(null);
            setConditionAnchorY(null);
          }}
          onSaved={handleConditionSaved}
        />
      )}

      {/* Central Conditions Overview Slideout/Modal */}
      {centralConditionsListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" onMouseDown={() => setCentralConditionsListOpen(false)}>
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">
                Central Conditions for <span className="font-mono text-blue-700">{entityType}</span>
              </h2>
              <button
                type="button"
                onClick={() => setCentralConditionsListOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ConditionList />
            </div>
          </div>
        </div>
      )}

      {/* Form Version History Modal */}
      {formHistoryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={() => setFormHistoryOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">
                  Form History · <span className="font-mono text-gray-600">{entityType}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormHistoryOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-xs">Loading form history…</span>
                </div>
              ) : formHistory.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">No previous form layout versions found.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                  {formHistory.map((snap) => {
                    const isCurrent = snap.version_label === versionLabel;
                    const itemCount = snap.layout?.length ?? 0;

                    return (
                      <div
                        key={snap.id}
                        className={`flex items-center justify-between p-3.5 transition-colors ${
                          isCurrent ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-gray-900">{snap.version_label}</span>
                            {isCurrent && (
                              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                Active in Editor
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                            <span>·</span>
                            <span>{snap.cols} columns</span>
                            {snap.created_at && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  Saved {new Date(snap.created_at).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleLoadFormSnapshot(snap)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                          >
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setFormHistoryOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}