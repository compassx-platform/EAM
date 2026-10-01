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
  label?: string | null;
  button_label?: string | null;
  button_style?: 'primary' | 'secondary' | 'danger' | 'default' | null;
  is_system?: boolean | null;
  description?: string | null;
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

export type WorkflowNodeKind =
  | 'start'
  | 'stop'
  | 'end'
  | 'task'
  | 'condition'
  | 'router'
  | 'gate'
  | 'manual'
  | 'action'
  | 'comm'
  | 'subprocess'
  | 'sub'
  | 'wait'
  | 'interaction'
  | 'state';

export interface WorkflowNodeMeta {
  name: string;
  kind: WorkflowNodeKind;
  position: { x: number; y: number };
  condition_id?: string | null;
  conditions?: string[];
  description?: string;
  role_id?: string | null;
  task_instructions?: string | null;
  time_limit_hours?: number | null;
  entity_status?: string | null;
  action_type?: string | null;
  action_target_field?: string | null;
  action_value?: string | null;
  action_message?: string | null;
  interaction_app?: string | null;
  interaction_tab?: string | null;
  subprocess_id?: string | null;
  subprocess_entity_type?: string | null;
  autocreate_child?: boolean;
  resume_event?: string | null;
  on_child_terminal_states?: string[];
}

export interface WorkflowDefinition {
  entity_type?: string;
  version_label?: string;
  states: string[];
  transitions: WorkflowTransition[];
  nodes?: WorkflowNodeMeta[];
  entry_state?: string;
  /** States from which the workflow can no longer advance (terminal outcomes). */
  terminal_states?: string[];
  /** Data-driven routing fired automatically after a transition commits. */
  auto_transitions?: WorkflowAutoTransition[];
  [key: string]: any;
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

export interface WorkflowTemplateManifest {
  template_id: string;
  schema_version: string;
  name: string;
  description: string;
  category: string;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  entity_type: string;
  version_label: string;
  author: string;
  icon?: string;
  tags?: string[];
  state_count: number;
  transition_count: number;
  condition_count?: number;
  role_count?: number;
}

export interface WorkflowBundle {
  manifest: {
    schema_version: string;
    exported_at?: string;
    name: string;
    description?: string;
    entity_type: string;
    version_label?: string;
    author?: string;
    status?: string;
    state_count?: number;
    transition_count?: number;
    condition_count?: number;
    role_count?: number;
    [key: string]: any;
  };
  workflow: WorkflowDefinition;
  conditions?: ConditionDefinition[];
  roles?: WorkflowRole[];
  entity_fields?: EntityField[];
  form_layout?: any;
  gates?: any[];
}

export interface WorkflowImportPayload {
  bundle: WorkflowBundle | Record<string, any>;
  target_entity_type?: string;
  conflict_strategy?: 'new_draft' | 'overwrite_draft' | 'create_entity';
  import_conditions?: boolean;
  import_roles?: boolean;
  import_fields_and_forms?: boolean;
  activate_immediately?: boolean;
  created_by?: string;
}

export interface WorkflowImportResult {
  success: boolean;
  workflow: Workflow;
  summary: {
    entity_type: string;
    version_label: string;
    status: string;
    states_count: number;
    transitions_count: number;
    conditions_imported: number;
    roles_imported: number;
    fields_imported: number;
    form_layout_imported: boolean;
  };
  warnings?: string[];
}

// ---- Condition registry (centralized, reusable conditions) ------------------

export type ConditionAtom =
  | {
      type: 'workflow_status';
      operator?: string;
      value?: unknown;
    }
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
  workflow_stage?: string;
  stage?: string;
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
  label?: string | null;
  button_label?: string | null;
  button_style?: 'primary' | 'secondary' | 'danger' | 'default' | null;
  is_system?: boolean | null;
  description?: string | null;
  instructions?: string | null;
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

export interface FormTab {
  id: string;
  label: string;
  condition_id?: string | null;
  visibility_condition?: VisibilityCondition | null;
  is_default?: boolean;
}

export interface EntityFormItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tabId?: string | null;
  tab_id?: string | null;
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
  allowDeviceUpload?: boolean;
  allow_device_upload?: boolean;
  allowDocModule?: boolean;
  allow_doc_module?: boolean;
  docFolderFilter?: string | null;
  doc_folder_filter?: string | null;
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

export interface AttachedFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  lastModified?: number;
  docId?: string;
  documentCode?: string;
  urlName?: string;
  volumeId?: string;
  fromDocModule?: boolean;
}

