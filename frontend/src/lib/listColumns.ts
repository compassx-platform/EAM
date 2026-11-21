import type { EntityField } from '../types';

export interface ListColumn {
  source: 'builtin' | 'field';
  key: string;
}

export const LIST_BUILTINS: Array<{ key: string; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'id', label: 'Record ID' },
  { key: 'status', label: 'Lifecycle Status' },
  { key: 'workflow_stage', label: 'Workflow Step' },
  { key: 'workflow_version', label: 'Version' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Created' },
];

export const DEFAULT_LIST_COLUMNS: ListColumn[] = [
  { source: 'builtin', key: 'title' },
  { source: 'builtin', key: 'id' },
  { source: 'builtin', key: 'status' },
  { source: 'builtin', key: 'workflow_stage' },
  { source: 'builtin', key: 'workflow_version' },
  { source: 'builtin', key: 'updated_at' },
];

const EXCLUDED_FIELD_TYPES = new Set(['file', 'table']);

export function listColumnKey(column: ListColumn): string {
  return `${column.source}:${column.key}`;
}

export function builtinLabel(key: string): string {
  return LIST_BUILTINS.find((item) => item.key === key)?.label || key;
}

export function isListField(field: { field_type?: string | null }): boolean {
  return !EXCLUDED_FIELD_TYPES.has(field.field_type || '');
}

export function fieldColumnLabel(key: string, fields: Array<Pick<EntityField, 'field_name' | 'label'>>): string {
  const field = fields.find((item) => item.field_name === key);
  return field?.label || key;
}
