export interface WorkflowAction {
  type: string;
  params: Record<string, unknown>;
}

export interface WorkflowChoice {
  to: string;
  /** Gate IDs that must all pass for this branch to be taken ([] = unconditional default). */
  when?: string[];
  on_after?: WorkflowAction[];
}

export interface WorkflowTransition {
  from: string;
  event: string;
  /** Absent/null for decision nodes that use `choices`. */
  to?: string | null;
  gates?: string[];
  /** Conditional routing branches; the first whose `when` passes wins. */
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
}

export interface WorkflowAutoTransition {
  from: string;
  event: string;
  /** Gate IDs that gate the automatic routing ([] = always route). */
  when?: string[];
}

export interface WorkflowNodeMeta {
  name: string;
  kind: 'start' | 'state' | 'task' | 'gate' | 'end';
  position: { x: number; y: number };
}

export interface WorkflowDefinition {
  entity_type: string;
  version_label: string;
  states: string[];
  transitions: WorkflowTransition[];
  nodes?: WorkflowNodeMeta[];
  /** States from which the workflow can no longer advance (terminal outcomes). */
  terminal_states?: string[];
  /** Data-driven routing fired automatically after a transition commits. */
  auto_transitions?: WorkflowAutoTransition[];
}

export interface Workflow {
  id: string;
  entity_type: string;
  version_label: string;
  status: 'draft' | 'published' | 'deprecated';
  definition: WorkflowDefinition;
  created_by?: string | null;
  created_at?: string | null;
  published_at?: string | null;
}

export interface GateInstance {
  id: string;
  entity_type: string;
  gate_type: string;
  label: string;
  params: Record<string, unknown>;
  failure_policy: 'block' | 'allow';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type WorkflowStatus = Workflow['status'];

export type GenericFieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'datetime'
  | 'time'
  | 'selection'
  | 'checkbox_group'
  | 'dropdown'
  | 'boolean'
  | 'table'
  | 'checklist'
  | 'file';

export interface EntityField {
  entity_type: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'entity_reference';
  required: boolean;
  select_options: string[];
  /** Central published list referenced for a select field's options. */
  option_list_key?: string | null;
  reference_entity_type?: string | null;
}

export interface EntityRecord {
  id: string;
  entity_type: string;
  status: string;
  workflow_version: string;
  last_event_id: string;
  custom_fields: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EntityEvent {
  event_id: string;
  entity_id: string;
  event_type: string;
  actor_id?: string | null;
  actor_type?: string | null;
  transaction_time?: string | null;
  from_state?: string | null;
  to_state?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface ValidTransition {
  event_type: string;
  to_state: string;
  gates: string[];
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
}

export interface GateTraceItem {
  gate_id: string;
  gate_type: string;
  label: string;
  passed: boolean;
  reason: string;
  failure_policy: string;
  effective_pass: boolean;
}

export type ConditionAction = 'hide' | 'show' | 'readonly' | 'editable';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export interface VisibilityCondition {
  action: ConditionAction; // 'hide' | 'show' | 'readonly' | 'editable'
  matchType?: 'all' | 'any'; // 'all' (AND) or 'any' (OR), default 'all'
  rules?: ConditionRule[];
  /** Legacy single-rule backward compatibility */
  field?: string;
  operator?: ConditionOperator;
  value?: string;
}

export interface EntityFormItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isHeader?: boolean;
  is_header?: boolean;
  isGroup?: boolean;
  is_group?: boolean;
  label?: string | null;
  /** Storage key for submitted custom fields (generic form fields). */
  fieldName?: string | null;
  field_name?: string | null;
  /** Generic field type — present when the item carries its own definition. */
  fieldType?: GenericFieldType | null;
  field_type?: GenericFieldType | null;
  required?: boolean;
  options?: string[];
  /** Central published list referenced for options / checklist items. */
  optionsList?: string | null;
  options_list?: string | null;
  /** Options or checklist items hidden on this specific form. */
  hiddenOptions?: string[];
  hidden_options?: string[];
  /** Group membership for grouped fields. */
  groupId?: string | null;
  group_id?: string | null;
  groupTitle?: string | null;
  group_title?: string | null;
  /** Conditional visibility rule based on another field's state. */
  visibilityCondition?: VisibilityCondition | null;
  visibility_condition?: VisibilityCondition | null;
  placeholder?: string | null;
  /** File attachment configuration */
  accept?: string | null;
  maxFileSizeMb?: number | null;
  max_file_size_mb?: number | null;
  allowMultiple?: boolean;
  allow_multiple?: boolean;
  maxFiles?: number | null;
  max_files?: number | null;
}

export interface EntityForm {
  entity_type: string;
  layout: EntityFormItem[];
  sections: string[];
  cols: number;
  row_height: number;
  updated_at?: string | null;
}

export type ListKind = 'options' | 'checklist';

export interface OptionListSummary {
  list_key: string;
  kind: ListKind;
  description: string | null;
  item_count: number;
  status: 'draft' | 'published' | 'deprecated';
  published_version: string | null;
  draft_item_count: number;
  has_draft: boolean;
  created_at?: string | null;
  published_at?: string | null;
}

export interface ListDefinition {
  id: string;
  list_key: string;
  kind: ListKind;
  description: string | null;
  version_label: string;
  status: 'draft' | 'published' | 'deprecated';
  /** Options kind: string[]; checklist kind: {label, required, assigned_role?}[] */
  items: Array<string | ChecklistItem>;
  created_at?: string | null;
  published_at?: string | null;
}

export interface ChecklistItem {
  label: string;
  required: boolean;
  assigned_role?: string | null;
}

export interface ResolvedList {
  list_key: string;
  kind: ListKind;
  version_label: string;
  items: Array<string | ChecklistItem>;
}

export interface ListUsage {
  list_key: string;
  fields: Array<{ entity_type: string; field_name: string }>;
  form_items: Array<{ entity_type: string; item_id: string }>;
  field_count: number;
  form_item_count: number;
}