export interface FormVersion {
  id: string;
  entity_type: string;
  version_number: number;
  version_label: string;
  cols: number;
  row_height: number;
  layout: EntityFormItem[];
  tabs?: FormTab[];
  created_by?: string | null;
  created_at?: string | null;
}

export interface EntityForm {
  entity_type: string;
  version_number?: number;
  version_label?: string;
  layout: EntityFormItem[];
  sections: string[];
  tabs?: FormTab[];
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

export interface EntityLifecycleStatus {
  id: string;
  label: string;
  category?: 'draft' | 'pending' | 'active' | 'completed' | 'cancelled' | 'expired' | string;
  color?: string;
  description?: string;
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
  statuses?: EntityLifecycleStatus[];
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
  statuses?: EntityLifecycleStatus[];
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

// ---- Person & Person Group (Enterprise People & Person Groups) -------------

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

// ---- Workflow Roles & Task Assignments (Dynamic Role & WFTASK) --------

export type RoleType = 'PERSON' | 'PERSON_GROUP' | 'DATASET_ATTRIBUTE' | 'EMAIL_ADDRESS';

export type RoleResolutionStrategy = 'broadcast' | 'sequence_first_available' | 'default_member';

export interface WorkflowRole {
  id: string;
  name: string;
  description?: string | null;
  role_type: RoleType;
  person_id?: string | null;
  person_name?: string | null;
  group_name?: string | null;
  group_description?: string | null;
  field_name?: string | null;
  email_address?: string | null;
  resolution_strategy: RoleResolutionStrategy;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RoleResolvedPerson {
  person_id: string;
  display_name: string;
  primary_email?: string | null;
  phone?: string | null;
  site?: string | null;
  status: string;
  is_delegate: boolean;
  original_person_id?: string | null;
}

export interface RoleResolutionResult {
  role_id: string;
  role_name: string;
  role_type: string;
  resolved_persons: RoleResolvedPerson[];
  resolved_emails: string[];
  resolution_strategy?: string;
  trace: string[];
  resolution_summary: string;
}

export interface TaskAssignment {
  id: string;
  entity_type: string;
  entity_id: string;
  workflow_version?: string | null;
  node_id?: string | null;
  state_name: string;
  role_id?: string | null;
  role_name?: string | null;
  role_type?: string | null;
  assigned_person_id?: string | null;
  assigned_person_name?: string | null;
  assigned_group_name?: string | null;
  assigned_email?: string | null;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELEGATED' | 'ESCALATED' | 'REJECTED';
  instructions?: string | null;
  time_limit_hours?: number | null;
  due_date?: string | null;
  resolution_trace?: any;
  escalated_to_person_id?: string | null;
  escalated_to_person_name?: string | null;
  escalation_count?: number;
  escalated_at?: string | null;
  escalation_reason?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
  created_at: string;
}

// ---- In-App Notifications (Notification Center) ----------------------------

export type NotificationCategory = 'task_assigned' | 'workflow_action' | 'system_alert' | 'status_changed';

export interface InAppNotification {
  id: string;
  recipient_id: string;
  sender_id: string;
  title: string;
  message: string;
  category: NotificationCategory | string;
  entity_type?: string | null;
  entity_id?: string | null;
  link_url?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

// ---- Enterprise Escalations (Enterprise Escalation Architecture) -----------

export interface EscalationPointAction {
  action_type: 'TRANSITION_WORKFLOW' | 'CHANGE_STATUS' | 'SEND_NOTIFICATION' | 'REASSIGN_TASK' | 'UPDATE_FIELD' | string;
  event?: string;
  event_type?: string;
  target_status?: string;
  status_value?: string;
  recipient_role?: string;
  target_role_id?: string;
  title?: string;
  message?: string;
  field_name?: string;
  field_value?: any;
  actor_id?: string;
  reason?: string;
}

export type EscalationAction = EscalationPointAction;

export interface EscalationPoint {
  id?: string;
  elapsed_hours: number;
  reference_date_field: string;
  filter_status?: string[];
  condition_id?: string | null;
  actions: EscalationPointAction[];
}

export interface Escalation {
  id: string;
  name: string;
  description?: string;
  entity_type: string;
  status: 'ACTIVE' | 'INACTIVE';
  applies_to: 'entity' | 'task_assignment';
  condition_id?: string | null;
  condition_sql?: string | null;
  schedule_cron?: string;
  check_interval_seconds?: number;
  points: EscalationPoint[];
  is_system?: boolean;
  last_run_at?: string | null;
  last_run_status?: string | null;
  next_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EscalationLog {
  id: string;
  escalation_id: string;
  entity_type?: string;
  entity_id?: string;
  action_type?: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'TRIGGERED' | 'ERROR' | string;
  message?: string;
  details?: Record<string, any>;
  point_index?: number;
  actions_taken?: any[];
  execution_time: string;
}

// ============================================================================
// Enterprise Organization, Company Sets & Companies Architecture
// ============================================================================

export interface CompanySet {
  set_id: string;
  description?: string | null;
  auto_add_companies: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  organizations_count?: number;
  companies_count?: number;
  organizations?: Array<{ org_id: string; name: string; status: string }>;
  company_masters?: CompanyMaster[];
  created_at?: string;
  updated_at?: string;
}

export interface CompanyMaster {
  company: string;
  company_set_id: string;
  name: string;
  type: string; // V, M, C, D, I
  currency_code: string;
  tax_id?: string | null;
  homepage?: string | null;
  phone?: string | null;
  fax?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  active_in_orgs?: CompanyOrg[];
  contacts?: CompanyContact[];
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationPurchasingOptions {
  po_autonumber_prefix?: string;
  receiving_tolerance_percent?: number;
  auto_close_po?: boolean;
  tax_on_freight?: boolean;
}

export interface OrganizationInventoryOptions {
  costing_method?: 'AVERAGE' | 'STANDARD' | 'FIFO' | 'LIFO';
  allow_negative_balance?: boolean;
  abc_break_a?: number;
  abc_break_b?: number;
}

export interface OrganizationWorkOrderOptions {
  wo_autonumber_prefix?: string;
  allow_history_editing?: boolean;
  require_actual_dates_on_completion?: boolean;
  track_asset_downtime?: boolean;
}

export interface Organization {
  org_id: string;
  name: string;
  description?: string | null;
  company_set_id: string;
  item_set_id: string;
  base_currency_1: string;
  base_currency_2?: string | null;
  clearing_account?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  purchasing_options: OrganizationPurchasingOptions;
  inventory_options: OrganizationInventoryOptions;
  work_order_options: OrganizationWorkOrderOptions;
  sites_count?: number;
  companies_count?: number;
  company_set?: CompanySet;
  sites?: Site[];
  companies?: CompanyOrg[];
  created_at?: string;
  updated_at?: string;
}

export interface Site {
  site_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string;
}

export interface CompanyOrg {
  org_id: string;
  company: string;
  name: string;
  type: string;
  currency_code: string;
  payment_terms: string;
  freight_terms: string;
  fob: string;
  customer_account_num?: string | null;
  tax_exempt: boolean;
  tax_code?: string | null;
  gl_account?: string | null;
  disabled: boolean; // Enterprise local disablement flag
  remit_to_address?: string | null;
  notes?: string | null;
  master_info?: CompanyMaster;
  contacts?: CompanyContact[];
  created_at?: string;
  updated_at?: string;
}

export interface CompanyContact {
  id: string;
  company: string;
  company_set_id: string;
  org_id?: string | null;
  contact_name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary: boolean;
  created_at?: string;
}

export type LocationType = 'OPERATING' | 'STOREROOM' | 'SALVAGE' | 'HOLDING' | 'VENDOR' | 'REPAIR';
export type LocationStatus = 'OPERATING' | 'NOT_READY' | 'DECOMMISSIONED';

export interface Location {
  location_id: string;
  site_id: string;
  org_id: string;
  parent_location_id?: string | null;
  description?: string | null;
  type: LocationType;
  status: LocationStatus;
  gl_account?: string | null;
  classstructure_id?: string | null;
  classification_path?: string | null;
  installed_assets?: Asset[];
  created_at?: string;
  updated_at?: string;
}

export type AssetStatus = 'OPERATING' | 'NOT_READY' | 'IN_REPAIR' | 'DECOMMISSIONED';

export interface Asset {
  asset_id: string;
  site_id: string;
  org_id: string;
  location_id?: string | null;
  parent_asset_id?: string | null;
  classstructure_id?: string | null;
  classification_path?: string | null;
  name: string;
  description?: string | null;
  item_num?: string | null;
  serial_num?: string | null;
  status: AssetStatus;
  vendor?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  purchase_cost: number;
  install_date?: string | null;
  priority: number;
  child_assets?: Asset[];
  created_at?: string;
  updated_at?: string;
}

export interface DrilldownAsset extends Asset {
  children?: DrilldownAsset[];
}

export interface DrilldownLocation extends Location {
  children_locations?: DrilldownLocation[];
  assets?: DrilldownAsset[];
}

export interface DrilldownSite {
  site_id: string;
  site_name: string;
  org_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  locations_tree: DrilldownLocation[];
  unassigned_assets: DrilldownAsset[];
  total_locations: number;
  total_assets: number;
}

// ---- Classifications & Specifications ---------------------------------------

export type SpecDataType = 'ALN' | 'NUMERIC' | 'TABLE' | 'DATE' | 'YORN';

export interface AssetAttribute {
  attribute_id: string;
  description: string;
  data_type: SpecDataType;
  unit_of_measure?: string | null;
  domain_id?: string | null;
  domain_values?: string[] | null;
  org_id?: string | null;
  site_id?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  usage_count?: number;
  used_in_classifications?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ClassSpec {
  id: string;
  classstructure_id: string;
  attribute_id: string;
  section?: string | null;
  description: string;
  data_type: SpecDataType;
  unit_of_measure?: string | null;
  domain_id?: string | null;
  domain_values?: string[] | null;
  default_value?: string | null;
  mandatory: boolean;
  apply_down_hierarchy?: boolean;
  inherited_from?: string | null;
  inherited_from_path?: string | null;
  display_sequence: number;
  created_at?: string;
  updated_at?: string;
}

export interface Classification {
  classstructure_id: string;
  classification_id: string;
  parent_classstructure_id?: string | null;
  description: string;
  hierarchy_path: string;
  use_with: string[];
  org_id?: string | null;
  site_id?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  attributes_count?: number;
  attributes?: ClassSpec[];
  all_attributes?: ClassSpec[];
  created_at?: string;
  updated_at?: string;
}

export interface ClassificationTreeNode extends Classification {
  children?: ClassificationTreeNode[];
}

export interface SpecValueItem {
  attribute_id: string;
  section?: string | null;
  description?: string;
  data_type?: string;
  unit_of_measure?: string | null;
  domain_values?: string[];
  mandatory?: boolean;
  inherited_from?: string | null;
  inherited_from_path?: string | null;
  aln_value?: string | null;
  num_value?: number | null;
  date_value?: string | null;
  spec_id?: string | null;
}

export interface InstanceSpecificationResponse {
  asset_id?: string;
  location_id?: string;
  site_id: string;
  classstructure_id?: string | null;
  classification_path?: string | null;
  specifications: SpecValueItem[];
}

export interface AttributeInstanceAssetMatch {
  site_id: string;
  asset_id: string;
  description?: string;
  status: string;
  classstructure_id?: string | null;
  classification_path?: string | null;
  location_id?: string | null;
  section?: string | null;
  aln_value?: string | null;
  num_value?: number | null;
  date_value?: string | null;
  unit_of_measure?: string | null;
}

export interface AttributeInstanceLocationMatch {
  site_id: string;
  location_id: string;
  description?: string;
  status: string;
  type?: string;
  classstructure_id?: string | null;
  classification_path?: string | null;
  parent_location_id?: string | null;
  section?: string | null;
  aln_value?: string | null;
  num_value?: number | null;
  date_value?: string | null;
  unit_of_measure?: string | null;
}

export interface AttributeInstancesSearchResult {
  attribute_id: string;
  attribute?: AssetAttribute | null;
  assets: AttributeInstanceAssetMatch[];
  locations: AttributeInstanceLocationMatch[];
  total_count: number;
}

// ============================================================================
// Meters & Condition Monitoring
// ============================================================================

export type MeterType = 'CONTINUOUS' | 'GAUGE' | 'CHARACTERISTIC';
export type MeterReadingType = 'ACTUAL' | 'DELTA';

export interface Meter {
  meter_id: string;
  description: string;
  meter_type: MeterType;
  reading_type: MeterReadingType;
  unit_of_measure?: string | null;
  domain_id?: string | null;
  domain_values?: string[] | null;
  org_id?: string | null;
  site_id?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  asset_usage_count?: number;
  location_usage_count?: number;
  group_usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MeterInGroup {
  id: string;
  group_id: string;
  meter_id: string;
  sequence: number;
  default_rollover?: number | null;
  default_avg_method?: string;
  default_avg_rate?: number | null;
  description?: string;
  meter_type?: MeterType;
  unit_of_measure?: string | null;
  domain_values?: string[];
}

export interface MeterGroup {
  group_id: string;
  description: string;
  org_id?: string | null;
  site_id?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  meters_count?: number;
  meters?: MeterInGroup[];
  created_at?: string;
  updated_at?: string;
}

export interface AssetMeter {
  id: string;
  site_id: string;
  asset_id: string;
  meter_id: string;
  description?: string;
  meter_type: MeterType;
  reading_type: MeterReadingType;
  unit_of_measure?: string | null;
  domain_values?: string[];
  last_reading?: number | null;
  last_reading_aln?: string | null;
  last_reading_date?: string | null;
  rollover_point?: number | null;
  avg_units_per_day: number;
  avg_calc_method: string;
  life_to_date: number;
  since_last_overhaul: number;
  since_last_repair: number;
  active: boolean;
  readings_count?: number;
  updated_at?: string;
}

export interface LocationMeter {
  id: string;
  site_id: string;
  location_id: string;
  meter_id: string;
  description?: string;
  meter_type: MeterType;
  reading_type: MeterReadingType;
  unit_of_measure?: string | null;
  domain_values?: string[];
  last_reading?: number | null;
  last_reading_aln?: string | null;
  last_reading_date?: string | null;
  rollover_point?: number | null;
  avg_units_per_day: number;
  avg_calc_method: string;
  life_to_date: number;
  active: boolean;
  readings_count?: number;
  updated_at?: string;
}

export interface MeterReading {
  id: string;
  site_id: string;
  asset_id?: string | null;
  location_id?: string | null;
  meter_id: string;
  reading_date: string;
  reading_value?: number | null;
  reading_aln?: string | null;
  delta_value?: number | null;
  is_rollover: boolean;
  inspector_id?: string | null;
  entered_by?: string | null;
  workorder_id?: string | null;
  remarks?: string | null;
  created_at?: string;
}

export interface MeasurePoint {
  point_id: string;
  description: string;
  site_id: string;
  asset_id?: string | null;
  location_id?: string | null;
  meter_id: string;
  meter_type?: MeterType;
  unit_of_measure?: string | null;
  upper_action_limit?: number | null;
  lower_action_limit?: number | null;
  upper_warning_limit?: number | null;
  lower_warning_limit?: number | null;
  action_aln_value?: string | null;
  action_description?: string | null;
  action_job_plan?: string | null;
  action_priority: number;
  status: 'ACTIVE' | 'INACTIVE';
  last_breach_date?: string | null;
  last_breach_value?: string | null;
  last_breach_type?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MeterReadingResponse {
  reading: MeterReading;
  asset_meter?: AssetMeter;
  location_meter?: LocationMeter;
  breach_alert?: {
    point_id: string;
    breach_type: string;
    action_description?: string;
    action_job_plan?: string;
    action_priority?: number;
  } | null;
}

// ============================================================================
// Document Management (Maximo Doclinks & CompassX Volumes)
// ============================================================================

export interface DocFolder {
  id: string;
  folder_name: string;
  parent_id?: string | null;
  description?: string | null;
  volume_id?: string | null;
  default_sub_path: string;
  allowed_extensions?: string[];
  max_file_size_mb: number;
  is_active: boolean;
  default_print_thru_vendor: boolean;
  document_count?: number;
  subfolder_count?: number;
  subfolders?: DocFolder[];
  created_at?: string;
  updated_at?: string;
}

export interface DocFolderPathItem {
  id: string;
  folder_name: string;
}

export interface DocLink {
  id: string;
  doc_info_id: string;
  owner_table: string;
  owner_id: string;
  folder_id?: string | null;
  get_latest_version: boolean;
  print_thru_vendor: boolean;
  copy_to_target: boolean;
  created_by?: string | null;
  created_at?: string;
  document?: DocInfo | null;
}

export interface DocInfo {
  id: string;
  document_code: string;
  title: string;
  description?: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  url_name: string;
  url_type: 'FILE' | 'URL';
  file_name: string;
  file_size_bytes: number;
  content_type: string;
  volume_id?: string | null;
  sub_path?: string | null;
  version: string;
  sha256_hash?: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DEPRECATED';
  tags: string[];
  custom_metadata: Record<string, any>;
  links_count?: number;
  created_by?: string | null;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string;
  links?: DocLink[];
}

export interface VolumeRead {
  id: string;
  name: string;
  description?: string;
  catalog_name?: string;
  schema_name?: string;
  created_at?: string;
}

export interface VolumeFileInfo {
  file_path: string;
  file_name: string;
  size_bytes: number;
  content_type: string;
  last_modified: string;
}

export interface PresignedUrlResponse {
  url: string;
  expires_in_seconds: number;
  is_direct_url?: boolean;
}