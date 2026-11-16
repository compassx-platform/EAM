import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, ListTree, Search, X } from 'lucide-react';
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

const sameAsset = (a: AssetSelection, b: AssetSelection) => a.asset_id === b.asset_id && a.site_id === b.site_id;

const toSelection = (asset: { asset_id: string; site_id: string; location_id?: string | null; name: string }): AssetSelection => ({
  asset_id: asset.asset_id,
  site_id: asset.site_id,
  location_id: asset.location_id,
  name: asset.name,
});

export function AssetPicker({ value, multiple = false, siteId, readOnly = false, onChange }: AssetPickerProps) {
  const current = multiple ? null : parseAssetValue(value);
  const many = multiple ? parseAssetList(value) : [];
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedLabel = current ? current.name || current.asset_id : '';
  const inputValue = multiple || focused ? query : selectedLabel;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const rows = await api.listAssets({
          site_id: siteId || undefined,
          search: query.trim() || undefined,
        });
        if (!cancelled) {
          setAssets(rows.slice(0, 30));
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load assets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, siteId]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setMenuBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (row: AssetSelection) => {
    if (multiple) {
      if (!many.some((item) => sameAsset(item, row))) onChange(JSON.stringify([...many, row]));
      setQuery('');
    } else {
      onChange(JSON.stringify(row));
      setQuery('');
      inputRef.current?.blur();
    }
    setOpen(false);
    setSheet(false);
  };

  const remove = (row: AssetSelection) => {
    onChange(JSON.stringify(many.filter((item) => !sameAsset(item, row))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(assets.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = assets[highlight];
      if (open && row) choose(toSelection(row));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {multiple && many.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {many.map((row) => (
            <span
              key={`${row.site_id}:${row.asset_id}`}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-800"
            >
              {row.name || row.asset_id}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(row)}
                  className="rounded text-gray-400 hover:text-gray-700"
                  aria-label={`Remove ${row.name || row.asset_id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div
        ref={anchorRef}
        className={`flex w-full items-stretch overflow-hidden rounded-md border bg-white shadow-2xs ${
          focused ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-300'
        } ${readOnly ? 'bg-gray-100' : ''}`}
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={inputValue}
            disabled={readOnly}
            placeholder={multiple ? 'Type to add an asset' : 'Type to search assets'}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            onFocus={() => {
              if (readOnly) return;
              setFocused(true);
              setQuery('');
              setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="w-full border-0 bg-transparent px-3 py-2 pr-7 text-xs text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-500"
          />
          {!multiple && current && !focused && !readOnly && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700"
              aria-label="Clear equipment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={readOnly}
          title="Browse asset hierarchy"
          aria-label="Browse asset hierarchy"
          onClick={() => {
            setOpen(false);
            setSheet(true);
          }}
          className="inline-flex shrink-0 items-center border-l border-gray-200 px-2.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListTree className="h-4 w-4" />
        </button>
      </div>
      {open && menuBox && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
          className="fixed z-[70] max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          {loading && assets.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Searching assets…</p>}
          {!loading && assets.length === 0 && !error && (
            <p className="px-3 py-2 text-xs text-gray-400">{query.trim() ? 'No assets match' : 'No assets available'}</p>
          )}
          {assets.map((asset, index) => {
            const row = toSelection(asset);
            const selected = multiple
              ? many.some((item) => sameAsset(item, row))
              : Boolean(current && sameAsset(current, row));
            return (
              <button
                key={`${asset.site_id}:${asset.asset_id}`}
                type="button"
                role="option"
                aria-selected={selected || index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(row);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left text-xs ${
                  index === highlight ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{asset.name || asset.asset_id}</span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {asset.asset_id}{asset.location_id ? ` · ${asset.location_id}` : ''}
                  </span>
                </span>
                {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
      {sheet && (
        <HierarchySheet
          siteId={siteId}
          multiple={multiple}
          selected={multiple ? many : current ? [current] : []}
          onClose={() => setSheet(false)}
          onConfirm={(rows) => {
            if (multiple) onChange(JSON.stringify(rows));
            else if (rows[0]) onChange(JSON.stringify(rows[0]));
            setSheet(false);
          }}
        />
      )}
    </div>
  );
}

function HierarchySheet({
  siteId,
  multiple,
  selected,
  onClose,
  onConfirm,
}: {
  siteId?: string;
  multiple: boolean;
  selected: AssetSelection[];
  onClose: () => void;
  onConfirm: (rows: AssetSelection[]) => void;
}) {
  const [tree, setTree] = useState<DrilldownSite[]>([]);
  const [picked, setPicked] = useState<AssetSelection[]>(selected);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getDrilldownHierarchy({ site_id: siteId || undefined })
      .then((rows) => {
        if (!cancelled) setTree(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the asset hierarchy');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (row: AssetSelection) => {
    if (!multiple) {
      onConfirm([row]);
      return;
    }
    setPicked((prev) => (
      prev.some((item) => sameAsset(item, row))
        ? prev.filter((item) => !sameAsset(item, row))
        : [...prev, row]
    ));
  };

  const chosen = new Set(picked.map((row) => `${row.site_id}:${row.asset_id}`));
  const q = filter.trim().toLowerCase();
  const visible = q ? tree.map((site) => filterSite(site, q)).filter((site): site is DrilldownSite => Boolean(site)) : tree;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close hierarchy" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{multiple ? 'Select assets' : 'Select equipment'}</h3>
            <p className="text-xs text-gray-500">Choose from the asset hierarchy</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-gray-100 px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter the hierarchy"
              className="w-full rounded-md border border-gray-300 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {error && <p className="px-2 py-2 text-xs text-red-600">{error}</p>}
          {!error && !loaded && <p className="px-2 py-2 text-xs text-gray-400">Loading hierarchy…</p>}
          {!error && loaded && visible.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">No assets in this hierarchy</p>}
          {visible.map((site) => (
            <div key={site.site_id} className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{site.site_name || site.site_id}</p>
              {site.locations_tree.map((location) => (
                <LocationNode key={location.location_id} location={location} siteId={site.site_id} chosen={chosen} onPick={toggle} />
              ))}
              {site.unassigned_assets.map((asset) => (
                <AssetNode key={asset.asset_id} asset={asset} siteId={site.site_id} locationId={asset.location_id} chosen={chosen} onPick={toggle} />
              ))}
            </div>
          ))}
        </div>
        {multiple && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">{picked.length} selected</span>
            <button
              type="button"
              onClick={() => onConfirm(picked)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Use selected
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function filterSite(site: DrilldownSite, q: string): DrilldownSite | null {
  const locations = site.locations_tree
    .map((location) => filterLocation(location, q))
    .filter((location): location is DrilldownLocation => Boolean(location));
  const unassigned = site.unassigned_assets
    .map((asset) => filterAsset(asset, q))
    .filter((asset): asset is DrilldownAsset => Boolean(asset));
  const self = `${site.site_id} ${site.site_name || ''}`.toLowerCase().includes(q);
  if (!self && locations.length === 0 && unassigned.length === 0) return null;
  return {
    ...site,
    locations_tree: self && locations.length === 0 ? site.locations_tree : locations,
    unassigned_assets: self && unassigned.length === 0 ? site.unassigned_assets : unassigned,
  };
}

function filterLocation(location: DrilldownLocation, q: string): DrilldownLocation | null {
  const assets = (location.assets || [])
    .map((asset) => filterAsset(asset, q))
    .filter((asset): asset is DrilldownAsset => Boolean(asset));
  const children = (location.children_locations || [])
    .map((child) => filterLocation(child, q))
    .filter((child): child is DrilldownLocation => Boolean(child));
  const self = `${location.location_id} ${location.description || ''}`.toLowerCase().includes(q);
  if (!self && assets.length === 0 && children.length === 0) return null;
  return {
    ...location,
    assets: self ? location.assets : assets,
    children_locations: children,
  };
}

function filterAsset(asset: DrilldownAsset, q: string): DrilldownAsset | null {
  const children = (asset.children || [])
    .map((child) => filterAsset(child, q))
    .filter((child): child is DrilldownAsset => Boolean(child));
  const self = `${asset.asset_id} ${asset.name}`.toLowerCase().includes(q);
  if (!self && children.length === 0) return null;
  return { ...asset, children: self ? asset.children : children };
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
    <div className="ml-1">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs font-medium text-gray-700 hover:bg-gray-50">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span>{location.description || location.location_id}</span>
        <span className="truncate font-normal text-gray-400">{location.location_id}</span>
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
  const [open, setOpen] = useState(true);
  const row = toSelection({ ...asset, site_id: siteId, location_id: locationId || asset.location_id });
  const on = chosen.has(`${siteId}:${asset.asset_id}`);
  const children = asset.children || [];
  return (
    <div>
      <div className="flex items-center">
        {children.length > 0 ? (
          <button type="button" onClick={() => setOpen((value) => !value)} className="p-1 text-gray-400" aria-label={`Expand ${asset.name}`}>
            <ChevronRight className={`h-3.5 w-3.5 ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : <span className="w-5" />}
        <button
          type="button"
          onClick={() => onPick(row)}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1 py-1 text-left text-xs hover:bg-gray-50 ${on ? 'bg-blue-50' : ''}`}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium text-gray-900">{asset.name || asset.asset_id}</span>
            <span className="block truncate text-[11px] text-gray-500">{asset.asset_id}</span>
          </span>
          {on && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
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
