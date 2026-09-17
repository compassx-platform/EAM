---
name: clean-ui-progressive-disclosure
description: >-
  Architectural patterns, UX standards, and component blueprints for building clean,
  low-color, progressive disclosure interfaces, inspector sidebars, and contextually
  anchored live dialogs across the platform.
---

# Clean UI & Progressive Disclosure Architecture

This guide establishes the mandatory UI/UX standards, design system rules, and component implementation patterns for all frontend development across forms, workflow builders, inspectors, and modal dialogs in this repository.

---

## 1. Core UX Philosophy: The 2-Level Progressive Disclosure Hierarchy

Complex configuration must never be exposed all at once in bulky forms, deeply nested card boxes, or full-screen blocking overlays. Instead, all interfaces must follow a strict **Two-Level Progressive Disclosure Hierarchy**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: Inspector Surface (Sidebar / Settings Pane)                         │
│  • Clean horizontal dividers (border-t border-gray-100 pt-3), unboxed.     │
│  • Shows only high-level sections and active selection summaries.           │
│  • Icon-only actions:                                                       │
│      [+] Add / Assign a new rule, condition, group, or option              │
│      [-] Remove / Unassign the active selection (symmetrical pair)          │
│      [⋮] (MoreVertical) Open Level 2 deep configuration dialog             │
│      [ℹ] (Info) Compact hover tooltip for explanatory documentation         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ (1-Click trigger with vertical anchorY)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: Contextually Anchored Floating Dialog                               │
│  • Docked beside the inspector (e.g. fixed right-[332px], no dark backdrop).│
│  • Contextually anchored: dynamic `top` aligned to the clicked button.      │
│  • Pointer Caret: 45° diamond notch visually connecting dialog to button.   │
│  • Live Feedback: changes immediately update form canvas in real time.      │
│  • Dismissal: closes smoothly on outside click or Esc key.                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design System & Low-Color Restraint Rules

### Rule 1: Low-Color Restraint & Neutral Foundations
* **Neutral Palette First:** Use neutral slate/gray typography and elements (`text-gray-700`, `text-gray-500`, `text-gray-400`, `bg-gray-100`, `border-gray-200`, `bg-white`).
* **No Saturated Badges or Outlets:** Never use saturated bright green/red/yellow background boxes or bright pill badges for standard labels, handles, or routing outlets.
* **Intentional Brand Accent:** Reserve primary blue (`text-blue-700`, `bg-blue-600`, `border-blue-500`) strictly for active interactive states, links, and selected items.
* **Warning / Alert Tone:** Use soft amber (`bg-amber-50 text-amber-800 border-amber-200`) for non-blocking notices/required tags, and soft red (`text-red-600 hover:bg-red-50`) strictly for destructive removals.

### Rule 2: Unboxed Separation (Dividers over Nested Boxes)
* **Remove Heavy Card Boxes:** Do not wrap inspector sections in nested rounded bordered boxes (`border border-gray-200 bg-gray-50 rounded-xl p-3`).
* **Use Clean Horizontal Dividers:** Separate high-level sections with a minimalist divider line: `border-t border-gray-100 pt-3`.
* **Borderless Icon Action Buttons:** Action buttons must be borderless icon buttons (`rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors`). Avoid wrapping individual icons in heavy shadow boxes or thick borders.

### Rule 3: Icon Semantics & Symmetrical Pairing
Always use exact, standard icons from `lucide-react`:
* **`Plus` (`+`):** Add or assign a new section, condition, group, or choice.
* **`Minus` (`-`):** Remove, clear, or unassign an active selection or rule. Symmetrically pairs with `+` for intuitive add/remove ergonomics. Never use `X` or `Trash2` for simple unassigning in inspector rows.
* **`MoreVertical` (`⋮`):** Vertical three dots for opening the Level 2 deep configuration dialog. Always use vertical `MoreVertical` (never horizontal `MoreHorizontal`).
* **`Info` (`ℹ`):** Information tooltip icon.
* **`ShieldCheck` / `ShieldPlus`:** Condition and rule indicators.

