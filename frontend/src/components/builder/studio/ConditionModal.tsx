import { useMemo, useState } from 'react';
import { Loader2, Plus, ShieldPlus, Trash2, GitBranch } from 'lucide-react';
import { api } from '../../../api/client';
import type { ConditionAtom, ConditionDefinition, ConditionGroup, ConditionTypeInfo, EntityField } from '../../../types';
import { Field } from './ui';

const OP_LABEL: Record<string, string> = {
  eq: 'equals',
  ne: 'does not equal',
  in: 'is one of',
  not_in: 'is none of',
  contains: 'contains',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  lt: 'less than',
  le: 'less than or equal',
  gt: 'greater than',
  ge: 'greater than or equal',
};

interface ConditionModalProps {
  /** Pre-selected entity type. Empty means the caller lets the author choose (standalone page). */
  entityType?: string;
  /** Entity-type options shown when entityType is empty. */
  entityTypes?: string[];
  conditionTypes: ConditionTypeInfo | null;
  fields: EntityField[];
  /** Existing condition for edit mode. */
  initial?: ConditionDefinition | null;
  onClose: () => void;
  onSaved: (condition: ConditionDefinition) => void;
}

const NUMBER_TYPES = ['number', 'integer', 'decimal', 'currency', 'duration'];
const DATE_TYPES = ['date', 'datetime'];
const SELECT_TYPES = ['select', 'dropdown', 'list', 'multiselect'];

function operatorCatalogFor(types: ConditionTypeInfo | null, fieldType?: string): string[] {
  if (!types) return ['eq', 'ne'];
  const op = types.operators;
  if (!fieldType) return op.string ?? ['eq'];
  if (NUMBER_TYPES.includes(fieldType)) return op.number ?? ['eq', 'ne'];
  if (fieldType === 'boolean') return op.boolean ?? ['eq', 'ne'];
  if (DATE_TYPES.includes(fieldType)) return op.date ?? ['eq'];
  if (SELECT_TYPES.includes(fieldType)) return op.select ?? ['eq', 'ne'];
  return op.string ?? ['eq', 'ne'];
}

// ---- Draft model -----------------------------------------------------------
type DraftNode = DraftAtom | DraftGroupNode;
type DraftAtom = { type: string; params: Record<string, unknown> };
type DraftGroupNode = { group: DraftGroup };
interface DraftGroup {
  logic: 'AND' | 'OR';
  negate?: boolean;
  rules: DraftNode[];
}

const inputCls =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none';

function seedParamsFor(type: string): Record<string, unknown> {
  if (type === 'attribute') return { operator: 'eq', case_sensitive: false };
  if (type === 'date') return { operator: 'ge', value: 'now' };
  if (type === 'expression') return { operator: 'gt', value: 0 };
  return {};
}

function makeAtom(type: string): DraftAtom {
  return { type, params: seedParamsFor(type) };
}

function makeGroup(): DraftGroupNode {
  return { group: { logic: 'AND', rules: [makeAtom('attribute')] } };
}

// ---- Import / export ------------------------------------------------------
function importNode(node: ConditionGroup['rules'][number]): DraftNode {
  if (node && typeof node === 'object' && 'group' in node && node.group) {
    return { group: importGroup(node.group) };
  }
  const atom = node as ConditionAtom;
  return { type: atom.type, params: { ...atom } } as DraftAtom;
}

