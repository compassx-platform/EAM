import type { ComponentType } from 'react';
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  Link,
  Calendar,
  CalendarClock,
  Clock,
  ListChecks,
  CheckSquare,
  ChevronDown,
  ToggleRight,
  Table2,
  Paperclip,
  Heading,
  Layers,
  FileText,
} from 'lucide-react';
import type { EntityFormItem } from '../../types';

export function getFieldTypeIcon(type?: string): ComponentType<{ className?: string }> {
  switch (type) {
    case 'text':
      return Type;
    case 'long_text':
      return AlignLeft;
    case 'number':
      return Hash;
    case 'email':
      return Mail;
    case 'phone':
      return Phone;
    case 'url':
      return Link;
    case 'date':
      return Calendar;
    case 'datetime':
      return CalendarClock;
    case 'time':
      return Clock;
    case 'selection':
      return ListChecks;
    case 'checkbox_group':
      return CheckSquare;
    case 'dropdown':
      return ChevronDown;
    case 'boolean':
      return ToggleRight;
    case 'table':
      return Table2;
    case 'checklist':
      return ListChecks;
    case 'file':
    case 'file_attachment':
    case 'attachment':
      return Paperclip;
    case 'header':
      return Heading;
    case 'group':
      return Layers;
    default:
      return FileText;
  }
}

/**
 * Format bytes to readable string (e.g. 5.2 MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Generate a unique ID for new layout items.
 */
export function nextItemId(prefix: 'field' | 'header' | 'group' = 'field'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${prefix}:${ts}_${rand}`;
}

/**
 * Calculate the next vertical y-coordinate for placing a new item at the bottom.
 */
export function nextY(items: EntityFormItem[], cols: number = 12): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((it) => (it.y ?? 0) + (it.h ?? 1)), 0);
}

/**
 * Clean and normalize form layout items.
 */
export function normalizeFormLayout(rawItems: any[], cols: number = 12): EntityFormItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((it) => {
    const isGroup = Boolean(it.isGroup ?? it.is_group ?? it.i?.startsWith('group:'));
    const isHeader = Boolean(it.isHeader ?? it.is_header ?? it.i?.startsWith('header:'));
    return {
      ...it,
      i: String(it.i || nextItemId(isGroup ? 'group' : isHeader ? 'header' : 'field')),
      x: Number.isFinite(Number(it.x)) ? Math.max(0, Math.round(Number(it.x))) : 0,
      y: Number.isFinite(Number(it.y)) ? Math.max(0, Math.round(Number(it.y))) : 0,
      w: Number.isFinite(Number(it.w)) ? Math.max(1, Math.min(cols, Math.round(Number(it.w)))) : (isHeader || isGroup ? cols : 6),
      h: Number.isFinite(Number(it.h)) ? Math.max(1, Math.round(Number(it.h))) : 1,
      isHeader,
      isGroup,
      is_header: undefined,
      is_group: undefined,
      label: it.label ?? (isHeader ? 'Section Header' : isGroup ? 'Form Group' : 'Field'),
      fieldName: it.fieldName ?? it.field_name ?? (isHeader || isGroup ? null : it.i),
      field_name: undefined,
      fieldType: it.fieldType ?? it.field_type ?? null,
      field_type: undefined,
      options: Array.isArray(it.options) && it.options.length > 0
        ? it.options
        : (it.fieldType === 'table' || it.field_type === 'table')
        ? ['Column 1', 'Column 2', 'Column 3']
        : Array.isArray(it.options)
        ? it.options
        : [],
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
      placeholder: it.placeholder ?? null,
      accept: it.accept ?? null,
      maxFileSizeMb: it.maxFileSizeMb ?? it.max_file_size_mb ?? 10,
      max_file_size_mb: undefined,
      allowMultiple: Boolean(it.allowMultiple ?? it.allow_multiple),
      allow_multiple: undefined,
      maxFiles: it.maxFiles ?? it.max_files ?? 5,
      max_files: undefined,
      minRows: it.minRows ?? it.min_rows ?? null,
      min_rows: undefined,
      maxRows: it.maxRows ?? it.max_rows ?? null,
      max_rows: undefined,
      allowAddRows: it.allowAddRows ?? it.allow_add_rows ?? true,
      allow_add_rows: undefined,
      allowDeleteRows: it.allowDeleteRows ?? it.allow_delete_rows ?? true,
      allow_delete_rows: undefined,
      emptyStateText: it.emptyStateText ?? it.empty_state_text ?? null,
      empty_state_text: undefined,
    };
  });
}
