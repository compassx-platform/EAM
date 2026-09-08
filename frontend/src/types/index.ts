export type EntityType = 'workorder' | 'permit' | string;

export interface EntityField {
  entity_type: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'entity_reference';
  required: boolean;
  select_options?: string[];
  reference_entity_type?: string | null;
  created_at?: string;
}

export interface GateParamDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'field_select';
  field_type?: string;
  options?: string[];
  required: boolean;
  default?: any;
  description?: string;
}

export interface GateTypeCatalogItem {
  gate_type: string;
  name: string;
  description: string;
  parameters: GateParamDefinition[];
}

export interface GateInstance {
  id: string;
  entity_type: string;
  gate_type: string;
  label: string;
  params: Record<string, any>;
  failure_policy: 'block' | 'allow';
}

export interface WorkflowTransition {
  from: string;
  event: string;
  to: string;
  gates: string[]; // Gate instance IDs
}

export interface WorkflowDefinitionData {
  entity_type?: string;
  version_label?: string;
  states: string[];
  transitions: WorkflowTransition[];
}

export interface WorkflowDefinition {
  id: string;
  entity_type: string;
  version_label: string;
  status: 'draft' | 'published' | 'deprecated';
  definition: WorkflowDefinitionData;
  created_by?: string;
  created_at: string;
  published_at?: string | null;
}

export interface EntityInstance {
  id: string;
  entity_type: string;
  status: string;
  workflow_version: string;
  last_event_id?: string;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EntityEvent {
  event_id: string;
  entity_id: string;
  event_type: string;
  actor_id: string;
  actor_type: 'human' | 'system';
  transaction_time: string;
  from_state?: string | null;
  to_state: string;
  payload: Record<string, any>;
}

export interface EntityDetailResponse {
  entity: EntityInstance;
  events: EntityEvent[];
}

export interface ValidTransition {
  event_type: string;
  to_state: string;
  gates: string[];
}

export interface ValidTransitionsResponse {
  entity_id: string;
  entity_type: string;
  current_status: string;
  workflow_version: string;
  valid_transitions: ValidTransition[];
}

export interface GateTraceItem {
  gate_id: string;
  gate_type: string;
  label: string;
  passed: boolean;
  reason: string;
  failure_policy: 'block' | 'allow';
  effective_pass: boolean;
}

export interface SimulateResponse {
  accepted: boolean;
  from_state?: string;
  to_state?: string;
  event_type: string;
  workflow_version?: string;
  gate_failed?: string | null;
  reason?: string | null;
  gate_trace: GateTraceItem[];
  error?: string;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
  roles: string[];
}

export interface AppRole {
  id: string;
  name: string;
}

export interface SystemStats {
  workorders: {
    total: number;
    in_progress: number;
  };
  permits: {
    total: number;
    active: number;
  };
  total_events: number;
  workflows_count: number;
  gates_count: number;
  fields_count: number;
  users_count: number;
}