function importGroup(def: ConditionGroup): DraftGroup {
  return {
    logic: (def.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
    ...(def.negate ? { negate: true } : {}),
    rules: (def.rules ?? []).map(importNode),
  };
}

function buildAtom(node: DraftAtom): ConditionAtom | null {
  const p = node.params;
  switch (node.type) {
    case 'attribute':
      return {
        type: 'attribute',
        field: String(p['field'] ?? ''),
        operator: String(p['operator'] ?? 'eq'),
        value: p['value'],
        ...(p['case_sensitive'] === true ? { case_sensitive: true } : {}),
      };
    case 'role':
      return { type: 'role', role: String(p['role'] ?? '') };
    case 'field_not_empty':
      return { type: 'field_not_empty', field: String(p['field'] ?? '') };
    case 'date':
      return {
        type: 'date',
        field: String(p['field'] ?? ''),
        operator: String(p['operator'] ?? 'ge'),
        value: p['value'] === undefined || p['value'] === '' ? 'now' : p['value'],
      };
    case 'related':
      return {
        type: 'related',
        relationship_field: String(p['relationship_field'] ?? ''),
        ...(p['target_entity_type'] ? { target_entity_type: String(p['target_entity_type']) } : {}),
        ...(p['required_status'] ? { required_status: String(p['required_status']) } : {}),
        ...(p['target_field'] ? { target_field: String(p['target_field']) } : {}),
        ...(p['operator'] ? { operator: String(p['operator']) } : {}),
        ...(p['value'] !== undefined ? { value: p['value'] } : {}),
      };
    case 'expression': {
      const value = typeof p['value'] === 'number' ? p['value'] : Number(p['value'] ?? 0);
      return {
        type: 'expression',
        expression: String(p['expression'] ?? ''),
        operator: String(p['operator'] ?? 'gt'),
        value: p['value'] ?? value,
      };
    }
    default:
      return null;
  }
}

function isGroup(n: DraftNode): n is DraftGroupNode {
  return 'group' in n && !!n.group;
}

function buildGroup(g: DraftGroup): ConditionGroup {
  return {
    logic: g.logic,
    ...(g.negate ? { negate: true } : {}),
    rules: g.rules
      .map((n) => (isGroup(n) ? { group: buildGroup(n.group) } : buildAtom(n)))
      .filter((n): n is ConditionAtom | { group: ConditionGroup } => !!n),
  };
}

// ---- Validation ------------------------------------------------------------
function validateNode(node: DraftNode): string | null {
  if (isGroup(node)) {
    if (!node.group.rules.length) return 'A sub-group has no rules';
    for (const r of node.group.rules) {
      const m = validateNode(r);
      if (m) return m;
    }
    return null;
  }
  const { type, params } = node;
  switch (type) {
    case 'attribute':
      if (!params['field']) return 'Field is required';
      if (
        params['operator'] &&
        !['is_empty', 'is_not_empty'].includes(String(params['operator'])) &&
        (params['value'] === undefined || params['value'] === '')
      ) {
        return 'Value is required';
      }
      break;
    case 'role':
      if (!params['role']) return 'Role is required';
      break;
    case 'field_not_empty':
      if (!params['field']) return 'Field is required';
      break;
    case 'date':
      if (!params['field']) return 'Field is required';
      break;
    case 'related':
      if (!params['relationship_field']) return 'Related field is required';
      if (params['target_entity_type'] && !params['required_status'] && !params['target_field']) {
        return 'Set a required status, a target field/value, or leave the target entity blank to check existence';
      }
      break;
    case 'expression':
      if (!params['expression']) return 'Expression is required';
      break;
  }
  return null;
}

// ---- Immutable tree helpers ------------------------------------------------
function mapNode(node: DraftNode, path: number[], fn: (n: DraftNode) => DraftNode): DraftNode {
  if (path.length === 0) return fn(node);
  if (!('group' in node) || !node.group) return node;
  const [idx, ...rest] = path;
  const rules = node.group.rules.map((r, i) => (i === idx ? mapNode(r, rest, fn) : r));
  return { ...node, group: { ...node.group, rules } };
}

function setAt(root: DraftGroup, path: number[], node: DraftNode): DraftGroup {
  const [idx, ...rest] = path;
  if (rest.length === 0) {
    return { ...root, rules: root.rules.map((r, i) => (i === idx ? node : r)) };
  }
  return { ...root, rules: root.rules.map((r, i) => (i === idx ? mapNode(r, rest, () => node) : r)) };
}

function removeAt(root: DraftGroup, path: number[]): DraftGroup {
  const [idx, ...rest] = path;
  if (rest.length === 0) {
    return { ...root, rules: root.rules.filter((_, i) => i !== idx) };
  }
  return {
    ...root,
    rules: root.rules.map((r, i) => {
      if (i !== idx) return r;
      if (!('group' in r) || !r.group) return r;
      return { ...r, group: removeAt(r.group, rest) };
    }),
  };
}

function nodeAt(root: DraftGroup, path: number[]): DraftNode | null {
  let cur: DraftGroup | null = root;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (!cur || !cur.rules[idx]) return null;
    const node = cur.rules[idx];
    if (i === path.length - 1) return node;
    if (!('group' in node) || !node.group) return null;
    cur = node.group;
  }
  return null;
}

