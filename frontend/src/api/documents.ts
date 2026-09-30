import type {
  DocFolder,
  DocInfo,
  VolumeRead,
  VolumeFileInfo,
  PresignedUrlResponse,
} from '../types';
import { getCompassXCatalogBaseUrl } from './system';

const API_BASE = '/api';

function getDocHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-CompassX-Catalog-Url': getCompassXCatalogBaseUrl(),
    ...(extra || {}),
  };
}

export async function listDocumentFolders(activeOnly = false): Promise<DocFolder[]> {
  const url = `${API_BASE}/document-folders${activeOnly ? '?active_only=true' : ''}`;
  const res = await fetch(url, { headers: getDocHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch folders: ${res.statusText}`);
  return res.json();
}

export async function createDocumentFolder(payload: {
  folder_name: string;
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

// ----------------------------------------------------------------------------
// CompassX Volumes Explorer API
// ----------------------------------------------------------------------------

export async function listVolumes(
  catalog?: string,
  schemaName?: string
): Promise<VolumeRead[]> {
  const query = new URLSearchParams();
  if (catalog) query.set('catalog', catalog);
  if (schemaName) query.set('schema_name', schemaName);
  const res = await fetch(`${API_BASE}/documents-volume/volumes?${query.toString()}`, {
    headers: getDocHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list volumes: ${res.statusText}`);
  return res.json();
}

export async function createVolume(payload: {
  name: string;
  description?: string;
  catalog_name?: string;
  schema_name?: string;
}): Promise<VolumeRead> {
  const res = await fetch(`${API_BASE}/documents-volume/volumes`, {
    method: 'POST',
    headers: getDocHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create volume');
  }
  return res.json();
}

export async function createVolumeDirectory(
  volumeId: string,
  dirName: string,
  subPath = ''
): Promise<{ dir_path: string; dir_name: string; sub_path: string }> {
  const res = await fetch(
    `${API_BASE}/documents-volume/volumes/${encodeURIComponent(volumeId)}/directories`,
    {
      method: 'POST',
      headers: getDocHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ dir_name: dirName, sub_path: subPath }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create directory');
  }
  return res.json();
}

export async function listVolumeFiles(
  volumeId: string,
  subPath?: string
): Promise<VolumeFileInfo[]> {
  const query = new URLSearchParams();
  if (subPath) query.set('sub_path', subPath);
  const res = await fetch(
    `${API_BASE}/documents-volume/volumes/${encodeURIComponent(volumeId)}/files?${query.toString()}`,
    {
      headers: getDocHeaders(),
    }
  );
  if (!res.ok) throw new Error(`Failed to list volume files: ${res.statusText}`);
  return res.json();
}
