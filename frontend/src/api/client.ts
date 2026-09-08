import {
  EntityInstance,
  EntityDetailResponse,
  ValidTransitionsResponse,
  SimulateResponse,
  WorkflowDefinition,
  GateInstance,
  GateTypeCatalogItem,
  EntityField,
  AppUser,
  AppRole,
  SystemStats,
  EntityEvent,
} from '../types';

let currentActorId = 'admin@compassx.io';
let currentActorRole = 'Admin';

export const setActorContext = (actorId: string, role: string) => {
  currentActorId = actorId;
  currentActorRole = role;
  if (typeof window !== 'undefined') {
    localStorage.setItem('cx_actor_id', actorId);
    localStorage.setItem('cx_actor_role', role);
  }
};

export const getActorContext = () => {
  if (typeof window !== 'undefined') {
    const savedId = localStorage.getItem('cx_actor_id');
    const savedRole = localStorage.getItem('cx_actor_role');
    if (savedId) currentActorId = savedId;
    if (savedRole) currentActorRole = savedRole;
  }
  return { actorId: currentActorId, role: currentActorRole };
};

const getHeaders = () => {
  const { actorId, role } = getActorContext();
  return {
    'Content-Type': 'application/json',
    'X-Actor-Id': actorId,
    'X-Actor-Role': role,
  };
};

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...getHeaders(), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorDetail = 'API request failed';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail?.message || errorJson.detail || JSON.stringify(errorJson);
    } catch {
      errorDetail = response.statusText || `${response.status} error`;
    }
    throw new Error(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail));
  }
  
  return response.json();
}

export const api = {
  // Entities
  listEntities: (entityType: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return fetchJson<{ items: EntityInstance[]; total: number }>(`/api/${entityType}?${params.toString()}`);
  },

  getEntity: (entityType: string, id: string) =>
    fetchJson<EntityDetailResponse>(`/api/${entityType}/${id}`),

  getValidTransitions: (entityType: string, id: string) =>
    fetchJson<ValidTransitionsResponse>(`/api/${entityType}/${id}/valid-transitions`),

  createEntity: (entityType: string, customFields: Record<string, any>, payload?: Record<string, any>, workflowVersion?: string) =>
    fetchJson<{ accepted: boolean; entity_id: string; status: string; workflow_version: string; entity: EntityInstance }>(
      `/api/${entityType}/create`,
      {
        method: 'POST',
        body: JSON.stringify({ custom_fields: customFields, payload, workflow_version: workflowVersion }),
      }
    ),

  proposeTransition: (
    entityType: string,
    entityId: string,
    eventType: string,
    payload?: Record<string, any>,
    customFieldsDelta?: Record<string, any>,
    expectedLastEventId?: string
  ) =>
    fetchJson<{ accepted: boolean; entity_id: string; new_status: string; event_id: string; gate_trace: any[] }>(
      `/api/${entityType}/transition`,
      {
        method: 'POST',
        body: JSON.stringify({
          entity_id: entityId,
          event_type: eventType,
          payload,
          custom_fields_delta: customFieldsDelta,
          expected_last_event_id: expectedLastEventId,
        }),
      }
    ),

  simulateTransition: (
    entityType: string,
    params: {
      entity_id?: string;
      event_type: string;
      custom_fields_override?: Record<string, any>;
      current_status_override?: string;
      workflow_version_override?: string;
    }
  ) =>
    fetchJson<SimulateResponse>(`/api/${entityType}/simulate`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  rebuildEntity: (entityType: string, id: string) =>
    fetchJson<{ rebuilt: boolean; entity: EntityInstance }>(`/api/${entityType}/${id}/rebuild`, {
      method: 'POST',
    }),

  // Workflows
  listWorkflows: (entityType?: string, status?: string) => {
    const params = new URLSearchParams();
    if (entityType) params.append('entity_type', entityType);
    if (status) params.append('status', status);
    return fetchJson<WorkflowDefinition[]>(`/api/workflows?${params.toString()}`);
  },

  getActiveWorkflow: (entityType: string) =>
    fetchJson<WorkflowDefinition>(`/api/workflows/active/${entityType}`),

  getWorkflow: (id: string) =>
    fetchJson<WorkflowDefinition>(`/api/workflows/${id}`),

  saveWorkflowDraft: (data: { id?: string; entity_type: string; version_label: string; definition: any }) =>
    fetchJson<WorkflowDefinition>('/api/workflows/draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  validateWorkflow: (id: string) =>
    fetchJson<{ valid: boolean; errors: string[]; warnings: string[] }>(`/api/workflows/${id}/validate`, {
      method: 'POST',
    }),

  publishWorkflow: (id: string) =>
    fetchJson<{ published: boolean; workflow: WorkflowDefinition; warnings: string[] }>(`/api/workflows/${id}/publish`, {
      method: 'POST',
    }),

  deprecateWorkflow: (id: string) =>
    fetchJson<WorkflowDefinition>(`/api/workflows/${id}/deprecate`, {
      method: 'POST',
    }),

  // Gates
  getGateTypes: () =>
    fetchJson<GateTypeCatalogItem[]>('/api/gates/types'),

  listGates: (entityType?: string) => {
    const params = entityType ? `?entity_type=${entityType}` : '';
    return fetchJson<GateInstance[]>(`/api/gates${params}`);
  },

  saveGate: (gate: Partial<GateInstance>) =>
    fetchJson<GateInstance>('/api/gates', {
      method: 'POST',
      body: JSON.stringify(gate),
    }),

  deleteGate: (id: string) =>
    fetchJson<{ deleted: boolean; id: string }>(`/api/gates/${id}`, {
      method: 'DELETE',
    }),

  // Fields
  listFields: (entityType?: string) => {
    const params = entityType ? `?entity_type=${entityType}` : '';
    return fetchJson<EntityField[]>(`/api/fields${params}`);
  },

  saveField: (field: EntityField) =>
    fetchJson<EntityField>('/api/fields', {
      method: 'POST',
      body: JSON.stringify(field),
    }),

  deleteField: (entityType: string, fieldName: string) =>
    fetchJson<{ deleted: boolean }>(`/api/fields/${entityType}/${fieldName}`, {
      method: 'DELETE',
    }),

  // Auth & RBAC
  getUsers: () => fetchJson<AppUser[]>('/api/auth/users'),
  getRoles: () => fetchJson<AppRole[]>('/api/auth/roles'),
  createUser: (user: { email: string; display_name: string; roles: string[] }) =>
    fetchJson<AppUser>('/api/auth/users', { method: 'POST', body: JSON.stringify(user) }),
  createRole: (role: { name: string }) =>
    fetchJson<AppRole>('/api/auth/roles', { method: 'POST', body: JSON.stringify(role) }),
  getMe: () => fetchJson<{ actor_id: string; display_name: string; roles: string[]; active: boolean }>('/api/auth/me'),

  // System
  getStats: () => fetchJson<SystemStats>('/api/system/stats'),
  getEvents: (limit: number = 50) => fetchJson<any[]>(`/api/system/events?limit=${limit}`),
  triggerExpiryCheck: () =>
    fetchJson<{ checked_at: string; expired_count: number; expired_permits: any[] }>('/api/system/check-expiry', {
      method: 'POST',
    }),
  reseed: () => fetchJson<{ message: string }>('/api/system/seed', { method: 'POST' }),
};
