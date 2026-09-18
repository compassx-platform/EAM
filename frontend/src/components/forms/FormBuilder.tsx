import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GridLayout,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type {
  EntityField,
  EntityFormItem,
  GenericFieldType,
  EntityFieldType,
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
import { ConditionModal } from '../builder/studio/ConditionModal';
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
  const [fields, setFields] = useState<EntityField[]>([]);
  const [workflowStates, setWorkflowStates] = useState<string[]>([]);
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
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
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [conditionToEdit, setConditionToEdit] = useState<ConditionDefinition | null>(null);
  const [conditionAnchorY, setConditionAnchorY] = useState<number | null>(null);
  const [centralConditionsListOpen, setCentralConditionsListOpen] = useState(false);

  // Canvas container measurement
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);
  const [mounted, setMounted] = useState(false);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

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
        setFields(formData.fields || allFields || []);
        setWorkflowStates(formData.workflow_states || []);
        setCols(formData.cols || 12);
        setRowHeight(formData.row_height || 40);
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
    const byId = new Map(items.map((it) => [it.i, it]));
    setItems(
      newLayout.map((li: LayoutItem) => {
        const existing = byId.get(li.i);
        return {
          ...(existing ?? {}),
          i: li.i,
          x: li.x,
          y: li.y,
          w: li.w,
          h: li.h,
        } as EntityFormItem;
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

  const addHeading = () => {
    const id = nextItemId('header');
    const y = nextY(items, cols);
    const headingCount = items.filter((it) => it.isHeader).length + 1;
    const item: EntityFormItem = {
      i: id,
      x: 0,
      y,
      w: cols,
      h: 1,
      isHeader: true,
      label: `Section ${headingCount}`,
    };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    setDirty(true);
  };

  const addGroup = (): string => {
    const id = nextItemId('group');
    const y = nextY(items, cols);
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
    const y = nextY(items, cols);
    const { fieldType, w, h } = widgetForField(field.field_type);

    const item: EntityFormItem = {
      i: id,
      x: 0,
      y,
      w,
      h,
      label: field.label || field.field_name
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      fieldName: field.field_name,
      fieldType,
      required: Boolean(field.required),
      options: field.select_options && field.select_options.length > 0
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
        cols,
        row_height: rowHeight,
      });
      if (res && Array.isArray(res.layout)) {
        setItems(normalizeFormLayout(res.layout, cols));
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
              <div className="mb-6 shrink-0">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900">
                  {entityType.charAt(0).toUpperCase() + entityType.slice(1)} setup
                </h1>
                <p className="mt-0.5 text-xs text-gray-500">
                  Configure fields, layout arrangement, and conditional logic rules for {entityType}.
                </p>
              </div>

              {!loaded ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-gray-400 py-20">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading form layout…</span>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
                  <span className="text-sm font-semibold text-gray-800">Form Layout is Empty</span>
                  <p className="max-w-sm text-xs text-gray-500">
                    Click any widget or entity field on the left palette to add it to this form.
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
                      layout={items}
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
                      {items.map((it) => {
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
          cols={cols}
          rowHeight={rowHeight}
          onClose={() => setJsonOpen(false)}
          onImport={(imported, newCols, newRowHeight) => {
            setItems(imported);
            setCols(newCols);
            setRowHeight(newRowHeight);
            setDirty(true);
            flash('ok', `Imported ${imported.length} items from schema JSON.`);
          }}
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
    </div>
  );
}