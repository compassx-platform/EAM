import { ChevronDown, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{children}</label>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-gray-400">{hint}</p>}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  tone = 'default',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  tone?: 'default' | 'danger' | 'success';
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors';
  const tones = {
    default: active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-gray-300 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
    danger: active
      ? 'border-red-600 bg-red-600 text-white'
      : 'border-red-200 bg-white text-red-600 hover:bg-red-50',
    success: active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-emerald-700',
  };
  if (!onClick) {
    return <span className={`${base} cursor-default ${tones[tone]}`}>{children}</span>;
  }
  return (
    <button type="button" onClick={onClick} className={`${base} cursor-pointer ${tones[tone]}`}>
      {children}
    </button>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ key: T; label: string }>;
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            value === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Underline / Material-style tabs: compact text with a darker accent line on the active tab. */
export function UnderlineTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ key: T; label: string }>;
}) {
  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            value === t.key ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Native <details> accordion — content is revealed only when the user asks. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details
      className="group rounded-lg border border-gray-200 bg-gray-50/60 open:bg-white"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-2.5 pb-2.5">{children}</div>
    </details>
  );
}

export function DashedButton({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 ${className}`}
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export function ModalShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}