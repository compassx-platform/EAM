import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { AutonumberSequence, Site } from '../../types';

interface SiteDraft {
  enabled: boolean;
  prefix: string;
  seed: string;
}

interface SequenceDraft {
  name: string;
  prefix: string;
  seed: string;
  sites: Record<string, SiteDraft>;
}

function nextLabel(prefix: string, seed: string): string {
  const n = Number(seed);
  const value = Number.isFinite(n) && n >= 0 ? Math.floor(n) + 1 : 1;
  return `${prefix.trim()}${value}`;
}

function groupRows(rows: AutonumberSequence[], sites: Site[]): SequenceDraft[] {
  const names = [...new Set(rows.map((row) => row.sequence_name))];
  return names.map((name) => {
    const org = rows.find((row) => row.sequence_name === name && row.level === 'organization');
    const siteDrafts: Record<string, SiteDraft> = {};
    for (const site of sites) {
      const match = rows.find((row) => row.sequence_name === name && row.site_id === site.site_id);
      siteDrafts[site.site_id] = {
        enabled: Boolean(match),
        prefix: match?.prefix ?? '',
        seed: String(match?.seed ?? 0),
      };
    }
    return {
      name,
      prefix: org?.prefix ?? '',
      seed: String(org?.seed ?? 0),
      sites: siteDrafts,
    };
  });
}

export function AutonumberPanel({ orgId, sites }: { orgId: string; sites: Site[] }) {
  const [drafts, setDrafts] = useState<SequenceDraft[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listOrgAutonumbers(orgId);
      setDrafts(groupRows(rows, sites));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Number sequences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orgId, sites]);

  useEffect(() => {
    void load();
  }, [load]);

  const siteKey = useMemo(() => sites.map((site) => site.site_id).join(','), [sites]);

  useEffect(() => {
    setDrafts((prev) => prev.map((draft) => {
      const nextSites = { ...draft.sites };
      for (const site of sites) {
        if (!nextSites[site.site_id]) {
          nextSites[site.site_id] = { enabled: false, prefix: '', seed: '0' };
        }
      }
      return { ...draft, sites: nextSites };
    }));
  }, [siteKey, sites]);

  const patch = (name: string, next: Partial<SequenceDraft>) => {
    setDrafts((prev) => prev.map((draft) => (draft.name === name ? { ...draft, ...next } : draft)));
  };

  const patchSite = (name: string, siteId: string, next: Partial<SiteDraft>) => {
    setDrafts((prev) => prev.map((draft) => {
      if (draft.name !== name) return draft;
      return { ...draft, sites: { ...draft.sites, [siteId]: { ...draft.sites[siteId], ...next } } };
    }));
  };

  const addSequence = () => {
    const name = newName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!name || drafts.some((draft) => draft.name === name)) return;
    const siteDrafts: Record<string, SiteDraft> = {};
    for (const site of sites) siteDrafts[site.site_id] = { enabled: false, prefix: '', seed: '0' };
    setDrafts((prev) => [...prev, { name, prefix: '', seed: '0', sites: siteDrafts }]);
    setNewName('');
  };

  const save = async (draft: SequenceDraft) => {
    const seed = Number(draft.seed);
    if (!Number.isInteger(seed) || seed < 0) {
      setError('Last number used must be a whole number of zero or more.');
      return;
    }
    setBusy(draft.name);
    setError(null);
    try {
      const saved = await api.saveAutonumber(orgId, draft.name, {
        organization: { prefix: draft.prefix.trim(), seed },
        sites: sites
          .filter((site) => draft.sites[site.site_id]?.enabled)
          .map((site) => {
            const row = draft.sites[site.site_id];
            const siteSeed = Number(row.seed);
            if (!Number.isInteger(siteSeed) || siteSeed < 0) {
              throw new Error(`Last number used for ${site.site_id} must be a whole number of zero or more.`);
            }
            return { site_id: site.site_id, prefix: row.prefix.trim(), seed: siteSeed };
          }),
      });
      setDrafts((prev) => prev.map((item) => (item.name === draft.name ? groupRows(saved, sites)[0] : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The sequence could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    setBusy(name);
    setError(null);
    try {
      await api.deleteAutonumber(orgId, name);
      setDrafts((prev) => prev.filter((draft) => draft.name !== name));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('not found')) {
        setDrafts((prev) => prev.filter((draft) => draft.name !== name));
      } else {
        setError(message || 'The sequence could not be removed.');
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-500">Loading number sequences…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Number sequences</h2>
        <p className="mt-1 max-w-2xl text-[11px] text-gray-500">
          Each sequence has its own prefix and last number. The next value is the prefix plus the last number plus one.
          An entity field chooses whether it uses the organization row or the site row.
        </p>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value.toUpperCase())}
          placeholder="PERMITNUM"
          className="w-48 rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs uppercase"
        />
        <button
          type="button"
          onClick={addSequence}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Add sequence
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-center">
          <Hash className="mb-2 h-6 w-6 text-gray-400" />
          <p className="text-xs font-semibold text-gray-800">No sequences yet</p>
        </div>
      ) : drafts.map((draft) => (
        <section key={draft.name} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-sm font-semibold text-gray-900">{draft.name}</h3>
            <button type="button" onClick={() => void remove(draft.name)} className="text-gray-400 hover:text-red-600" title="Remove sequence">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_8rem_auto] md:items-end">
            <label className="text-[11px] text-gray-500">
              Organization prefix
              <input
                value={draft.prefix}
                onChange={(e) => patch(draft.name, { prefix: e.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
              />
            </label>
            <label className="text-[11px] text-gray-500">
              Last number used
              <input
                value={draft.seed}
                onChange={(e) => patch(draft.name, { seed: e.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
              />
            </label>
            <p className="pb-2 text-[11px] text-gray-500">Next: {nextLabel(draft.prefix, draft.seed)}</p>
          </div>
          <div className="mt-4 space-y-2">
            {sites.length === 0 ? (
              <p className="text-[11px] text-gray-500">Add a site before a site sequence can be used.</p>
            ) : sites.map((site) => {
              const row = draft.sites[site.site_id] ?? { enabled: false, prefix: '', seed: '0' };
              return (
                <div key={site.site_id} className="grid gap-2 rounded-lg bg-gray-50 px-3 py-2 md:grid-cols-[auto_1fr_8rem_auto] md:items-center">
                  <label className="flex items-center gap-2 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => patchSite(draft.name, site.site_id, { enabled: e.target.checked })}
                    />
                    {site.site_id}
                  </label>
                  <input
                    value={row.prefix}
                    disabled={!row.enabled}
                    onChange={(e) => patchSite(draft.name, site.site_id, { prefix: e.target.value })}
                    placeholder="Site prefix"
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-xs disabled:bg-gray-100"
                  />
                  <input
                    value={row.seed}
                    disabled={!row.enabled}
                    onChange={(e) => patchSite(draft.name, site.site_id, { seed: e.target.value })}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-xs disabled:bg-gray-100"
                  />
                  <span className="text-[11px] text-gray-500">{row.enabled ? `Next: ${nextLabel(row.prefix, row.seed)}` : 'Not used'}</span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy === draft.name}
            onClick={() => void save(draft)}
            className="mt-3 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Save {draft.name}
          </button>
        </section>
      ))}
    </div>
  );
}