### Rule 4: Progressive Hover Tooltips
* **Eliminate Explanatory Text Blocks:** Never place static 2–3 line descriptive text paragraphs directly on the inspector surface.
* **Use `InfoTooltip`:** Place a compact `Info` icon next to section titles that reveals a dark markdown tooltip on hover.

---

## 3. Level 1: Inspector High-Level Section Pattern

Each high-level section (e.g. *Options & Choices*, *Conditional Logic*, *Form Group*, *File Upload Rules*, *General Settings*) follows this two-state structure:

### State A: Unconfigured (Default)
Displays the section title with its icon, tooltip, and an icon-only `+` (`Plus`) button on the right:

```tsx
<div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
        Conditional Logic
      </span>
      <InfoTooltip text="Link condition definitions from the Central Conditions module." />
    </div>

    {!hasCondition && (
      <button
        type="button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const anchor = rect.top + rect.height / 2;
          onOpenConditionSelector(anchor);
        }}
        title="Add condition"
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
</div>
```

### State B: Configured (Selection Active)
When configured, the section displays the selected item or dropdown selector with two icon-only action buttons:
1. `MoreVertical` (`⋮`): Open Level 2 deep configuration dialog.
2. `Minus` (`-`): Remove or unassign the current configuration.

```tsx
{hasCondition && (
  <div className="flex items-center gap-1.5">
    {/* Clean, compact selector or display pill */}
    <div className="flex-1 min-w-0">
      <select
        value={selectedConditionId}
        onChange={(e) => onSelectCondition(e.target.value)}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
      >
        {conditions.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>

    {/* Level 2 Deep Configure Dialog Trigger */}
    <button
      type="button"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const anchor = rect.top + rect.height / 2;
        onOpenConfigDialog(anchor);
      }}
      title="Configure condition"
      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      <MoreVertical className="h-3.5 w-3.5" />
    </button>

    {/* Remove / Unassign Button */}
    <button
      type="button"
      onClick={onRemoveCondition}
      title="Remove condition"
      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
  </div>
)}
```

---

## 4. Level 2: Contextually Anchored Floating Dialog Pattern

Level 2 configuration editors must open as **docked, floating non-modal dialogs beside the inspector** instead of full-screen overlays with blocking backdrops.

### Key Requirements:
1. **No Canvas Obstruction:** No full-screen backdrop overlay (`bg-black/50`). The user must see the form preview / canvas update in real-time as they edit.
2. **Contextual Alignment:** The dialog vertically aligns (`top`) near the trigger button using `anchorY`.
3. **Pointer Caret Notch:** A 45-degree diamond arrow on the right edge of the dialog points directly at the clicked trigger button.
4. **Outside Click Dismissal:** Clicking outside the dialog closes it automatically.

### Anchor Calculation Utility:

```tsx
/**
 * Computes viewport-clamped `top` and pointer caret `arrowTop` offset
 * based on the trigger button's vertical center (`anchorY`).
 */
export function computeAnchoredDialogStyle(anchorY?: number, estimatedHeight: number = 380) {
  if (anchorY === undefined || anchorY === null) {
    return { top: 120, arrowTop: 40 };
  }

  const padding = 16;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxTop = Math.max(padding, viewportHeight - estimatedHeight - padding);

  // Center dialog around anchorY, clamped within viewport bounds
  const rawTop = anchorY - Math.min(60, estimatedHeight * 0.2);
  const clampedTop = Math.max(padding, Math.min(rawTop, maxTop));

  // Caret arrow points exactly to trigger button anchorY
  const rawArrow = anchorY - clampedTop;
  const clampedArrow = Math.max(16, Math.min(rawArrow, estimatedHeight - 24));

  return {
    top: clampedTop,
    arrowTop: clampedArrow,
  };
}
```

### Complete Anchored Dialog Component Blueprint:

```tsx
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface AnchoredDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  anchorY?: number;
  widthClass?: string; // e.g. "w-[380px]" or "w-[480px]"
  children: React.ReactNode;
}

export const AnchoredDialog: React.FC<AnchoredDialogProps> = ({
  isOpen,
  onClose,
  title,
  anchorY,
  widthClass = 'w-[380px]',
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 400);

  // Outside click dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className={`fixed right-[332px] z-50 ${widthClass} rounded-xl border border-gray-200 bg-white shadow-2xl transition-all duration-150 animate-in fade-in zoom-in-95`}
    >
      {/* Pointer Notch pointing toward the inspector trigger button */}
      <div
        style={{ top: `${arrowTop}px` }}
        className="pointer-events-none absolute -right-[7px] h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white shadow-sm"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body with live controls */}
      <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-4 space-y-4">
        {children}
      </div>
    </div>
  );
};
```

