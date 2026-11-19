/**
 * Signed-in CompassX user, held in memory for this page only.
 * The portal posts it after the app is embedded. Standalone EAM has no session.
 */
import { useEffect, useState } from 'react';

export const COMPASSX_USER_CONTEXT = 'compassx.user-context';
export const COMPASSX_USER_CONTEXT_REQUEST = 'compassx.user-context.request';

export interface CompassxSession {
  accessToken: string;
  workspaceId: string;
  workspaceSlug: string;
}

export interface CompassxProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: string[];
}

let session: CompassxSession | null = null;
let profile: CompassxProfile | null = null;
const listeners = new Set<() => void>();

function parentOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    return '';
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function getCompassxSession(): CompassxSession | null {
  return session;
}

export function getCompassxProfile(): CompassxProfile | null {
  return profile;
}

export function compassxActorId(): string | null {
  return profile?.email || profile?.id || null;
}

export function useCompassxProfile(): CompassxProfile | null {
  const [current, setCurrent] = useState(profile);
  useEffect(() => subscribeCompassxUser(() => setCurrent(getCompassxProfile())), []);
  return current;
}

export function subscribeCompassxUser(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function compassxRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (!session) return headers;
  headers['X-Compassx-User-Token'] = session.accessToken;
  headers['X-Workspace-Id'] = session.workspaceId;
  headers['X-Workspace-Slug'] = session.workspaceSlug;
  return headers;
}

async function loadProfile() {
  if (!session) return;
  try {
    const res = await fetch('/api/auth/me', { headers: compassxRequestHeaders() });
    if (!res.ok) return;
    const body = await res.json();
    profile = {
      id: String(body.id || body.actor_id || ''),
      email: body.email || (typeof body.actor_id === 'string' && body.actor_id.includes('@') ? body.actor_id : null),
      displayName: body.display_name || null,
      roles: Array.isArray(body.roles) ? body.roles : [],
    };
    notify();
  } catch {
    /* CompassX may be unreachable; the page still opens */
  }
}

function acceptContext(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const message = data as Record<string, unknown>;
  if (message.type !== COMPASSX_USER_CONTEXT) return;
  if (typeof message.accessToken !== 'string' || !message.accessToken.trim()) return;
  if (typeof message.workspaceId !== 'string' || typeof message.workspaceSlug !== 'string') return;
  const next: CompassxSession = {
    accessToken: message.accessToken.trim(),
    workspaceId: message.workspaceId,
    workspaceSlug: message.workspaceSlug,
  };
  const changed = !session
    || session.accessToken !== next.accessToken
    || session.workspaceId !== next.workspaceId
    || session.workspaceSlug !== next.workspaceSlug;
  session = next;
  notify();
  if (changed) void loadProfile();
}

export function installCompassxUserBridge() {
  window.addEventListener('message', (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent) return;
    const origin = parentOrigin();
    if (!origin || event.origin !== origin) return;
    acceptContext(event.data);
  });

  const origin = parentOrigin();
  if (window.parent !== window && origin) {
    window.parent.postMessage({ type: COMPASSX_USER_CONTEXT_REQUEST }, origin);
  }
}
