export interface WorkflowTransition {
  from: string;
  event: string;
  to: string;
  gates: string[];
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

export type GenericFieldType = 'text' | 'long_text' | 'selection' | 'dropdown';

export interface EntityField {
  entity_type: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'entity_reference';
  required: boolean;
  select_options: string[];
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

export interface EntityFormItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isHeader?: boolean;
  label?: string | null;
  /** Storage key for submitted custom fields (generic form fields). */
  fieldName?: string | null;
  /** Generic field type — present when the item carries its own definition. */
  fieldType?: GenericFieldType | null;
  required?: boolean;
  options?: string[];
  placeholder?: string | null;
}

export interface EntityForm {
  entity_type: string;
  layout: EntityFormItem[];
  sections: string[];
  cols: number;
  row_height: number;
  updated_at?: string | null;
}