import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import type { Asset, DrilldownAsset, DrilldownLocation, DrilldownSite } from '../../types';

export interface AssetSelection {
  asset_id: string;
  site_id: string;
  location_id?: string | null;
  name: string;
}

export function parseAssetValue(value: string): AssetSelection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.asset_id) {
      return parsed as AssetSelection;
    }
  } catch {
    /* plain asset id */
  }
  return value.trim() ? { asset_id: value.trim(), site_id: '', name: value.trim() } : null;
}

export function parseAssetList(value: string): AssetSelection[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((row) => row && row.asset_id);
  } catch {
    /* empty */
  }
  return [];
}

interface AssetPickerProps {
  value: string;
  multiple?: boolean;
  siteId?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export function AssetPicker({ value, multiple = false, siteId, readOnly = false, onChange }: AssetPickerProps) {
  const [mode, setMode] = useState<'value' | 'tree' | null>(null);
  const current = multiple ? null : parseAssetValue(value);
  const many = multiple ? parseAssetList(value) : [];
  const label = multiple
    ? many.length ? many.map((row) => row.name || row.asset_id).join(', ') : ''
    : current ? `${current.name || current.asset_id}${current.location_id ? ` · ${current.location_id}` : ''}` : '';

  const commitOne = (row: AssetSelection) => {
    onChange(JSON.stringify(row));
    setMode(null);
  };
  const commitMany = (rows: AssetSelection[]) => {
    onChange(JSON.stringify(rows));
    setMode(null);
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900">
          {label || <span className="text-gray-400">No asset selected</span>}
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setMode('value')}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Select Value
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setMode('tree')}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Drilldown
        </button>
      </div>
      {mode && (
        <AssetDialog
          mode={mode}
          siteId={siteId}
          multiple={multiple}
          selected={multiple ? many : current ? [current] : []}
          onClose={() => setMode(null)}
          onConfirm={(rows) => (multiple ? commitMany(rows) : rows[0] && commitOne(rows[0]))}
        />
      )}
    </div>
  );
}

function AssetDialog({
  mode,
  siteId,
  multiple,
  selected,
  onClose,
  onConfirm,
}: {
  mode: 'value' | 'tree';
  siteId?: string;
  multiple: boolean;
  selected: AssetSelection[];
  onClose: () => void;
  onConfirm: (rows: AssetSelection[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tree, setTree] = useState<DrilldownSite[]>([]);
  const [picked, setPicked] = useState<AssetSelection[]>(selected);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (mode === 'value') {
          const rows = await api.listAssets({
            site_id: siteId || undefined,
            search: search || undefined,
            classstructure_id: classId || undefined,
          });
          if (!cancelled) setAssets(rows);
        } else {
          const rows = await api.getDrilldownHierarchy({ site_id: siteId || undefined });
          if (!cancelled) setTree(rows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load assets');
      }
    };
    const timer = window.setTimeout(load, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, siteId, search, classId]);

  const toggle = (row: AssetSelection) => {
    if (!multiple) {
      onConfirm([row]);
      return;
    }
    setPicked((prev) => {
      const exists = prev.some((item) => item.asset_id === row.asset_id && item.site_id === row.site_id);
      return exists ? prev.filter((item) => !(item.asset_id === row.asset_id && item.site_id === row.site_id)) : [...prev, row];
    });
  };

  const chosen = useMemo(() => new Set(picked.map((row) => `${row.site_id}:${row.asset_id}`)), [picked]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{mode === 'value' ? 'Select asset' : 'Asset drilldown'}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {mode === 'value' && (
          <div className="flex gap-2 border-b border-gray-100 px-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-7 pr-2 text-xs"
              />
            </div>
            <input
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="Classification"
              className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error && <p className="px-2 py-2 text-xs text-red-600">{error}</p>}
          {mode === 'value' && assets.map((asset) => {
            const row = { asset_id: asset.asset_id, site_id: asset.site_id, location_id: asset.location_id, name: asset.name };
            const on = chosen.has(`${asset.site_id}:${asset.asset_id}`);
            return (
              <button
                key={`${asset.site_id}:${asset.asset_id}`}
                type="button"
                onClick={() => toggle(row)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50 ${on ? 'bg-blue-50' : ''}`}
              >
                <span className="font-medium text-gray-900">{asset.asset_id}</span>
                <span className="truncate text-gray-500">{asset.name}{asset.location_id ? ` · ${asset.location_id}` : ''}</span>
              </button>
            );
          })}
          {mode === 'tree' && tree.map((site) => (
            <div key={site.site_id} className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-500">{site.site_name || site.site_id}</p>
              {site.locations_tree.map((loc) => (
                <LocationNode key={loc.location_id} location={loc} siteId={site.site_id} chosen={chosen} onPick={toggle} />
              ))}
              {site.unassigned_assets.map((asset) => (
                <AssetNode key={asset.asset_id} asset={asset} siteId={site.site_id} locationId={asset.location_id} chosen={chosen} onPick={toggle} />
              ))}
            </div>
          ))}
        </div>
        {multiple && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={() => onConfirm(picked)} className="rounded-md bg-[#0B5CAD] px-3 py-1.5 text-xs font-medium text-white">
              Use {picked.length} asset{picked.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationNode({
  location,
  siteId,
  chosen,
  onPick,
}: {
  location: DrilldownLocation;
  siteId: string;
  chosen: Set<string>;
  onPick: (row: AssetSelection) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="ml-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 px-1 py-1 text-xs font-medium text-gray-700">
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {location.location_id}
        <span className="font-normal text-gray-400">{location.description}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-gray-100 pl-1">
          {(location.assets || []).map((asset) => (
            <AssetNode key={asset.asset_id} asset={asset} siteId={siteId} locationId={location.location_id} chosen={chosen} onPick={onPick} />
          ))}
          {(location.children_locations || []).map((child) => (
            <LocationNode key={child.location_id} location={child} siteId={siteId} chosen={chosen} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetNode({
  asset,
  siteId,
  locationId,
  chosen,
  onPick,
}: {
  asset: DrilldownAsset;
  siteId: string;
  locationId?: string | null;
  chosen: Set<string>;
  onPick: (row: AssetSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const row = { asset_id: asset.asset_id, site_id: siteId, location_id: locationId || asset.location_id, name: asset.name };
  const on = chosen.has(`${siteId}:${asset.asset_id}`);
  const children = asset.children || [];
  return (
    <div>
      <div className="flex items-center">
        {children.length > 0 ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="p-1 text-gray-400">
            <ChevronRight className={`h-3 w-3 ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : <span className="w-5" />}
        <button
          type="button"
          onClick={() => onPick(row)}
          className={`flex flex-1 items-center justify-between rounded px-1 py-1 text-left text-xs hover:bg-gray-50 ${on ? 'bg-blue-50' : ''}`}
        >
          <span className="font-medium text-gray-900">{asset.asset_id}</span>
          <span className="text-gray-500">{asset.name}</span>
        </button>
      </div>
      {open && children.map((child) => (
        <div key={child.asset_id} className="ml-4">
          <AssetNode asset={child} siteId={siteId} locationId={locationId} chosen={chosen} onPick={onPick} />
        </div>
      ))}
    </div>
  );
}
