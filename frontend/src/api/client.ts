import type {
  Workflow,
  WorkflowDefinition,
  ConditionDefinition,
  ConditionGroup,
  ConditionVersion,
  ConditionTypeInfo,
  ConditionTraceItem,
  ValidationResult,
  EntityField,
  EntityRecord,
  EntityEvent,
  ValidTransition,
  EntityForm,
  EntityFormItem,
  OptionListSummary,
  ListDefinition,
  ResolvedList,
  ListKind,
  ChecklistItem,
  ListUsage,
  EntityTypeDefinition,
  EntityFieldInput,
  Person,
  PersonGroup,
  PersonGroupMember,
  PersonAvailability,
  PersonAudit,
  PersonRelated,
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

  listConditions(entityType?: string): Promise<ConditionDefinition[]> {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return request<ConditionDefinition[]>(`/conditions${q}`);
  },

  getCondition(id: string): Promise<ConditionDefinition> {
    return request<ConditionDefinition>(`/conditions/${encodeURIComponent(id)}`);
  },

  createCondition(input: {
    id?: string;
    entity_type: string;
    label: string;
    description?: string;
    type?: 'structured' | 'script';
    definition: ConditionGroup;
    failure_policy?: 'block' | 'allow';
  }): Promise<ConditionDefinition> {
    return request<ConditionDefinition>('/conditions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listConditionTypes(): Promise<ConditionTypeInfo> {
    return request<ConditionTypeInfo>('/conditions/types');
  },

  listConditionVersions(id: string): Promise<ConditionVersion[]> {
    return request<ConditionVersion[]>(`/conditions/${encodeURIComponent(id)}/versions`);
  },

  getConditionUsage(id: string): Promise<{
    workflows: Array<{ id: string; version_label: string; status: string; references: string[] }>;
    forms: Array<{ entity_type: string; references: string[] }>;
    referenced: boolean;
  }> {
    return request(`/conditions/${encodeURIComponent(id)}/used-by`);
  },

  evaluateCondition(
    id: string,
    input: { custom_fields: Record<string, unknown>; actor_id?: string; actor_type?: string; actor_roles?: string[] }
  ): Promise<ConditionTraceItem> {
    return request<ConditionTraceItem>(`/conditions/${encodeURIComponent(id)}/eval`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  deleteCondition(id: string): Promise<{ deleted: boolean; id: string }> {
    return request(`/conditions/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
    label?: string | null;
    required?: boolean;
    select_options?: string[];
    option_list_key?: string | null;
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
  }): Promise<EntityForm & { fields?: EntityField[] }> {
    return request<EntityForm & { fields?: EntityField[] }>('/forms', {
      method: 'POST',
      body: JSON.stringify({
        entity_type: input.entity_type,
        cols: input.cols,
        row_height: input.row_height,
        layout: input.layout.map((it) => {
          const isGroup = Boolean(it.isGroup ?? (it as any).is_group ?? it.i?.startsWith('group:'));
          const isHeader = Boolean(it.isHeader ?? (it as any).is_header ?? it.i?.startsWith('header:'));
          return {
            ...it,
            isGroup,
            is_group: isGroup,
            isHeader,
            is_header: isHeader,
            optionsList: it.optionsList ?? (it as any).options_list ?? null,
            options_list: it.optionsList ?? (it as any).options_list ?? null,
            hiddenOptions: it.hiddenOptions ?? (it as any).hidden_options ?? [],
            hidden_options: it.hiddenOptions ?? (it as any).hidden_options ?? [],
            groupId: it.groupId ?? (it as any).group_id ?? (isGroup ? it.i : null),
            group_id: it.groupId ?? (it as any).group_id ?? (isGroup ? it.i : null),
            groupTitle: it.groupTitle ?? (it as any).group_title ?? (isGroup ? (it.label || 'Group') : null),
            group_title: it.groupTitle ?? (it as any).group_title ?? (isGroup ? (it.label || 'Group') : null),
            visibilityCondition: it.visibilityCondition ?? (it as any).visibility_condition ?? null,
            visibility_condition: it.visibilityCondition ?? (it as any).visibility_condition ?? null,
            accept: it.accept ?? (it as any).accept ?? null,
            maxFileSizeMb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? null,
            max_file_size_mb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? null,
            allowMultiple: Boolean(it.allowMultiple ?? (it as any).allow_multiple),
            allow_multiple: Boolean(it.allowMultiple ?? (it as any).allow_multiple),
            maxFiles: it.maxFiles ?? (it as any).max_files ?? null,
            max_files: it.maxFiles ?? (it as any).max_files ?? null,
            minRows: it.minRows ?? (it as any).min_rows ?? null,
            min_rows: it.minRows ?? (it as any).min_rows ?? null,
            maxRows: it.maxRows ?? (it as any).max_rows ?? null,
            max_rows: it.maxRows ?? (it as any).max_rows ?? null,
            allowAddRows: it.allowAddRows ?? (it as any).allow_add_rows ?? true,
            allow_add_rows: it.allowAddRows ?? (it as any).allow_add_rows ?? true,
            allowDeleteRows: it.allowDeleteRows ?? (it as any).allow_delete_rows ?? true,
            allow_delete_rows: it.allowDeleteRows ?? (it as any).allow_delete_rows ?? true,
            emptyStateText: it.emptyStateText ?? (it as any).empty_state_text ?? null,
            empty_state_text: it.emptyStateText ?? (it as any).empty_state_text ?? null,
          };
        }),
      }),
    });
  },

  listLists(): Promise<OptionListSummary[]> {
    return request('/lists');
  },

  getList(listKey: string): Promise<ListDefinition> {
    return request(`/lists/${encodeURIComponent(listKey)}`);
  },

  listListVersions(listKey: string): Promise<ListDefinition[]> {
    return request(`/lists/${encodeURIComponent(listKey)}/versions`);
  },

  getListUsage(listKey: string): Promise<ListUsage> {
    return request(`/lists/${encodeURIComponent(listKey)}/usages`);
  },

  saveListDraft(input: {
    list_key: string;
    kind: ListKind;
    description?: string;
    items: Array<string | ChecklistItem>;
  }): Promise<ListDefinition> {
    return request<ListDefinition>('/lists/draft', { method: 'POST', body: JSON.stringify(input) });
  },

  publishList(listKey: string): Promise<{ published: boolean; list: ListDefinition }> {
    return request(`/lists/${encodeURIComponent(listKey)}/publish`, { method: 'POST' });
  },

  deleteList(listKey: string): Promise<{ deleted: boolean; list_key: string }> {
    return request(`/lists/${encodeURIComponent(listKey)}`, { method: 'DELETE' });
  },

  resolveLists(listKeys: string[]): Promise<{ resolved: Record<string, ResolvedList> }> {
    const keys = [...new Set(listKeys.map((k) => k.trim()).filter(Boolean))];
    if (keys.length === 0) return Promise.resolve({ resolved: {} });
    const q = `?keys=${encodeURIComponent(keys.join(','))}`;
    return request(`/lists/resolved${q}`);
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
    condition_trace: ConditionTraceItem[];
    routing?: { choice_index: number; choices: Array<{ choice_index: number; to: string; when: string[]; matched: boolean }> };
    side_effects?: Array<{ type: string; success: boolean; [k: string]: unknown }>;
    settled?: Array<{ success: boolean; event: string; from?: string; to?: string; error?: string }>;
  }> {
    return request(`/${encodeURIComponent(entityType)}/transition`, { method: 'POST', body: JSON.stringify(input) });
  },

  listEntityTypes(): Promise<EntityTypeDefinition[]> {
    return request<EntityTypeDefinition[]>('/entity-types');
  },

  getEntityType(name: string): Promise<EntityTypeDefinition> {
    return request<EntityTypeDefinition>(`/entity-types/${encodeURIComponent(name)}`);
  },

  createEntityType(input: {
    name: string;
    display_name: string;
    description?: string;
    icon?: string;
    fields?: EntityFieldInput[];
  }): Promise<EntityTypeDefinition> {
    return request<EntityTypeDefinition>('/entity-types', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateEntityType(
    name: string,
    input: { display_name?: string; description?: string; icon?: string }
  ): Promise<EntityTypeDefinition> {
    return request<EntityTypeDefinition>(`/entity-types/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteEntityType(name: string): Promise<{ deleted: boolean; name: string }> {
    return request(`/entity-types/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },

  // ---- People & Person Groups (IBM Maximo People Management) --------------

  listPersons(opts?: {
    status?: string;
    search?: string;
    group?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; limit: number; offset: number; items: Person[] }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.search) params.set('search', opts.search);
    if (opts?.group) params.set('group', opts.group);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const q = params.toString() ? `?${params.toString()}` : '';
    return request<{ total: number; limit: number; offset: number; items: Person[] }>(`/persons${q}`);
  },

  getPerson(personId: string): Promise<Person> {
    return request<Person>(`/persons/${encodeURIComponent(personId)}`);
  },

  createPerson(input: Partial<Person> & { display_name: string }): Promise<Person> {
    return request<Person>('/persons', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updatePerson(personId: string, input: Partial<Person>): Promise<Person> {
    return request<Person>(`/persons/${encodeURIComponent(personId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deletePerson(personId: string): Promise<{ deleted: boolean; person_id: string }> {
    return request(`/persons/${encodeURIComponent(personId)}`, { method: 'DELETE' });
  },

  inactivatePerson(personId: string): Promise<{
    inactivated: boolean;
    person_id: string;
    inactivated_user_id?: string | null;
    already?: boolean;
  }> {
    return request(`/persons/${encodeURIComponent(personId)}/inactivate`, { method: 'POST' });
  },

  activatePerson(personId: string): Promise<{ activated: boolean; person_id: string }> {
    return request(`/persons/${encodeURIComponent(personId)}/activate`, { method: 'POST' });
  },

  getPersonRelated(personId: string): Promise<PersonRelated> {
    return request<PersonRelated>(`/persons/${encodeURIComponent(personId)}/related`);
  },

  createPersonAvailability(
    personId: string,
    input: { reason: string; available_from: string; available_to: string }
  ): Promise<PersonAvailability> {
    return request<PersonAvailability>(`/persons/${encodeURIComponent(personId)}/availability`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listPersonAvailability(personId: string): Promise<{ person_id: string; items: PersonAvailability[] }> {
    return request(`/persons/${encodeURIComponent(personId)}/availability`);
  },

  listPersonAudit(personId: string): Promise<{ person_id: string; items: PersonAudit[] }> {
    return request(`/persons/${encodeURIComponent(personId)}/audit`);
  },

  listPersonGroups(search?: string): Promise<{ items: PersonGroup[] }> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<{ items: PersonGroup[] }>(`/person-groups${q}`);
  },

  getPersonGroup(groupName: string): Promise<PersonGroup> {
    return request<PersonGroup>(`/person-groups/${encodeURIComponent(groupName)}`);
  },

  createPersonGroup(input: {
    group_name: string;
    description?: string;
    is_crew_work_group?: boolean;
    use_for_org?: string;
    use_for_site?: string;
    members?: Array<{
      person_id: string;
      sequence?: number;
      is_group_default?: boolean;
      is_org_default?: boolean;
      is_site_default?: boolean;
    }>;
  }): Promise<PersonGroup> {
    return request<PersonGroup>('/person-groups', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updatePersonGroup(
    groupName: string,
    input: {
      description?: string;
      is_crew_work_group?: boolean;
      use_for_org?: string;
      use_for_site?: string;
    }
  ): Promise<PersonGroup> {
    return request<PersonGroup>(`/person-groups/${encodeURIComponent(groupName)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deletePersonGroup(groupName: string): Promise<{ deleted: boolean; group_name: string }> {
    return request(`/person-groups/${encodeURIComponent(groupName)}`, { method: 'DELETE' });
  },

  addGroupMember(
    groupName: string,
    input: {
      person_id: string;
      sequence?: number;
      is_group_default?: boolean;
      is_org_default?: boolean;
      is_site_default?: boolean;
    }
  ): Promise<PersonGroup> {
    return request<PersonGroup>(`/person-groups/${encodeURIComponent(groupName)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateGroupMember(
    groupName: string,
    personId: string,
    input: {
      sequence?: number;
      is_group_default?: boolean;
      is_org_default?: boolean;
      is_site_default?: boolean;
    }
  ): Promise<PersonGroup> {
    return request<PersonGroup>(
      `/person-groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(personId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  },

  removeGroupMember(
    groupName: string,
    personId: string
  ): Promise<{ deleted: boolean; group_name: string; person_id: string }> {
    return request(
      `/person-groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(personId)}`,
      {
        method: 'DELETE',
      }
    );
  },
};

export const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'workorder', label: 'Work Order' },
  { value: 'permit', label: 'Permit to Work' },
  { value: 'pm_schedule', label: 'PM Schedule' },
];