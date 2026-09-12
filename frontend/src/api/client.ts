import type {
  Workflow,
  WorkflowDefinition,
  GateInstance,
  ValidationResult,
  EntityField,
  EntityRecord,
  EntityEvent,
  ValidTransition,
  GateTraceItem,
  EntityForm,
  EntityFormItem,
} from '../types';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const detail =
      body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : body;
    const message =
      typeof detail === 'string' ? detail : detail && typeof detail === 'object' && 'message' in detail
        ? String((detail as { message: unknown }).message)
        : JSON.stringify(detail || res.statusText);
    const err = new Error(message) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = detail ?? body;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listWorkflows(entityType?: string): Promise<Workflow[]> {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return request<Workflow[]>(`/workflows${q}`);
  },

  getWorkflow(id: string): Promise<Workflow> {
    return request<Workflow>(`/workflows/${encodeURIComponent(id)}`);
  },

  saveDraft(input: {
    id?: string;
    entity_type: string;
    version_label: string;
    definition: WorkflowDefinition;
  }): Promise<Workflow> {
    return request<Workflow>('/workflows/draft', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  validateWorkflow(id: string): Promise<ValidationResult> {
    return request<ValidationResult>(`/workflows/${encodeURIComponent(id)}/validate`, {
      method: 'POST',
    });
  },

  publishWorkflow(id: string): Promise<{ published: boolean; workflow: Workflow; warnings: string[] }> {
    return request(`/workflows/${encodeURIComponent(id)}/publish`, { method: 'POST' });
  },

  deleteWorkflow(id: string): Promise<{ deleted: boolean; id: string }> {
    return request(`/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  listGates(entityType?: string): Promise<GateInstance[]> {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return request<GateInstance[]>(`/gates${q}`);
  },

  createGate(input: {
    entity_type: string;
    gate_type: string;
    label: string;
    params?: Record<string, unknown>;
  }): Promise<GateInstance> {
    return request<GateInstance>('/gates', { method: 'POST', body: JSON.stringify(input) });
  },

  listGateTypes(): Promise<Array<{ gate_type: string; name: string; description: string }>> {
    return request('/gates/types');
  },

  listActionTypes(): Promise<
    Array<{ type: string; name: string; description: string }>
  > {
    return request('/actions/types');
  },

  listFields(entityType?: string): Promise<EntityField[]> {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return request<EntityField[]>(`/fields${q}`);
  },

  saveField(input: {
    entity_type: string;
    field_name: string;
    field_type: string;
    required?: boolean;
    select_options?: string[];
    reference_entity_type?: string | null;
  }): Promise<EntityField> {
    return request<EntityField>('/fields', { method: 'POST', body: JSON.stringify(input) });
  },

  deleteField(entityType: string, fieldName: string): Promise<{ deleted: boolean; entity_type: string; field_name: string }> {
    return request(`/fields/${encodeURIComponent(entityType)}/${encodeURIComponent(fieldName)}`, { method: 'DELETE' });
  },

  listForms(): Promise<Array<{ entity_type: string; cols: number; row_height: number; item_count: number; updated_at?: string | null }>> {
    return request('/forms');
  },

  getForm(entityType: string): Promise<EntityForm & { fields: EntityField[] }> {
    return request(`/forms/${encodeURIComponent(entityType)}`);
  },

  saveForm(input: {
    entity_type: string;
    layout: EntityFormItem[];
    cols?: number;
    row_height?: number;
  }): Promise<EntityForm> {
    return request<EntityForm>('/forms', { method: 'POST', body: JSON.stringify(input) });
  },

  deleteForm(entityType: string): Promise<{ deleted: boolean; entity_type: string }> {
    return request(`/forms/${encodeURIComponent(entityType)}`, { method: 'DELETE' });
  },

  listEntities(
    entityType: string,
    opts?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ entity_type: string; total: number; limit: number; offset: number; items: EntityRecord[] }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/${encodeURIComponent(entityType)}${q}`);
  },

  createEntity(
    entityType: string,
    input: { custom_fields?: Record<string, unknown>; payload?: Record<string, unknown>; workflow_version?: string }
  ): Promise<{ accepted: boolean; entity_id: string; status: string; workflow_version: string; event_id: string; entity: EntityRecord }> {
    return request(`/${encodeURIComponent(entityType)}/create`, { method: 'POST', body: JSON.stringify(input) });
  },

  getEntity(entityType: string, id: string): Promise<{ entity: EntityRecord; events: EntityEvent[] }> {
    return request(`/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`);
  },

  listValidTransitions(entityType: string, id: string): Promise<{
    entity_id: string;
    entity_type: string;
    current_status: string;
    workflow_version: string;
    valid_transitions: ValidTransition[];
    auto_transitions_pending: Array<{ from: string; event: string; when: string[] }>;
  }> {
    return request(`/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/valid-transitions`);
  },

  transition(
    entityType: string,
    input: {
      entity_id: string;
      event_type: string;
      actor_id?: string;
      actor_type?: string;
      actor_roles?: string[];
      payload?: Record<string, unknown>;
      custom_fields_delta?: Record<string, unknown>;
    }
  ): Promise<{
    accepted: boolean;
    entity_id: string;
    from_state: string;
    new_status: string;
    event_id: string;
    gate_trace: GateTraceItem[];
    routing?: { choice_index: number; choices: Array<{ choice_index: number; to: string; when: string[]; matched: boolean }> };
    side_effects?: Array<{ type: string; success: boolean; [k: string]: unknown }>;
    settled?: Array<{ success: boolean; event: string; from?: string; to?: string; error?: string }>;
  }> {
    return request(`/${encodeURIComponent(entityType)}/transition`, { method: 'POST', body: JSON.stringify(input) });
  },
};

export const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'workorder', label: 'Work Order' },
  { value: 'permit', label: 'Permit to Work' },
  { value: 'pm_schedule', label: 'PM Schedule' },
];