---

## 5. Workflow Builder Architecture & Router Node Patterns

When developing workflow graph nodes, router outlets, and state machine inspectors:

### Pattern A: Router-Hosted Condition Logic
* Condition logic is evaluated exclusively on the Router Node itself.
* The outgoing handles (`TRUE` and `FALSE`) are dedicated directional outlets.

### Pattern B: Low-Color Unboxed Outlets
* Outlets on Router nodes must use minimalist, unboxed slate styling without heavy saturated colors:

```tsx
// Unboxed Router Handles in Canvas StateNode
{kind === 'router' && (
  <>
    <div className="absolute right-2 top-[30%] -translate-y-1/2 flex items-center pointer-events-none select-none">
      <span className="text-[9px] font-mono font-bold text-gray-600">TRUE</span>
    </div>
    <Handle
      id="TRUE"
      type="source"
      position={Position.Right}
      style={{ top: '30%' }}
      className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500 hover:!scale-125 transition-transform"
    />

    <div className="absolute right-2 top-[70%] -translate-y-1/2 flex items-center pointer-events-none select-none">
      <span className="text-[9px] font-mono font-bold text-gray-600">FALSE</span>
    </div>
    <Handle
      id="FALSE"
      type="source"
      position={Position.Right}
      style={{ top: '70%' }}
      className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500 hover:!scale-125 transition-transform"
    />
  </>
)}
```

### Pattern C: Strict Single-Connection Outlet Constraint
* Each router outlet allows strictly ONE destination edge.
* Dragging a new connection from an outlet that already has a wire automatically updates the existing edge's target destination without creating duplicate wires.
* Selection context immediately switches to the source router inspector.

```tsx
if (isRouter) {
  const existingBranchEdge = edgesRef.current.find(
    (e) => e.source === connection.source && e.data?.event === defaultEvent
  );
  if (existingBranchEdge) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === existingBranchEdge.id
          ? { ...e, target: connection.target as string, sourceHandle }
          : e
      )
    );
    setSelection({ kind: 'node', id: connection.source as string });
    return;
  }
}
```

### Pattern D: Protected Router Branches
* Outgoing router branches and incoming connections to target states originating from routers must **NEVER** expose event creation, event renaming, or transition-level condition editors.
* Selecting an outgoing router branch redirects selection context directly to the source Router Node inspector.

---

## 6. Verification & Safety Checklist

Whenever building or modifying any component in this application, verify all items below:

- [ ] **2-Level Hierarchy:** Are high-level sections in Level 1 (inspector) kept clean and unboxed, with complex settings delegated to Level 2 anchored dialogs?
- [ ] **No Visual Noise:** Are unnecessary outer boxes, nested frames, and redundant background tints eliminated?
- [ ] **Minimal Low-Color:** Are typography and tags using neutral grays (`text-gray-700`, `bg-gray-100`, `border-gray-200`) instead of bright greens, reds, or yellows?
- [ ] **Icon-Only Actions:** Are section buttons icon-only (`+` to add/assign, `-` to remove, `⋮` (`MoreVertical`) to configure)?
- [ ] **Progressive Tooltips:** Are lengthy descriptive paragraphs replaced with a compact `InfoTooltip` hover icon?
- [ ] **Anchored Non-Modal Dialogs:** Do Level 2 dialogs open beside the inspector with dynamic `top`, pointer notch caret, outside click dismissal, and NO full-screen backdrop?
- [ ] **Live Form Feedback:** Do changes in Level 2 dialogs immediately update the canvas / form in real time?
- [ ] **Router Node Constraints:** Are router outlets restricted to 1 connection and protected from transition-level event editing?
- [ ] **Continuous Validation:** Do `npx tsc --noEmit` and `PYTHONPATH=. pytest tests/` pass with 0 errors?

