import { useSyncExternalStore } from 'react';

interface HashRoute {
  path: string;
  id: string | null;
  query: URLSearchParams;
}

function parseHash(): HashRoute {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart = '/', queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const segments = path.split('/').filter(Boolean);
  return {
    path,
    id: segments.length > 1 ? decodeURIComponent(segments[segments.length - 1]) : null,
    query: new URLSearchParams(queryPart),
  };
}

let cached: HashRoute = parseHash();

function getSnapshot(): HashRoute {
  return cached;
}

function subscribe(callback: () => void) {
  const onChange = () => {
    cached = parseHash();
    callback();
  };
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useHashRoute(): HashRoute {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function navigate(path: string, query?: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') q.set(k, v);
    }
  }
  const qs = q.toString();
  const next = path + (qs ? `?${qs}` : '');
  if (window.location.hash === `#${next}`) return;
  window.location.hash = next;
}