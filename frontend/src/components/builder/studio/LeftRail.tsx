import { useState } from 'react';
import {
  LayoutGrid,
  Settings,
  Play,
  Circle,
  ClipboardList,
  ShieldCheck,
  Flag,
  ListChecks,
  Timer,
  Workflow,
  Mail,
  GitFork,
  Search,
  ChevronDown,
} from 'lucide-react';
import { NODE_KINDS, type NodeKind } from '../flowModel';

const KIND_ICONS: Record<NodeKind, typeof Play> = {
  start: Play,
  state: Circle,
  router: GitFork,
  task: ClipboardList,
  gate: ShieldCheck,
  manual: ListChecks,
  wait: Timer,
  sub: Workflow,
  comm: Mail,
  end: Flag,
};

const KIND_ICON_COLORS: Record<NodeKind, string> = {
  start: 'text-emerald-600',
  state: 'text-blue-600',
  router: 'text-purple-600',
  task: 'text-indigo-600',
  gate: 'text-amber-600',
  manual: 'text-violet-600',
  wait: 'text-teal-600',
  sub: 'text-fuchsia-600',
  comm: 'text-sky-600',
  end: 'text-rose-600',
};

interface CategoryGroup {
  id: string;
  label: string;
  kinds: NodeKind[];
}

const CATEGORIES: CategoryGroup[] = [
  {
    id: 'states',
    label: 'Workflow States',
    kinds: ['start', 'state', 'end'],
  },
  {
    id: 'logic',
    label: 'Logic & Branching',
    kinds: ['router', 'gate', 'wait'],
  },
  {
    id: 'tasks',
    label: 'Tasks & Execution',
    kinds: ['task', 'manual', 'sub', 'comm'],
  },
];

interface LeftRailProps {
  onAdd: (kind: NodeKind) => void;
  onAutoArrange: () => void;
  onOpenSettings: () => void;
}

export function LeftRail({ onAdd, onAutoArrange, onOpenSettings }: LeftRailProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const q = search.trim().toLowerCase();

  const kindDefs = new Map(NODE_KINDS.map((k) => [k.kind, k]));

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white select-none">
      {/* Top Header & Search Bar */}
      <div className="p-3.5 pb-2 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-gray-900 tracking-tight">Operators</span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for an operator…"
            className="w-full rounded-md border border-gray-200 bg-gray-50/70 py-1.5 pl-8 pr-2.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Operators List by Category */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
        {CATEGORIES.map((cat) => {
          const matchingKinds = cat.kinds.filter((kind) => {
            const def = kindDefs.get(kind);
            if (!def) return false;
            return !q || def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q);
          });

          if (matchingKinds.length === 0) return null;

          const isCollapsed = Boolean(collapsed[cat.id]);

          return (
            <div key={cat.id} className="flex flex-col gap-1">
              {/* Category Accordion Header */}
              <button
                type="button"
                onClick={() => toggleGroup(cat.id)}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors w-full text-left"
              >
                <ChevronDown
                  className={`h-3 w-3 text-gray-400 transition-transform duration-150 ${
                    isCollapsed ? '-rotate-90' : ''
                  }`}
                />
                <span>{cat.label}</span>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="flex flex-col gap-0.5">
                  {matchingKinds.map((kind) => {
                    const def = kindDefs.get(kind);
                    if (!def) return null;
                    const Icon = KIND_ICONS[kind];
                    const iconColor = KIND_ICON_COLORS[kind] || 'text-gray-600';

                    return (
                      <div
                        key={kind}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/reactflow', kind);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => onAdd(kind)}
                        title={def.description}
                        className="group flex w-full cursor-grab items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-gray-100/70 active:cursor-grabbing"
                      >
                        <div className={`mt-0.5 shrink-0 ${iconColor}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {def.label}
                          </span>
                          <span className="text-[11px] text-gray-500 leading-tight line-clamp-2 mt-0.5">
                            {def.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-100 p-2.5 mt-auto flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onAutoArrange}
          title="Auto arrange the canvas layout"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>Auto Arrange Canvas</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Workflow settings"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>Workflow Settings</span>
        </button>
      </div>
    </aside>
  );
}