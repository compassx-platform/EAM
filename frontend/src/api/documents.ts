import type {
  DocFolder,
  DocInfo,
  PresignedUrlResponse,
} from '../types';
const API_BASE = '/api';

function getDocHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    ...(extra || {}),
  };
  if (typeof window !== 'undefined') {
    const token =
      localStorage.getItem('compassx_auth_token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token');
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

export async function listDocumentFolders(params?: {
  activeOnly?: boolean;
  parentId?: string | null;
  volumeId?: string | null;
  sync?: boolean;
}): Promise<DocFolder[]> {
  const query = new URLSearchParams();
  if (params?.activeOnly) query.set('active_only', 'true');
  if (params?.parentId !== undefined && params?.parentId !== null) query.set('parent_id', params.parentId);
  if (params?.volumeId) query.set('volume_id', params.volumeId);
  if (params?.sync !== undefined) query.set('sync', params.sync ? 'true' : 'false');
  const url = `${API_BASE}/document-folders?${query.toString()}`;
  const res = await fetch(url, { headers: getDocHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch folders: ${res.statusText}`);
  return res.json();
}

export async function getDocumentFolderTree(
  activeOnly = false,
  volumeId?: string | null,
  sync = true
): Promise<DocFolder[]> {
  const query = new URLSearchParams();
  if (activeOnly) query.set('active_only', 'true');
  if (volumeId) query.set('volume_id', volumeId);
  if (sync !== undefined) query.set('sync', sync ? 'true' : 'false');
  const url = `${API_BASE}/document-folders/tree?${query.toString()}`;
  const res = await fetch(url, { headers: getDocHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch folder tree: ${res.statusText}`);
  return res.json();
}

export async function syncVolumeDocuments(volumeId?: string): Promise<{
  synced: boolean;
  volume_id?: string;
  folders_synced?: number;
  files_synced?: number;
}> {
  const query = volumeId ? `?volume_id=${encodeURIComponent(volumeId)}` : '';
  const res = await fetch(`${API_BASE}/documents/sync${query}`, {
    method: 'POST',
    headers: getDocHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to sync with volume');
  }
  return res.json();
}

export async function getDocumentFolderPath(folderId: string): Promise<Array<{ id: string; folder_name: string }>> {
  const res = await fetch(`${API_BASE}/document-folders/${encodeURIComponent(folderId)}/path`, {
    headers: getDocHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch folder path: ${res.statusText}`);
  return res.json();
}

export async function createDocumentFolder(payload: {
  folder_name: string;
  parent_id?: string | null;
  description?: string;
  volume_id?: string | null;
  default_sub_path?: string;
  allowed_extensions?: string[];
  max_file_size_mb?: number;
  default_print_thru_vendor?: boolean;
}): Promise<DocFolder> {
  const res = await fetch(`${API_BASE}/document-folders`, {
    method: 'POST',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create document folder');
  }
  return res.json();
}

export async function updateDocumentFolder(
  folderId: string,
  payload: Partial<DocFolder>
): Promise<DocFolder> {
  const res = await fetch(`${API_BASE}/document-folders/${encodeURIComponent(folderId)}`, {
    method: 'PUT',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update folder');
  }
  return res.json();
}

export async function moveDocumentFolder(
  folderId: string,
  targetParentId: string | null
): Promise<DocFolder> {
  const res = await fetch(`${API_BASE}/document-folders/${encodeURIComponent(folderId)}/move`, {
    method: 'PUT',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ target_parent_id: targetParentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to move folder');
  }
  return res.json();
}

export async function moveDocument(
  docId: string,
  targetFolderId: string | null
): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/move`, {
    method: 'PUT',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ target_folder_id: targetFolderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to move document');
  }
  return res.json();
}

export async function deleteDocumentFolder(folderId: string): Promise<{ id: string; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/document-folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
    headers: getDocHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to delete folder');
  }
  return res.json();
}

export async function listDocuments(params?: {
  folder_id?: string;
  search?: string;
  url_type?: string;
  tag?: string;
  status?: string;
  volume_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: DocInfo[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  if (params?.folder_id) query.set('folder_id', params.folder_id);
  if (params?.search) query.set('search', params.search);
  if (params?.url_type) query.set('url_type', params.url_type);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.status) query.set('status', params.status);
  if (params?.volume_id) query.set('volume_id', params.volume_id);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));

  const res = await fetch(`${API_BASE}/documents?${query.toString()}`, {
    headers: getDocHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list documents: ${res.statusText}`);
  return res.json();
}

export async function getDocument(docId: string): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}`, {
    headers: getDocHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get document: ${res.statusText}`);
  return res.json();
}

export async function uploadDocument(formData: FormData): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: getDocHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to upload document');
  }
  return res.json();
}

export async function createUrlDocument(payload: {
  title: string;
  url: string;
  description?: string;
  folder_id?: string;
  tags?: string[];
  custom_metadata?: Record<string, any>;
}): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/url`, {
    method: 'POST',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to link URL document');
  }
  return res.json();
}

export function getDownloadUrl(docId: string): string {
  return `${API_BASE}/documents/${encodeURIComponent(docId)}/download`;
}

export async function getDocumentPresignedUrl(
  docId: string,
  expirySeconds = 3600
): Promise<PresignedUrlResponse> {
  const res = await fetch(
    `${API_BASE}/documents/${encodeURIComponent(docId)}/presigned-url?expiry_seconds=${expirySeconds}`,
    {
      headers: getDocHeaders(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to generate presigned URL');
  }
  return res.json();
}

export async function renameDocument(
  docId: string,
  newName: string,
  newTitle?: string
): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/rename`, {
    method: 'POST',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ new_name: newName, new_title: newTitle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to rename document');
  }
  return res.json();
}

export async function updateDocumentMetadata(
  docId: string,
  payload: Partial<DocInfo>
): Promise<DocInfo> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}`, {
    method: 'PUT',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update document metadata');
  }
  return res.json();
}

export async function deleteDocument(
  docId: string,
  purgeStorage = true
): Promise<{ id: string; deleted: boolean }> {
  const res = await fetch(
    `${API_BASE}/documents/${encodeURIComponent(docId)}?purge_storage=${purgeStorage}`,
    {
      method: 'DELETE',
      headers: getDocHeaders(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to delete document');
  }
  return res.json();
}
