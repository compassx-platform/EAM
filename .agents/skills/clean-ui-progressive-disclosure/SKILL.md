---
name: clean-ui-progressive-disclosure
description: >-
  Guidelines, design patterns, and best practices for developing clean, low-color,
  progressive disclosure user interfaces in the workflow builder and platform components.
  Activate this skill whenever designing, modifying, or refactoring UI components,
  sidebar inspectors, canvas nodes, modal dialogs, or connection flows.
---

# Clean UI & Progressive Disclosure Skill Guide

This skill defines the architectural and UX standards for frontend development across the workflow builder, inspector panels, and configuration tools. The goal is to keep interfaces intuitive, modern, uncluttered, and low-cognitive-load by strictly adhering to **Progressive Disclosure** and **Minimalist, Low-Color UI design**.

---

## 1. Core UX & Design Principles

### Principle 1: Progressive Disclosure over Visual Clutter
* **Default Simplicity:** Never overwhelm the user by displaying every setting, JSON definition, nested form, or lengthy explanatory paragraph upfront.
* **On-Demand Depth:** Surface the primary action or high-level summary first. Reveal advanced configurations, full editors, or modals only when the user explicitly triggers an edit or expansion.
* **1-Click Direct Access:** Selectors and dropdowns should trigger immediately upon click without requiring multiple intermediate clicks or confirmation layers.
* **Compact Help Tooltips:** Replace multi-line static explanation paragraphs with clean `Info` icons (`lucide-react`) that display rich tooltip popovers on hover.

### Principle 2: Minimalist Palette & Low-Color Restraint
* **Neutral Foundations:** Primary surfaces, borders, chips, and typography must use neutral gray/slate palettes (`bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-700`, `text-gray-800`).
* **No Saturated Red/Green Clutter:** Do not use bold green, red, or high-saturation colors on text labels, pill backgrounds, or standard connection handles unless communicating a critical destructive error or live terminal state.
* **No Unnecessary Bounding Boxes:** Avoid nesting controls inside multiple background boxes or heavy card containers. Keep label text unboxed and crisp directly alongside its control or handle.
* **Intentional Accent Color:** Reserve primary brand blue (`bg-blue-600`, `text-blue-700`, `border-blue-500`) exclusively for active selection focus and interactive click targets.

### Principle 3: Single Source of Truth & Contextual Unity
* **Node-Hosted Logic:** For nodes that evaluate condition branching (e.g., `RouterNode`), host the condition evaluation and branch targets directly inside the parent node's inspector.
* **Simple Outlet Connections:** Downstream connections from dedicated evaluation nodes (e.g., `TRUE` and `FALSE` outlets) are directional wires that must NOT expose event creation, event renaming, or transition-level conditions.
* **Unified Context Routing:** Clicking a branch connection wire or outlet should seamlessly route selection context to the parent Router Node inspector, keeping the user in a single cohesive workspace.
* **Protected Ingestion Views:** When inspecting a destination state receiving a router branch, render the incoming connection as a clean, read-only route (`from router [Name]`), completely disabling invalid event creation or popup configuration.

---

## 2. Component Design Patterns & Implementations

### Pattern A: Progressive Condition Selection (1-Click & Modal Link)
Instead of forcing users through multi-tab navigation or displaying an entire condition rule builder inside narrow sidebars:
1. Offer a clean, 1-click select dropdown with an integrated "+ Create new condition…" action.
2. When a condition is selected, render a compact card displaying the condition label, atomic expression summary, and quick action icons (Edit in Modal, Remove `-`).
3. Clicking the card opens the full dedicated Condition Module modal.

```tsx
// Example: Progressive Condition Selector
<div className="relative flex flex-col gap-1.5 border-t border-gray-100 pt-3">
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
      Evaluation Condition
      <span className="group relative inline-flex items-center">
        <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
          Evaluates condition logic to automatically route between TRUE and FALSE paths.
        </span>
      </span>
    </span>
  </div>

  {/* 1-Click Dropdown with compact trigger */}
  <button
    type="button"
    onClick={() => setMenuOpen(!menuOpen)}
    className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium text-gray-800 hover:border-gray-300"
  >
    <span className="truncate">{selectedCondition?.label || '— Select a condition —'}</span>
    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
  </button>
</div>
```

---

### Pattern B: Clean, Unboxed Branch Outlets
For canvas nodes with multi-handle routing (like `Router`):
1. Avoid wrapping handles in heavy outer boxes or saturated background badges.
2. Render crisp, unboxed font labels (`TRUE`, `FALSE`) in neutral `text-gray-600` adjacent to neutral `bg-slate-500` handle dots.
3. Position handles at distinct vertical proportions (`top: 30%` for TRUE, `top: 70%` for FALSE).

```tsx
// Example: Unboxed Router Handles in Canvas StateNode
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

---

### Pattern C: Strict Single-Connection Outlet Constraint
When dragging from a specific outlet handle that only allows 1 destination (e.g. binary branches):
1. Detect any existing edge on that handle.
2. Seamlessly update the target destination of the existing edge rather than duplicating edges.
3. Automatically update the selection state to the source node inspector.

```tsx
// Example: Enforcing 1 connection per router outlet
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

---

### Pattern D: Protected Incoming Connection Rows
In standard node inspectors, incoming transitions from normal states are clickable to configure event names and conditions. However, incoming connections originating from a Router Node must be protected:

```tsx
// Example: Distinguishing normal incoming transitions from router branches
{incoming.map((e) => {
  const sourceNode = nodes?.find((n) => n.id === e.source);
  const isFromRouter = sourceNode?.data?.kind === 'router' || Boolean(e.data?.isRouterSource);

  if (isFromRouter) {
    return (
      <div key={e.id} className="flex w-full items-center justify-between py-1.5 px-1 text-xs text-gray-600 bg-gray-50/50 rounded">
        <div className="flex items-center gap-1.5 min-w-0">
          <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold bg-gray-100 text-gray-700">
            {d.event === 'TRUE' ? 'TRUE route' : d.event === 'FALSE' ? 'FALSE route' : d.event}
          </span>
          <span className="min-w-0 truncate text-[11px] text-gray-500">
            from router <span className="font-semibold text-gray-700">{d.from}</span>
          </span>
        </div>
        <button
          type="button"
          title="Disconnect route"
          onClick={() => onRemoveConnection(e.id)}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Standard interactive transition with popup configuration
  return (
    <div key={e.id} className="flex w-full items-center gap-1.5">
      <button onClick={() => openEventPopup(e.id)} className="...">
        ...
      </button>
    </div>
  );
})}
```

---

## 3. Checklist for Future UI Development

Whenever building or modifying any component in this application, verify all items below:

- [ ] **No Visual Noise:** Are unnecessary outer boxes, nested frames, and redundant background tints eliminated?
- [ ] **Minimal Color:** Are text labels and tags using neutral grays (`text-gray-700`, `bg-gray-100`) instead of aggressive bright greens, reds, or yellows?
- [ ] **No Multi-Click Barriers:** Does clicking a dropdown or card immediately activate the intended selection or editor?
- [ ] **Progressive Tooltips:** Are lengthy descriptive paragraphs replaced with a clean `Info` hover icon?
- [ ] **Clean Handle Constraints:** Are outgoing router outlets constrained to 1 connection per handle?
- [ ] **Event Protection:** Is event creation/configuration properly disabled on router outlet edges and on destination nodes receiving router branches?
- [ ] **Type Safety & Testing:** Do `npx tsc --noEmit` and `PYTHONPATH=. pytest tests/` pass with 0 errors?
