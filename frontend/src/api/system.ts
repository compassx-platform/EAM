export interface CompassXSchema {
  id: string;
  name: string;
  description?: string | null;
  table_count?: number;
}

export interface CompassXCatalog {
  id: string;
  name: string;
  description?: string | null;
  catalog_type?: string;
  connection_id?: string | null;
  database_name?: string | null;
  schema_count?: number;
  table_count?: number;
  schemas: CompassXSchema[];
}

export interface CompassXVolumeItem {
  id: string;
  schema_id?: string;
  name: string;
  description?: string | null;
  storage_location?: string;
  owner?: string;
  created_by?: string;
  created_at?: string;
  catalog_name?: string;
  schema_name?: string;
}

export interface SystemStorageConfig {
  catalog_name: string;
  schema_name: string;
  volume_id: string;
  volume_name: string;
  storage_location?: string;
  endpoint_url?: string;
  auth_token?: string | null;
  is_configured: boolean;
  configured_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface UpdateStorageConfigPayload {
  catalog_name: string;
  schema_name: string;
  volume_id: string;
  volume_name: string;
  storage_location?: string;
  endpoint_url?: string;
  auth_token?: string | null;
  updated_by?: string;
}

export interface CreateVolumePayload {
  catalog_name: string;
  schema_name: string;
  name: string;
  description?: string;
}

const API_BASE = '/api';

export function getCompassXCatalogBaseUrl(): string {
  return '/api/v1/catalog';
}

export function getSystemHeaders(customBaseUrl?: string, customToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customBaseUrl) {
    headers['X-CompassX-Catalog-Url'] = customBaseUrl;
  }
  if (typeof window !== 'undefined') {
    const token = customToken || (
      localStorage.getItem('compassx_auth_token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token')
    );
    if (token && token.trim()) {
      const clean = token.trim();
      headers['Authorization'] = clean.toLowerCase().startsWith('bearer ') ? clean : `Bearer ${clean}`;
      headers['X-CompassX-Auth-Token'] = clean.replace(/^bearer\s+/i, '');
    }
    const workloadId =
      localStorage.getItem('compassx_workload_identity') ||
      localStorage.getItem('workload_identity') ||
      localStorage.getItem('COMPASSX_WORKLOAD_IDENTITY');
    if (workloadId && workloadId.trim()) {
      headers['X-Workload-Identity'] = workloadId.trim();
      headers['X-CompassX-Workload-Identity'] = workloadId.trim();
    }
    const workspaceId =
      localStorage.getItem('compassx_workspace_id') ||
      localStorage.getItem('workspace_id') ||
      localStorage.getItem('WORKSPACE_ID');
    if (workspaceId && workspaceId.trim()) {
      headers['X-Workspace-Id'] = workspaceId.trim();
    }
  }
  return headers;
}

export async function getSystemStorageConfig(): Promise<SystemStorageConfig> {
  const res = await fetch(`${API_BASE}/system/settings/storage`, {
    headers: getSystemHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to fetch system storage settings');
  }
  return res.json();
}

export async function updateSystemStorageConfig(
  payload: UpdateStorageConfigPayload,
  customBaseUrl?: string,
  customToken?: string
): Promise<SystemStorageConfig> {
  const res = await fetch(`${API_BASE}/system/settings/storage`, {
    method: 'PUT',
    headers: getSystemHeaders(customBaseUrl, customToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update system storage settings');
  }
  return res.json();
}

export async function getCompassXCatalogs(customBaseUrl?: string, customToken?: string): Promise<CompassXCatalog[]> {
  const res = await fetch(`${API_BASE}/system/storage/catalogs`, {
    headers: getSystemHeaders(customBaseUrl, customToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to fetch CompassX catalogs');
  }
  return res.json();
}

export async function getCompassXVolumes(
  catalog?: string,
  schemaName?: string,
  customBaseUrl?: string,
  customToken?: string
): Promise<CompassXVolumeItem[]> {
  const query = new URLSearchParams();
  if (catalog) query.set('catalog', catalog);
  if (schemaName) query.set('schema_name', schemaName);
  const res = await fetch(`${API_BASE}/system/storage/volumes?${query.toString()}`, {
    headers: getSystemHeaders(customBaseUrl, customToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to fetch CompassX volumes');
  }
  return res.json();
}

export async function createCompassXVolume(
  payload: CreateVolumePayload,
  customBaseUrl?: string,
  customToken?: string
): Promise<CompassXVolumeItem> {
  const res = await fetch(`${API_BASE}/system/storage/volumes`, {
    method: 'POST',
    headers: getSystemHeaders(customBaseUrl, customToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create volume');
  }
  return res.json();
}
