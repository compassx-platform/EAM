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
import type { EntityFormItem, GenericFieldType } from '../../types';

export interface FieldTypeDef {
  type: GenericFieldType;
  label: string;
  hint: string;
  category: 'basic' | 'choice' | 'date' | 'advanced';
  defaultFieldName: string;
  defaultOptions: string[];
  defaultHeight: number;
  defaultWidth: number;
}

export const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  // Basic input
  {
    type: 'text',
    label: 'Text',
    hint: 'Single-line text input',
    category: 'basic',
    defaultFieldName: 'text_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'long_text',
    label: 'Long text',
    hint: 'Multi-line text area for notes or descriptions',
    category: 'basic',
    defaultFieldName: 'long_text_field',
    defaultOptions: [],
    defaultHeight: 3,
    defaultWidth: 12,
  },
  {
    type: 'number',
    label: 'Number',
    hint: 'Numeric integer or decimal value',
    category: 'basic',
    defaultFieldName: 'number_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'email',
    label: 'Email',
    hint: 'Validated email address',
    category: 'basic',
    defaultFieldName: 'email_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'phone',
    label: 'Phone',
    hint: 'Telephone number input',
    category: 'basic',
    defaultFieldName: 'phone_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'url',
    label: 'URL',
    hint: 'Web address or hyperlink',
    category: 'basic',
    defaultFieldName: 'url_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },

  // Dates & Times
  {
    type: 'date',
    label: 'Date',
    hint: 'Calendar date picker',
    category: 'date',
    defaultFieldName: 'date_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'datetime',
    label: 'Date & time',
    hint: 'Timestamp with date and time',
    category: 'date',
    defaultFieldName: 'datetime_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'time',
    label: 'Time',
    hint: 'Time of day selector',
    category: 'date',
    defaultFieldName: 'time_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },

  // Choices & Selection
  {
    type: 'dropdown',
    label: 'Dropdown',
    hint: 'Select one option from a dropdown menu',
    category: 'choice',
    defaultFieldName: 'dropdown_field',
    defaultOptions: ['Option 1', 'Option 2'],
    defaultHeight: 1,
    defaultWidth: 6,
  },
  {
    type: 'selection',
    label: 'Radio choices',
    hint: 'Radio buttons where user selects one option',
    category: 'choice',
    defaultFieldName: 'selection_field',
    defaultOptions: ['Option 1', 'Option 2'],
    defaultHeight: 2,
    defaultWidth: 6,
  },
  {
    type: 'checkbox_group',
    label: 'Checkbox group',
    hint: 'Select multiple options simultaneously',
    category: 'choice',
    defaultFieldName: 'checkbox_field',
    defaultOptions: ['Option 1', 'Option 2'],
    defaultHeight: 2,
    defaultWidth: 6,
  },
  {
    type: 'boolean',
    label: 'Yes / No',
    hint: 'Binary toggle checkbox',
    category: 'choice',
    defaultFieldName: 'boolean_field',
    defaultOptions: [],
    defaultHeight: 1,
    defaultWidth: 6,
  },

  // Advanced & Structured
  {
    type: 'table',
    label: 'Table grid',
    hint: 'Dynamic multi-column row table filled at runtime',
    category: 'advanced',
    defaultFieldName: 'table_field',
    defaultOptions: ['Column 1', 'Column 2'],
    defaultHeight: 3,
    defaultWidth: 12,
  },
  {
    type: 'checklist',
    label: 'Checklist',
    hint: 'Operational checklist from a published Central List',
    category: 'advanced',
    defaultFieldName: 'checklist_field',
    defaultOptions: [],
    defaultHeight: 4,
    defaultWidth: 12,
  },
  {
    type: 'file',
    label: 'Attachment',
    hint: 'Document or media file upload dropzone',
    category: 'advanced',
    defaultFieldName: 'attachment_field',
    defaultOptions: [],
    defaultHeight: 2,
    defaultWidth: 12,
  },
];

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
      options: Array.isArray(it.options) ? it.options : [],
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
    };
  });
}
