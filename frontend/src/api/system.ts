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

/**
 * Extracts the main domain (apex/root domain) from a given hostname.
 * Strips subdomains (e.g. 'app.compassx.io' -> 'compassx.io', 'sub.domain.co.uk' -> 'domain.co.uk').
 * Preserves localhost, single-label hosts, IP addresses, and wildcard DNS.
 */
export function extractMainDomain(hostname: string): string {
  if (!hostname) return '';
  const cleanHost = hostname.trim().toLowerCase();

  // Strip port if present
  const hostWithoutPort = cleanHost.includes(':') && !cleanHost.startsWith('[')
    ? cleanHost.split(':')[0]
    : cleanHost;

  // If host is an IP address (IPv4 or IPv6), localhost, single-label host, wildcard DNS (e.g. nip.io, sslip.io), return as is
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort);
  const isIpv6 = /^\[?[a-f0-9:]+\]?$/.test(hostWithoutPort);
  const isWildcardOrInternal =
    /\d+\.\d+\.\d+\.\d+/.test(hostWithoutPort) ||
    hostWithoutPort.endsWith('.nip.io') ||
    hostWithoutPort.endsWith('.sslip.io') ||
    hostWithoutPort.endsWith('.localtest.me') ||
    hostWithoutPort.endsWith('.traefik.me') ||
    hostWithoutPort.endsWith('.vcap.me') ||
    hostWithoutPort.endsWith('.cluster.local') ||
    hostWithoutPort.endsWith('.internal');

  if (isIpv4 || isIpv6 || isWildcardOrInternal || hostWithoutPort === 'localhost' || !hostWithoutPort.includes('.')) {
    return hostWithoutPort;
  }

  const parts = hostWithoutPort.split('.');
  if (parts.length <= 2) {
    return hostWithoutPort;
  }

  // Check for multi-part country code TLDs (e.g. .co.uk, .com.au, .co.in, .org.uk)
  const commonSecondLevelDomains = new Set([
    'co', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'ac', 'ne', 'gen', 'ind'
  ]);
  const secondToLast = parts[parts.length - 2];
  const last = parts[parts.length - 1];

  const isMultiPartCctld = last.length === 2 && commonSecondLevelDomains.has(secondToLast);

  if (isMultiPartCctld) {
    if (parts.length === 3) {
      return hostWithoutPort;
    }
    return parts.slice(-3).join('.');
  }

  // Standard TLD (e.g. .com, .io, .org, .net, .ai, .app, .dev)
  return parts.slice(-2).join('.');
}

/**
 * Returns the base origin using the main domain (stripping subdomains).
 * If window is available, extracts the protocol, main domain, and port.
 */
export function getMainDomainOrigin(): string {
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  const port = window.location.port;

  const mainDomain = extractMainDomain(hostname);
  const portSuffix = port ? `:${port}` : '';

  return `${protocol}//${mainDomain}${portSuffix}`;
}

/**
 * Resolves the dynamic CompassX Base URL derived from the main domain of the browser (e.g. 'http://compassx.io').
 */
export function getCompassXBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const mainOrigin = getMainDomainOrigin();
    if (mainOrigin) {
      return mainOrigin;
    }
    return window.location.origin;
  }
  return '';
}

/**
 * Helper to ensure a Base URL is converted to the fixed /api/v1/catalog endpoint internally.
 */
export function toCatalogEndpoint(baseUrlOrEndpoint: string): string {
  if (!baseUrlOrEndpoint || !baseUrlOrEndpoint.trim()) {
    const defaultBase = getCompassXBaseUrl();
    return defaultBase ? `${defaultBase}/api/v1/catalog` : '/api/v1/catalog';
  }
  let trimmed = baseUrlOrEndpoint.trim().replace(/\/+$/, '');

  // If user provided a host without protocol (e.g. 135.13.180.167.nip.io), add current protocol
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
    const currentProto = typeof window !== 'undefined' && window.location?.protocol ? window.location.protocol : 'http:';
    trimmed = `${currentProto}//${trimmed}`;
  }

  if (trimmed.endsWith('/api/v1/catalog')) {
    return trimmed;
  }
  if (trimmed.includes('/api/')) {
    return trimmed;
  }
  return `${trimmed}/api/v1/catalog`;
}

/**
 * Resolves the dynamic CompassX Catalog base URL derived from the main domain of the browser (subdomains stripped).
 */
export function getCompassXCatalogBaseUrl(): string {
  const base = getCompassXBaseUrl();
  return base ? `${base}/api/v1/catalog` : '/api/v1/catalog';
}

export function getSystemHeaders(customBaseUrl?: string, customToken?: string): Record<string, string> {
  const endpoint = customBaseUrl ? toCatalogEndpoint(customBaseUrl) : getCompassXCatalogBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CompassX-Catalog-Url': endpoint,
  };

  const token = customToken || (
    typeof window !== 'undefined'
      ? localStorage.getItem('compassx_auth_token') ||
        localStorage.getItem('access_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token')
      : null
  );

  if (token && token.trim()) {
    const clean = token.trim();
    headers['Authorization'] = clean.toLowerCase().startsWith('bearer ') ? clean : `Bearer ${clean}`;
    headers['X-CompassX-Auth-Token'] = clean.replace(/^bearer\s+/i, '');
  }

  return headers;
}

export async function getSystemStorageConfig(customBaseUrl?: string, customToken?: string): Promise<SystemStorageConfig> {
  const res = await fetch(`${API_BASE}/system/settings/storage`, {
    headers: getSystemHeaders(customBaseUrl, customToken),
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
  const effectiveBaseUrl = customBaseUrl || payload.endpoint_url;
  const effectiveToken = customToken || payload.auth_token || undefined;
  const res = await fetch(`${API_BASE}/system/settings/storage`, {
    method: 'PUT',
    headers: getSystemHeaders(effectiveBaseUrl, effectiveToken),
    body: JSON.stringify({
      ...payload,
      endpoint_url: effectiveBaseUrl ? toCatalogEndpoint(effectiveBaseUrl) : undefined,
      auth_token: effectiveToken,
    }),
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
