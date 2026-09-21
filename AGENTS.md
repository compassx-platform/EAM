# Repository Development & UI Guidelines

All AI coding agents working within this repository must adhere to the design principles and architecture standards below:

## 1. UI & Progressive Disclosure Standards

- **Progressive Disclosure:** Keep interfaces clean, direct, and uncluttered. Avoid exposing nested settings, full JSON schemas, or long explanatory text upfront. Reveal advanced modals, condition editors, or sidebars strictly on user action.
- **Low-Color Restraint:** Use neutral slate/gray typography and badges (`text-gray-700`, `bg-gray-100`, `border-gray-200`). Do NOT use saturated red/green text or high-contrast background boxes for standard routing labels or outlet points.
- **Hover Tooltips:** Replace bulky multi-line descriptive text with compact `Info` icons that reveal clean markdown tooltips on hover.
- **1-Click Actions:** Condition selectors and dropdown menus must open on the first click without intermediate layers.

## 2. Workflow Builder Architecture

- **Router Node Logic:** Condition evaluation is hosted on the Router node itself. The outgoing handles (`TRUE` and `FALSE`) are dedicated directional outlets.
- **Outlet Constraints:** Each router outlet allows strictly ONE connection (reconnecting replaces the existing target).
- **Protected Router Branches:** Outgoing router branches and incoming connections to target states originating from routers must NEVER expose event creation, event renaming, or transition-level condition editors.
- **Context Routing:** Selecting an outgoing router branch or wire redirects selection context directly to the source Router Node inspector.

## 3. Verification & Safety

- **No Early Builds:** Do NOT run `npm run build` until explicitly requested by the user at the very end of a task.
- **Continuous Validation:** Run `npx tsc --noEmit` and `PYTHONPATH=. pytest tests/` to guarantee 0 regressions across frontend and backend.
- **Skill Reference:** Refer to `.agents/skills/clean-ui-progressive-disclosure/SKILL.md` for full implementation patterns and component blueprints.