function addAt(root: DraftGroup, path: number[], node: DraftNode): DraftGroup {
  if (path.length === 0) return { ...root, rules: [...root.rules, node] };
  return { ...root, rules: root.rules.map((r, i) => (i === path[0] ? mapNode(r, path.slice(1), (n) => {
    if ('group' in n && n.group) return { ...n, group: { ...n.group, rules: [...n.group.rules, node] } };
    return n;
  }) : r)) };
}

export function ConditionModal({
  entityType: initialEntityType,
  entityTypes = [],
  conditionTypes,
  fields,
  initial,
  onClose,
  onSaved,
}: ConditionModalProps) {
  const atoms = conditionTypes?.atoms ?? [];
  const [entityType, setEntityType] = useState(initial?.entity_type ?? initialEntityType ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [failurePolicy, setFailurePolicy] = useState<'block' | 'allow'>((initial?.failure_policy as 'block' | 'allow') ?? 'block');
  const [root, setRoot] = useState<DraftGroup>(() => (initial ? importGroup(initial.definition) : { logic: 'AND', rules: [makeAtom('attribute')] }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickType = (path: number[], type: string) => {
    setErr(null);
    setRoot((cur) => setAt(cur, path, makeAtom(type)));
  };

  const patchAtom = (path: number[], patch: Record<string, unknown>) => {
    setErr(null);
    setRoot((cur) => {
      const node = nodeAt(cur, path);
      if (!node || 'group' in node) return cur;
      return setAt(cur, path, { type: node.type, params: { ...node.params, ...patch } });
    });
  };

  const patchGroup = (path: number[], patch: Partial<DraftGroup>) => {
    setErr(null);
    if (path.length === 0) {
      setRoot((cur) => ({ ...cur, ...patch }));
      return;
    }
    setRoot((cur) => {
      const node = nodeAt(cur, path);
      if (!node || !('group' in node) || !node.group) return cur;
      return setAt(cur, path, { ...node, group: { ...node.group, ...patch } });
    });
  };

  const removeNode = (path: number[]) => setRoot((cur) => removeAt(cur, path));
  const addAtPath = (path: number[], node: DraftNode) => setRoot((cur) => addAt(cur, path, node));

  const scopedFields = useMemo(
    () => fields.filter((f) => !entityType || f.entity_type === entityType).sort((a, b) => a.field_name.localeCompare(b.field_name)),
    [fields, entityType],
  );

  const fieldTypeOf = (name?: unknown) =>
    typeof name === 'string' && name ? scopedFields.find((f) => f.field_name === name)?.field_type : undefined;

  const missing = useMemo(() => {
    if (!label.trim()) return 'Give the condition a name';
    if (!entityType) return 'Choose an entity type';
    if (!root.rules.length) return 'Add at least one rule';
    for (const r of root.rules) {
      const m = validateNode(r);
      if (m) return m;
    }
    return null;
  }, [label, entityType, root]);

  const operatorNeedsValue = (params: Record<string, unknown>) => {
    const op = String(params['operator'] ?? '');
    return !['is_empty', 'is_not_empty'].includes(op);
  };

  const submit = async () => {
    if (missing) {
      setErr(missing);
      return;
    }
    const definition = buildGroup(root);
    setSaving(true);
    setErr(null);
    try {
      const cond = await api.createCondition({
        id: initial?.id,
        entity_type: entityType,
        label: label.trim(),
        description: description.trim() || undefined,
        type: 'structured',
        definition,
        failure_policy: failurePolicy,
      });
      onSaved(cond);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const entityTypeOptions = useMemo(() => {
    const opts = new Set<string>();
    if (!entityType) opts.add('');
    entityTypes.forEach((t) => t && opts.add(t));
    scopedFields.forEach((f) => opts.add(f.entity_type));
    return [...opts].sort();
  }, [entityTypes, scopedFields, entityType]);

  const Editor = () => (
    <div className="flex flex-col gap-3">
      {initial && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
          <span className="font-mono text-xs font-semibold">{initial.id}</span>
          <span className="rounded-full bg-white px-1.5 py-0.5 font-semibold">v{initial.current_version}</span>
          <span className="text-blue-700">Edits apply live to every workflow &amp; form that references this condition.</span>
        </div>
      )}

      {!entityType && (
        <Field label="Entity type">
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={inputCls}>
            <option value="">— choose an entity type —</option>
            {entityTypeOptions.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Condition name">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder='e.g. "Permit is Electrical Isolation"'
            className={inputCls}
          />
        </Field>
        <Field label="Failure policy" hint="block = stop the transition; allow = log but continue.">
          <select
            value={failurePolicy}
            onChange={(e) => setFailurePolicy(e.target.value as 'block' | 'allow')}
            className={`${inputCls} text-xs`}
          >
            <option value="block">Block when not matched</option>
            <option value="allow">Allow (non-blocking)</option>
          </select>
        </Field>
      </div>

      <Field label="Description" hint="Optional — explain what this condition controls.">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Routes isolation permits to the precheck stage and gated by the safety officer."
          className={inputCls}
        />
      </Field>

      <RuleGroupEditor
        group={root}
        path={[]}
        isRoot
        atoms={atoms}
        scopedFields={scopedFields}
        fieldTypeOf={fieldTypeOf}
        onPickType={pickType}
        onPatchAtom={patchAtom}
        onPatchGroup={patchGroup}
        onRemove={removeNode}
        onAdd={addAtPath}
        operatorNeedsValue={operatorNeedsValue}
      />

      <p className="text-[11px] text-gray-400">
        {initial ? (
          <>
            Editing <span className="font-mono">{initial.id}</span> — saving bumps it to v{(initial.current_version ?? 0) + 1}. The
            id stays stable, so existing references keep working with the new logic.
          </>
        ) : (
          <>
            Saving creates a <span className="font-mono">cond_{entityType || '…'}_…</span> id that stays stable once referenced by a
            workflow or form.
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <ShieldPlus className="h-4 w-4 text-blue-700" />
            {initial ? `Edit condition · ${initial.id}` : 'New condition'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {atoms.length === 0 ? (
            <p className="text-xs text-gray-400">No condition rule types available.</p>
          ) : (
            <Editor />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {err && <p className="mr-auto text-xs text-red-600">{err}</p>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || atoms.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldPlus className="h-4 w-4" />}
            {initial ? `Save v${(initial.current_version ?? 0) + 1}` : 'Create condition'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Rule editors ---------------------------------------------------------
function RuleGroupEditor({
  group,
  path,
  isRoot,
  atoms,
  scopedFields,
  fieldTypeOf,
  onPickType,
  onPatchAtom,
  onPatchGroup,
  onRemove,
  onAdd,
  operatorNeedsValue,
}: {
  group: DraftGroup;
  path: number[];
  isRoot?: boolean;
  atoms: Array<{ type: string; name: string; description: string }>;
  scopedFields: EntityField[];
  fieldTypeOf: (name?: unknown) => string | undefined;
  onPickType: (path: number[], type: string) => void;
  onPatchAtom: (path: number[], patch: Record<string, unknown>) => void;
  onPatchGroup: (path: number[], patch: Partial<DraftGroup>) => void;
  onRemove: (path: number[]) => void;
  onAdd: (path: number[], node: DraftNode) => void;
  operatorNeedsValue: (params: Record<string, unknown>) => boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 ${isRoot ? '' : 'rounded-lg border border-gray-200 bg-gray-50/70 p-3'}`}>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Logic</label>
        <select
          value={group.logic}
          onChange={(e) => onPatchGroup(path, { logic: e.target.value as 'AND' | 'OR' })}
          className={`${inputCls} w-auto px-2 py-1 pr-6 text-xs`}
        >
          <option value="AND">ALL rules must pass</option>
          <option value="OR">ANY rule passes</option>
        </select>
        <label className="ml-1 flex cursor-pointer items-center gap-1 text-[11px] font-medium text-gray-500">
          <input
            type="checkbox"
            checked={!!group.negate}
            onChange={(e) => onPatchGroup(path, { negate: e.target.checked })}
            className="h-3.5 w-3.5 accent-blue-700"
          />
          Negate (NOT)
        </label>
        {!isRoot && (
          <button
            type="button"
            onClick={() => onRemove(path)}
            className="ml-auto rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remove sub-group"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {group.rules.map((node, i) => {
        const nodePath = [...path, i];
        if (isGroup(node)) {
          return (
            <RuleGroupEditor
              key={`g-${i}`}
              group={node.group}
              path={nodePath}
              atoms={atoms}
              scopedFields={scopedFields}
              fieldTypeOf={fieldTypeOf}
              onPickType={onPickType}
              onPatchAtom={onPatchAtom}
              onPatchGroup={onPatchGroup}
              onRemove={onRemove}
              onAdd={onAdd}
              operatorNeedsValue={operatorNeedsValue}
            />
          );
        }
        return (
          <AtomEditor
            key={`a-${i}`}
            node={node}
            path={nodePath}
            atoms={atoms}
            scopedFields={scopedFields}
            fieldTypeOf={fieldTypeOf}
            onPickType={onPickType}
            onPatchAtom={onPatchAtom}
            onRemove={onRemove}
            operatorNeedsValue={operatorNeedsValue}
          />
        );
      })}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAdd(path, makeAtom('attribute'))}
          className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
        <button
          type="button"
          onClick={() => onAdd(path, makeGroup())}
          className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
        >
          <GitBranch className="h-3.5 w-3.5" /> Add sub-group
        </button>
      </div>
    </div>
  );
}

function AtomEditor({
  node,
  path,
  atoms,
  scopedFields,
  fieldTypeOf,
  onPickType,
  onPatchAtom,
  onRemove,
  operatorNeedsValue,
}: {
  node: DraftAtom;
  path: number[];
  atoms: Array<{ type: string; name: string; description: string }>;
  scopedFields: EntityField[];
  fieldTypeOf: (name?: unknown) => string | undefined;
  onPickType: (path: number[], type: string) => void;
  onPatchAtom: (path: number[], patch: Record<string, unknown>) => void;
  onRemove: (path: number[]) => void;
  operatorNeedsValue: (params: Record<string, unknown>) => boolean;
}) {
  const p = node.params;
  const fieldType = fieldTypeOf(p['field']);
  const opOps = useMemo(() => {
    if (!fieldType) return ['eq', 'ne'];
    if (NUMBER_TYPES.includes(fieldType)) return ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'is_empty', 'is_not_empty'];
    if (fieldType === 'boolean') return ['eq', 'ne', 'is_empty', 'is_not_empty'];
    if (DATE_TYPES.includes(fieldType)) return ['lt', 'le', 'gt', 'ge', 'eq'];
    if (SELECT_TYPES.includes(fieldType)) return ['eq', 'ne', 'in', 'not_in', 'is_empty', 'is_not_empty'];
    return ['eq', 'ne', 'in', 'not_in', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
  }, [fieldType]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5">
      <div className="flex items-center gap-2">
        <select
          value={node.type}
          onChange={(e) => onPickType(path, e.target.value)}
          className={`${inputCls} flex-1 text-xs`}
        >
          {atoms.map((t) => (
            <option key={t.type} value={t.type}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRemove(path)}
          className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Remove rule"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {node.type === 'attribute' && (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5">
              <select
                value={String(p['field'] ?? '')}
                onChange={(e) =>
                  onPatchAtom(path, { ...p, field: e.target.value, ...(p['operator'] ? {} : { operator: 'eq' }) })
                }
                className={`${inputCls} text-xs`}
              >
                <option value="">— field —</option>
                {scopedFields.map((f) => (
                  <option key={f.field_name} value={f.field_name}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={String(p['operator'] ?? 'eq')}
                onChange={(e) => onPatchAtom(path, { ...p, operator: e.target.value })}
                className={`${inputCls} max-w-[150px] text-xs`}
              >
                {opOps.map((op) => (
                  <option key={op} value={op}>
                    {OP_LABEL[op] ?? op}
                  </option>
                ))}
              </select>
              <input
                value={String(p['value'] ?? '')}
                onChange={(e) => onPatchAtom(path, { ...p, value: e.target.value })}
                placeholder={fieldType ? String(fieldType) : 'value'}
                className={`${inputCls} text-xs ${operatorNeedsValue(p) ? '' : 'hidden'}`}
              />
            </div>
            {!['is_empty', 'is_not_empty'].includes(String(p['operator'] ?? '')) && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <input
                  type="checkbox"
                  checked={p['case_sensitive'] === true}
                  onChange={(e) => onPatchAtom(path, { ...p, case_sensitive: e.target.checked })}
                  className="h-3.5 w-3.5 accent-blue-700"
                />
                Case-sensitive comparison
              </label>
            )}
          </>
        )}

        {node.type === 'role' && (
          <input
            value={String(p['role'] ?? '')}
            onChange={(e) => onPatchAtom(path, { ...p, role: e.target.value })}
            placeholder="e.g. Safety Officer"
            className={`${inputCls} text-xs`}
          />
        )}

        {node.type === 'field_not_empty' && (
          <select
            value={String(p['field'] ?? '')}
            onChange={(e) => onPatchAtom(path, { ...p, field: e.target.value })}
            className={`${inputCls} text-xs`}
          >
            <option value="">— field —</option>
            {scopedFields.map((f) => (
              <option key={f.field_name} value={f.field_name}>
                {f.field_name}
              </option>
            ))}
          </select>
        )}

        {node.type === 'date' && (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5">
            <select
              value={String(p['field'] ?? '')}
              onChange={(e) => onPatchAtom(path, { ...p, field: e.target.value })}
              className={`${inputCls} text-xs`}
            >
              <option value="">— date field —</option>
              {scopedFields
                .filter((f) => DATE_TYPES.includes(f.field_type))
                .map((f) => (
                  <option key={f.field_name} value={f.field_name}>
                    {f.field_name}
                  </option>
                ))}
            </select>
            <select
              value={String(p['operator'] ?? 'ge')}
              onChange={(e) => onPatchAtom(path, { ...p, operator: e.target.value })}
              className={`${inputCls} max-w-[130px] text-xs`}
            >
              <option value="lt">before</option>
              <option value="le">on or before</option>
              <option value="gt">after</option>
              <option value="ge">on or after</option>
              <option value="eq">equal to</option>
            </select>
            <input
              value={String(p['value'] ?? 'now')}
              onChange={(e) => onPatchAtom(path, { ...p, value: e.target.value })}
              placeholder="YYYY-MM-DD or 'now'"
              className={`${inputCls} text-xs`}
            />
          </div>
        )}

        {node.type === 'related' && (
          <div className="flex flex-col gap-1.5">
            <select
              value={String(p['relationship_field'] ?? '')}
              onChange={(e) => onPatchAtom(path, { ...p, relationship_field: e.target.value })}
              className={`${inputCls} text-xs`}
            >
              <option value="">— linked entity field —</option>
              {scopedFields
                .filter((f) => f.field_type === 'entity_reference')
                .map((f) => (
                  <option key={f.field_name} value={f.field_name}>
                    {f.field_name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={String(p['target_entity_type'] ?? '')}
                onChange={(e) => onPatchAtom(path, { ...p, target_entity_type: e.target.value })}
                placeholder="target entity (e.g. workorder)"
                className={`${inputCls} text-xs`}
              />
              <input
                value={String(p['required_status'] ?? '')}
                onChange={(e) => onPatchAtom(path, { ...p, required_status: e.target.value })}
                placeholder="required status (e.g. Approved)"
                className={`${inputCls} text-xs`}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={String(p['target_field'] ?? '')}
                onChange={(e) => onPatchAtom(path, { ...p, target_field: e.target.value })}
                placeholder="target field (optional)"
                className={`${inputCls} text-xs`}
              />
              <input
                value={String(p['value'] ?? '')}
                onChange={(e) => onPatchAtom(path, { ...p, value: e.target.value })}
                placeholder="expected value"
                className={`${inputCls} text-xs`}
              />
            </div>
          </div>
        )}

        {node.type === 'expression' && (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5">
            <input
              value={String(p['expression'] ?? '')}
              onChange={(e) => onPatchAtom(path, { ...p, expression: e.target.value })}
              placeholder="($estlabcost + $estmatcost)"
              className={`${inputCls} font-mono text-xs`}
            />
            <select
              value={String(p['operator'] ?? 'gt')}
              onChange={(e) => onPatchAtom(path, { ...p, operator: e.target.value })}
              className={`${inputCls} max-w-[110px] text-xs`}
            >
              <option value="gt">gt</option>
              <option value="ge">ge</option>
              <option value="lt">lt</option>
              <option value="le">le</option>
              <option value="eq">eq</option>
              <option value="ne">ne</option>
            </select>
            <input
              type="number"
              value={String(p['value'] ?? '')}
              onChange={(e) => onPatchAtom(path, { ...p, value: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="threshold"
              className={`${inputCls} text-xs`}
            />
          </div>
        )}
      </div>
    </div>
  );
}