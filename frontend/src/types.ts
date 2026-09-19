export interface WorkflowAction {
  type: string;
  params: Record<string, unknown>;
}

export interface WorkflowChoice {
  to: string;
  /** Condition IDs that must all pass for this branch to be taken ([] = unconditional default). */
  when?: string[];
  on_after?: WorkflowAction[];
}

export interface WorkflowTransition {
  from: string;
  event: string;
  /** Absent/null for decision nodes that use `choices`. */
  to?: string | null;
  /** Legacy alias for `conditions` (read for backward compatibility with pre-registry drafts). */
  gates?: string[];
  /** Reusable ConditionDefinition IDs that must all pass for this transition ([] = unguarded). */
  conditions?: string[];
  /** Conditional routing branches; the first whose `when` passes wins. */
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
}

export interface WorkflowAutoTransition {
  from: string;
  event: string;
  /** Condition IDs that gate the automatic routing ([] = always route). */
  when?: string[];
}

export interface WorkflowNodeMeta {
  name: string;
  kind: 'start' | 'state' | 'task' | 'gate' | 'router' | 'end' | 'manual' | 'wait' | 'sub' | 'comm';
  position: { x: number; y: number };
  condition_id?: string | null;
  conditions?: string[];
  description?: string;
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

// ---- Condition registry (centralized, reusable conditions) ------------------

export type ConditionAtom =
  | {
      type: 'attribute';
      field: string;
      operator: string;
      value?: unknown;
      case_sensitive?: boolean;
    }
  | { type: 'role'; role: string }
  | { type: 'field_not_empty'; field: string }
  | { type: 'date'; field: string; operator: string; value?: unknown }
  | {
      type: 'related';
      relationship_field: string;
      target_entity_type?: string;
      required_status?: string;
      target_field?: string;
      operator?: string;
      value?: unknown;
    }
  | { type: 'expression'; expression: string; operator?: string; value?: unknown }
  | { type: 'person_group'; relationship_field: string; group: string };

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  negate?: boolean;
  rules: Array<ConditionAtom | { group: ConditionGroup }>;
}

export type ConditionRuleNode = ConditionAtom | { group: ConditionGroup };

export interface ConditionDefinition {
  id: string;
  entity_type: string;
  label: string;
  description?: string | null;
  type: 'structured' | 'script';
  /** Live rule-tree AST — consumers always read this, so edits propagate everywhere. */
  definition: ConditionGroup;
  current_version: number;
  failure_policy: 'block' | 'allow';
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ConditionVersion {
  id: string;
  condition_id: string;
  version: number;
  label: string;
  definition: ConditionGroup;
  failure_policy: 'block' | 'allow';
  created_by?: string | null;
  created_at?: string | null;
}

export interface ConditionAtomType {
  type: string;
  name: string;
  description: string;
}

export interface ConditionOperatorsCatalog {
  string: string[];
  number: string[];
  boolean: string[];
  date: string[];
  select: string[];
}

export interface ConditionTypeInfo {
  atoms: ConditionAtomType[];
  operators: ConditionOperatorsCatalog;
}

export interface ConditionTraceItem {
  condition_id: string;
  label: string;
  passed: boolean;
  reason: string;
  failure_policy: string;
  effective_pass: boolean;
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
  field_type: EntityFieldType;
  /** Human-readable label (used by the entity designer + auto-generated forms). */
  label?: string | null;
  required: boolean;
  select_options: string[];
  /** Central published list referenced for a select field's options. */
  option_list_key?: string | null;
  reference_entity_type?: string | null;
  /** Active references (in forms, workflows, conditions) blocking field deletion */
  blockers?: string[];
}

/** Registry field types — double as the form widget catalog. `select` renders as a dropdown. */
export type EntityFieldType =
  | 'text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'url'
  | 'number'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'select'
  | 'selection'
  | 'checkbox_group'
  | 'entity_reference'
  | 'table'
  | 'checklist'
  | 'file';

/** Field schema submitted when creating an entity via the wizard. */
export interface EntityFieldInput {
  field_name: string;
  field_type: EntityFieldType;
  label?: string | null;
  required?: boolean;
  select_options?: string[];
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
  conditions: string[];
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
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
  /** Optional reference to a centralized ConditionDefinition (reusable condition module). */
  condition_id?: string | null;
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
  /** Dynamic Table configuration */
  minRows?: number | null;
  min_rows?: number | null;
  maxRows?: number | null;
  max_rows?: number | null;
  allowAddRows?: boolean;
  allow_add_rows?: boolean;
  allowDeleteRows?: boolean;
  allow_delete_rows?: boolean;
  emptyStateText?: string | null;
  empty_state_text?: string | null;
}

export interface FormVersion {
  id: string;
  entity_type: string;
  version_number: number;
  version_label: string;
  cols: number;
  row_height: number;
  layout: EntityFormItem[];
  created_by?: string | null;
  created_at?: string | null;
}

export interface EntityForm {
  entity_type: string;
  version_number?: number;
  version_label?: string;
  layout: EntityFormItem[];
  sections: string[];
  cols: number;
  row_height: number;
  updated_at?: string | null;
  /**
   * Stages of the latest published workflow for this entity type. Available to
   * the form builder so condition rules can bind to the workflow stage.
   */
  workflow_states?: string[];
  /** The workflow stage a new record starts in (used by the create form). */
  initial_state?: string | null;
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

export interface EntityTypeVersion {
  id: string;
  entity_name: string;
  version_number: number;
  version_label: string;
  display_name: string;
  description?: string | null;
  icon?: string | null;
  fields: EntityFieldInput[];
  created_by?: string | null;
  created_at?: string | null;
}

export interface EntityTypeDefinition {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  is_system: boolean;
  version_number?: number;
  version_label?: string;
  field_count?: number;
  workflow_count?: number;
  condition_count?: number;
  form_count?: number;
  record_count?: number;
  has_published_workflow?: boolean;
  has_form?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

// ---- Person & Person Group (IBM Maximo People & Person Groups) -------------

export interface Person {
  person_id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email?: string | null;
  phone?: string | null;
  site?: string | null;
  supervisor_id?: string | null;
  primary_calendar?: string | null;
  primary_shift?: string | null;
  workflow_delegate_id?: string | null;
  delegate_from?: string | null;
  delegate_to?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  user_id?: string | null;
  linked_roles?: string[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PersonGroupMember {
  group_name: string;
  person_id: string;
  sequence: number;
  is_group_default: boolean;
  is_org_default: boolean;
  is_site_default: boolean;
  display_name?: string | null;
  status?: string | null;
}

export interface PersonGroup {
  group_name: string;
  description?: string | null;
  is_crew_work_group: boolean;
  use_for_org?: string | null;
  use_for_site?: string | null;
  member_count: number;
  members?: PersonGroupMember[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PersonAvailability {
  id: string;
  person_id: string;
  reason: 'Holiday' | 'Sick' | 'Overtime' | 'Other';
  available_from: string;
  available_to: string;
  created_at?: string | null;
}

export interface PersonAudit {
  id: string;
  person_id: string;
  changed_by: string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  occurred_at: string;
}

export interface PersonRelated {
  person_id: string;
  workorders: Array<{ id: string; status: string; title: string; open: boolean }>;
  permits: Array<{ id: string; status: string; title: string; open: boolean }>;
  supervises: string[];
  groups: string[];
}