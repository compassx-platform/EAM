import { useState, useRef } from 'react';
import {
  Plus,
  Heading,
  Layers,
  Search,
  Info,
  Database,
  Check,
} from 'lucide-react';
import { FIELD_TYPE_DEFS, getFieldTypeIcon, type FieldTypeDef } from './formUtils';
import type { EntityField, GenericFieldType } from '../../types';

interface FormPaletteProps {
  registeredFields: EntityField[];
  placedFieldNames: Set<string>;
  onAddHeading: () => void;
  onAddGroup: () => void;
  onAddField: (type: GenericFieldType) => void;
  onAddRegisteredField: (field: EntityField) => void;
}

function InfoTooltip({ text }: { text: string }) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
      });
    }
  };

  const handleMouseLeave = () => {
    setCoords(null);
  };

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
        title={text}
        className="rounded p-1 text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-gray-200/60 hover:text-gray-700"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {coords && (
        <div
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-50 -translate-y-1/2 pointer-events-none max-w-xs rounded-md border border-gray-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-xl"
        >
          {text}
        </div>
      )}
    </>
  );
}

export function FormPalette({
  registeredFields,
  placedFieldNames,
  onAddHeading,
  onAddGroup,
  onAddField,
  onAddRegisteredField,
}: FormPaletteProps) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();

  const filteredDefs = FIELD_TYPE_DEFS.filter(
    (d) =>
      !q ||
      d.label.toLowerCase().includes(q) ||
      d.hint.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q)
  );

  const basicDefs = filteredDefs.filter((d) => d.category === 'basic');
  const dateDefs = filteredDefs.filter((d) => d.category === 'date');
  const choiceDefs = filteredDefs.filter((d) => d.category === 'choice');
  const advancedDefs = filteredDefs.filter((d) => d.category === 'advanced');

  const filteredRegistered = registeredFields.filter(
    (f) => !q || f.field_name.toLowerCase().includes(q) || f.field_type.toLowerCase().includes(q)
  );

  const renderFieldButton = (def: FieldTypeDef) => {
    const Icon = getFieldTypeIcon(def.type);
    return (
      <div key={def.type} className="group relative flex items-center">
        <button
          type="button"
          onClick={() => onAddField(def.type)}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-blue-600 transition-colors" />
          <span className="truncate">{def.label}</span>
          <Plus className="ml-auto h-3 w-3 shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-blue-600 transition-opacity" />
        </button>

        {/* Hover info tooltip */}
        <InfoTooltip text={def.hint} />
      </div>
    );
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Search Bar integrated into panel */}
      <div className="p-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields &amp; widgets…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50/70 py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Palette Items Scrollable List */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3 pt-1">
        {/* Structure Section */}
        {(!q || 'section heading form group layout'.includes(q)) && (
          <div className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Structure &amp; Layout
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="group relative flex items-center">
                <button
                  type="button"
                  onClick={onAddHeading}
                  className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  <Heading className="h-3.5 w-3.5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                  <span>Section Heading</span>
                  <Plus className="ml-auto h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-indigo-600 transition-opacity" />
                </button>
                <InfoTooltip text="Visual section header and divider to organize fields" />
              </div>

              <div className="group relative flex items-center">
                <button
                  type="button"
                  onClick={onAddGroup}
                  className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  <Layers className="h-3.5 w-3.5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                  <span>Form Group</span>
                  <Plus className="ml-auto h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-purple-600 transition-opacity" />
                </button>
                <InfoTooltip text="Boxed grouping container to visually organize related fields" />
              </div>
            </div>
          </div>
        )}

        {/* Input Fields */}
        {basicDefs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Input Fields
            </span>
            <div className="flex flex-col gap-0.5">{basicDefs.map(renderFieldButton)}</div>
          </div>
        )}

        {/* Choices & Selection */}
        {choiceDefs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Selection &amp; Choices
            </span>
            <div className="flex flex-col gap-0.5">{choiceDefs.map(renderFieldButton)}</div>
          </div>
        )}

        {/* Date & Time */}
        {dateDefs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Dates &amp; Times
            </span>
            <div className="flex flex-col gap-0.5">{dateDefs.map(renderFieldButton)}</div>
          </div>
        )}

        {/* Advanced & Lists */}
        {advancedDefs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Advanced &amp; Lists
            </span>
            <div className="flex flex-col gap-0.5">{advancedDefs.map(renderFieldButton)}</div>
          </div>
        )}

        {/* Registered Entity Schema Fields (if any) */}
        {filteredRegistered.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between px-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <Database className="h-3 w-3 text-blue-700" />
                Entity Schema ({registeredFields.length})
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {filteredRegistered.map((f) => {
                const isPlaced = placedFieldNames.has(f.field_name);
                return (
                  <button
                    key={f.field_name}
                    type="button"
                    onClick={() => onAddRegisteredField(f)}
                    className={`group flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isPlaced
                        ? 'text-gray-400 cursor-default hover:bg-gray-50'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-medium">{f.field_name}</span>
                      <span className="ml-1 font-mono text-[9px] text-gray-400">({f.field_type})</span>
                    </div>
                    {isPlaced ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-gray-400">
                        <Check className="h-3 w-3 text-emerald-600" /> on form
                      </span>
                    ) : (
                      <Plus className="h-3 w-3 shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:text-blue-600 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
