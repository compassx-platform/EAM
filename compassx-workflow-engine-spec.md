# CompassX Workflow Engine — v1 Spec

**Spec owner:** Vishal
**Status:** Ready for build
**Scope:** Standalone app. Generic event-sourced workflow/state-machine engine with a closed, composable gate (business-rule) layer. Two entity types at launch: **WorkOrder** and **Permit to Work**, with Permit gating WorkOrder transitions.

---

## 1. Purpose & Positioning

This app is a general-purpose workflow engine, not a work-order tool that happens to be extensible. It is built once, generically, and WorkOrder and Permit are the first two of what should be an arbitrary number of future entity types registered against the same underlying mechanism (Alert being the most likely third, explicitly deferred — see §12).

It is deployed as a **standalone CompassX app** via the App Module pipeline. It has no dependency on CompassX's catalog, ontology, or Nova — it owns its own database, its own user/auth model, and its own UI end to end.

**Design lineage:** built on the classic EAM/Maximo design philosophy (generic object model + configuration-over-customization) re-expressed as an event-sourced, CQRS-structured engine with a hard-separated deterministic gate layer, so business logic stays user-configurable while safety/compliance-relevant enforcement never can be bypassed by workflow design alone.

---

## 2. Architecture Principles (locked, non-negotiable)

1. **Event Sourcing.** Every entity's true state is derived from an append-only, immutable event log. Current-state tables are a cache, always rebuildable by replaying events from scratch.
2. **CQRS.** Writes go through one command path (`propose_transition`). Reads go against materialized current-state tables. The two are never the same code path.
3. **One write path, no exceptions.** No UI, API consumer, or future integration may mutate a current-state table directly. Every state change is `propose_transition`, full stop.
4. **Gates are the only enforcement mechanism, and they are structurally separate from workflow orchestration.** A workflow definition can freely rearrange states/transitions/approvers; it can only ever *reference* gates from a closed, fixed-implementation registry — it can never define new gate logic inline.
5. **Configuration over customization.** Workflows, gate attachments, and custom fields are user-editable data. Gate *implementations* and the core engine are fixed code, changed only by the app's own developers.
6. **Explicit versioning, explicit publish.** Workflow definitions are edited as drafts, validated, then explicitly published as a new immutable version. Live entity instances stay bound to the version they were created under.
7. **Generic engine, entity-specific content.** The event schema, command handler, projector, and gate-evaluation logic are identical across every entity type. Only field schemas and workflow definitions vary per entity type.

---

## 3. Data Model

### 3.1 Entity table shape (fixed across all entity types — Option B: one physical table pair per type, uniform schema)

Every registered entity type gets exactly two tables following this fixed shape. No entity-specific columns beyond `custom_fields`.

**`<entity>` (current-state / query-side table)**

| column | type | notes |
|---|---|---|
| `id` | uuid, PK | stable identity, never reused |
| `entity_type` | text | e.g. `workorder`, `permit` — redundant but useful for generic tooling/queries |
| `status` | text | current state name, matches a state in the bound WorkflowDefinition |
| `workflow_version` | text | e.g. `standard_v3` — the version this instance is bound to, set at creation, immutable after |
| `last_event_id` | uuid | for optimistic concurrency |
| `custom_fields` | jsonb | all entity-specific attributes (e.g. `estimated_cost`, `linked_permit_id`) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`<entity>_event` (event log / command-side table, append-only)**

| column | type | notes |
|---|---|---|
| `event_id` | uuid, PK | |
| `entity_id` | uuid, FK → `<entity>.id` | |
| `event_type` | text | entity-specific vocabulary, e.g. `SUBMITTED`, `ISSUED` |
| `actor_id` | text | user id or system-process id |
| `actor_type` | text | `human` \| `system` |
| `transaction_time` | timestamptz | when recorded — set by the server, never client-supplied |
| `from_state` | text | nullable for `CREATED` |
| `to_state` | text | |
| `payload` | jsonb | free-form: comments, gate evaluation trace, field deltas |

Concrete tables at launch: `workorder`, `workorder_event`, `permit`, `permit_event`.

### 3.2 Field Schema Registry (per entity type)

```
entity_field (
  entity_type   text,
  field_name    text,
  field_type    text,      -- 'text' | 'number' | 'date' | 'select' | 'entity_reference'
  required      boolean,
  select_options jsonb,     -- for field_type = 'select'
  reference_entity_type text, -- for field_type = 'entity_reference', e.g. 'permit'
  created_at    timestamptz,
  PRIMARY KEY (entity_type, field_name)
)
```

Governs (a) what appears in `custom_fields` and how it's validated at write time, (b) what shows up in the condition-builder's field dropdowns for that entity type.

### 3.3 Users, Roles (app-native — D9)

```
app_user (id uuid PK, email text unique, display_name text, active boolean, created_at timestamptz)
app_role (id uuid PK, name text unique)              -- e.g. Supervisor, Manager, Safety Officer
app_user_role (user_id FK, role_id FK, PRIMARY KEY (user_id, role_id))
```

Authentication is app-native (password or app-issued session token) — no platform SSO in v1.

### 3.4 WorkflowDefinition (versioned config, per entity type)

```
workflow_definition (
  id            uuid PK,
  entity_type   text,
  version_label text,        -- e.g. 'standard_v3'
  status        text,        -- 'draft' | 'published' | 'deprecated'
  definition    jsonb,        -- states, transitions, gate references — see §6
  created_by    text,
  created_at    timestamptz,
  published_at  timestamptz nullable
)
```

Immutable once `published`. A new edit always creates a new row with an incremented `version_label`. `deprecated` blocks new bindings but the row is never deleted.

### 3.5 Gate Types (fixed, code-defined — not a DB table; documented here as the closed registry)

| gate_type | parameters | evaluates |
|---|---|---|
| `role_check` | `role` | actor holds the given role |
| `numeric_threshold` | `field`, `operator` (`≤ < ≥ > =`), `value` | entity's `custom_fields[field]` vs `value` |
| `field_not_empty` | `field` | `custom_fields[field]` is present and non-empty |
| `date_check` | `field`, `operator`, `value` | date comparison on `custom_fields[field]` |
| `related_entity_status_check` | `relationship_field`, `target_entity_type`, `required_status` (or `target_field` + `operator` + `value`) | follows `custom_fields[relationship_field]` (an `entity_reference`) to the target entity, checks its `status` (or a field on it) |

### 3.6 Gate Instances (parameterized, reusable, per entity type)

```
gate_instance (
  id            uuid PK,
  entity_type   text,
  gate_type     text,        -- FK to the fixed registry above
  label         text,        -- human-readable, shown in the builder UI
  params        jsonb,        -- e.g. {"field":"estimated_cost","operator":"≤","value":10000}
  failure_policy text        -- 'block' | 'allow'
)
```

Referenced by id inside a `workflow_definition.definition.transitions[].gates[]`.

---

## 4. Event Type Vocabulary

### WorkOrder
`CREATED, SUBMITTED, APPROVED, REJECTED, STARTED, COMPLETED, REOPENED, CANCELLED, CLOSED, COMMENT_ADDED`

### Permit to Work
`CREATED, RISK_ASSESSMENT_STARTED, RISK_ASSESSMENT_COMPLETED, ISSUED, ACTIVATED, HANDED_BACK, EXPIRED, CANCELLED, CLOSED, COMMENT_ADDED`

`EXPIRED` is the one event type expected to be raised by a **system actor** (a scheduled check comparing `custom_fields.expiry_date` to now) rather than a human — see §7.3.

---

## 5. Command API (write path — CQRS command side)

### `POST /api/{entity_type}/transition`

```json
{
  "entity_id": "uuid",
  "event_type": "APPROVED",
  "actor_id": "alice@company.com",
  "payload": { "comment": "optional" }
}
```

**Server-side sequence (identical code for every entity type):**
1. Load `<entity>` row by `entity_id` → get `status`, `workflow_version`, `last_event_id`.
2. Load the bound `workflow_definition` (by `entity_type` + `workflow_version`).
3. Look up `(from_state=status, event_type)` in `definition.transitions`. Not found → reject `invalid_transition`.
4. For each `gate_id` on that transition: load `gate_instance`, dispatch to the matching fixed gate-type implementation, evaluate against the entity's current `custom_fields` (and, for `related_entity_status_check`, the referenced entity's row). Gate unresolvable (e.g., data missing) → apply its `failure_policy`.
5. Any gate fails (post-policy) → reject with `{gate_failed: gate_instance.label, reason}`. No write occurs.
6. All gates pass → **single transaction**: append row to `<entity>_event`; update `<entity>` row (`status = to_state`, `last_event_id = new_event_id`, `updated_at = now()`), guarded by `WHERE last_event_id = <the value read in step 1>` (optimistic concurrency — 0 rows updated ⇒ reject `stale_write`, caller retries).
7. Return `{accepted: true, new_status, event_id}` or the rejection from step 3/5/6.

### `POST /api/{entity_type}/create`
Same shape, implicitly fires `CREATED` (`from_state = null`), assigns a new `id`, binds `workflow_version` to the currently published version for that `entity_type` at creation time.

### `POST /api/{entity_type}/simulate`
Identical to `/transition` through step 5 only — never reaches step 6 (no event written). Returns the full gate-by-gate pass/fail trace. Powers the "Try it" UI panel (D11).

---

## 6. WorkflowDefinition JSON Shape

```json
{
  "entity_type": "permit",
  "version_label": "permit_v1",
  "states": ["Requested", "RiskAssessed", "Issued", "Active", "HandedBack", "Closed", "Expired", "Cancelled"],
  "transitions": [
    {"from": "Requested", "event": "RISK_ASSESSMENT_COMPLETED", "to": "RiskAssessed", "gates": []},
    {"from": "RiskAssessed", "event": "ISSUED", "to": "Issued",
     "gates": ["gate_role_safety_officer"]},
    {"from": "Issued", "event": "ACTIVATED", "to": "Active", "gates": []},
    {"from": "Active", "event": "HANDED_BACK", "to": "HandedBack", "gates": []},
    {"from": "Active", "event": "EXPIRED", "to": "Expired", "gates": []}
  ]
}
```

**Validation rules enforced before a draft can publish:**
- Every `from`/`to` in `transitions` exists in `states`.
- No duplicate `(from, event)` pairs (ambiguous transitions).
- Every `gates[]` id resolves to an existing `gate_instance` for this `entity_type`.
- Every non-terminal state has at least one outgoing transition (warn, not hard block, since some may be intentionally manual-only).

---

## 7. Related-Entity Gate (D8) — the Permit ↔ WorkOrder link

### 7.1 The link itself
`workorder` registers a custom field:
```json
{"entity_type":"workorder","field_name":"linked_permit_id","field_type":"entity_reference","reference_entity_type":"permit","required":false}
```
An admin (or, later, a user filling the work order form) sets `custom_fields.linked_permit_id` to a Permit's `id`.

### 7.2 The gate
```json
{
  "entity_type": "workorder",
  "gate_type": "related_entity_status_check",
  "label": "Linked permit must be Active",
  "params": {
    "relationship_field": "linked_permit_id",
    "target_entity_type": "permit",
    "required_status": "Active"
  },
  "failure_policy": "block"
}
```
Attached to the WorkOrder transition `(SupervisorApproved → InProgress)` (or wherever "physical work actually starts" is in the WorkOrder definition).

### 7.3 Evaluation
On `propose_transition` for the WorkOrder: read `custom_fields.linked_permit_id` → load that `permit` row → compare its `status` to `Active`. Missing/null `linked_permit_id` → policy-dependent (recommend: if the field itself is `required=false`, treat "no permit linked" as gate **pass** — this gate should only block when a permit *is* linked but not yet active; a separate `field_not_empty` gate can independently mandate that a permit must be linked at all, for workflows where that's compulsory).

### 7.4 Permit auto-expiry (D10, system actor)
A scheduled process (external cron / simple polling worker, not part of the core engine) periodically calls:
```
POST /api/permit/transition {entity_id, event_type: "EXPIRED", actor_id: "system:expiry-checker", actor_type: "system"}
```
wherever `custom_fields.expiry_date < now()` and `status = Active`. This is an ordinary `propose_transition` call — no special-cased code path. If a WorkOrder is `InProgress` when its permit expires, that's a real-world hazard the gate model doesn't automatically resolve mid-flight (gates are checked at transition time, not continuously) — flagged as a known v1 limitation, not solved here (see §11).

---

## 8. Query API (read side)

- `GET /api/{entity_type}/{id}` — current-state row + full event history (for the audit/history UI).
- `GET /api/{entity_type}?filter=...` — list view, queries the current-state table directly.
- `GET /api/{entity_type}/{id}/valid-transitions` — given current `status` and bound `workflow_version`, returns the list of `event_type`s legally callable next (drives which action buttons the UI renders) — does **not** evaluate gates (that only happens at actual transition/simulate time), only checks state-machine reachability.

---

## 9. UI Components (generic, parameterized by `entity_type` — D12)

1. **Workflow Canvas** — states as boxes, transitions as arrows, drag-and-drop authoring, side panel per transition (trigger event, allowed roles, attached gates).
2. **Condition Builder** — as prototyped: gate-type dropdown → dynamic fields sourced from `entity_field` for the selected `entity_type` → live plain-English preview → fail-open/fail-closed choice → AND-chained list of gates on a transition.
3. **Simulate Panel** — sample-value form (built from `entity_field`) → calls `/simulate` → per-gate pass/fail trace.
4. **Version/Publish Bar** — draft/published status, validate button (surfaces §6 rule violations inline), publish confirmation, version history dropdown (read-only view of prior versions).
5. **Entity List/Detail Views** — end-user screens: list (query side), detail with action buttons from `valid-transitions`, and a full event-history/audit timeline.
6. **Custom Field Manager** — CRUD over `entity_field`, including `entity_reference` field creation (picking `reference_entity_type` from existing registered entity types).

All six are built once against a generic `entity_type` parameter and must be proven to work unmodified against both WorkOrder and Permit (see checkpoint in step 9 of §13).

---

## 10. Concurrency

Optimistic, via `last_event_id` compare-and-swap on the `UPDATE` in command-handler step 6 (§5). On conflict, caller receives `stale_write` and is expected to re-fetch and retry — no locking, no queueing in v1.

---

## 11. Explicitly Deferred

- Alert entity type (architecture accommodates it via `actor_type=system`, not built)
- Dynamic per-field typed DDL (custom fields stay JSONB, validated at the application layer only)
- Multi-hop related-entity chains (only direct one-hop references supported)
- Continuous/background gate re-evaluation after a transition has already succeeded (the permit-expiry-mid-work scenario, §7.4) — v2 candidate: a background job that raises an `WorkOrder` event or alert if its linked Permit expires while `InProgress`
- Platform SSO / App Module auth handoff (app-native accounts only, D9)
- Notification/External Action connectors
- External-system gates (ERP, SCADA, ServiceNow) — registry stays internal-only
- Inventory, Labor, Procurement, Scheduler, Mobile modules
- Bitemporal valid-time tracking (transaction_time only)
- Independent per-transition workflow versioning (whole-definition versioning only)
- Multi-tenant single deployment (single-tenant per `app_instance`)

---

## 12. Deployment

Standard CompassX App Module packaging: GitHub-connected repo, Dockerfile build (FastAPI backend + React frontend, per App Module scaffold convention), deployed via the existing Heroku-style pipeline, accessed via wildcard subdomain, optionally iframe-embedded in Business Center. Own isolated Postgres schema/database — no shared platform tables, no catalog registration.

---

## 13. Implementation Sequence

1. Provision app database; create `workorder`/`workorder_event`, `permit`/`permit_event` per §3.1. **Checkpoint:** insert/read round-trip both.
2. Build `app_user`/`app_role`/`app_user_role`; basic auth. **Checkpoint:** login, role assignment.
3. Implement `entity_field` registry + validation-on-write for `custom_fields`. **Checkpoint:** invalid field type/value rejected on create.
4. Implement generic `propose_transition` with a hardcoded WorkOrder-only lifecycle (no config layer yet). **Checkpoint:** full WorkOrder lifecycle round-trips via direct API calls.
5. Externalize `workflow_definition` (draft/publish/version per §3.4, §6); rewire step 4 to read from it. **Checkpoint:** editing config JSON changes behavior with no code deploy; validation rules from §6 catch a broken draft.
6. Implement fixed gate types (`role_check`, `numeric_threshold`, `field_not_empty`, `date_check`) + `gate_instance` CRUD. **Checkpoint:** invalid transition rejected with named failing gate; failure_policy honored.
7. Register Permit as the second entity type, reusing all code from steps 1–6 unmodified. **Checkpoint:** Permit's own lifecycle (§4) runs end-to-end through the same command handler with zero entity-specific code branches added — this is the genericity proof.
8. Add `entity_reference` field type + `related_entity_status_check` gate (§7). **Checkpoint:** WorkOrder transition correctly blocked/allowed based on linked Permit's live status.
9. Add `actor_type = system` support + a simple scheduled expiry-checker calling `/transition` for Permit (§7.4). **Checkpoint:** a permit auto-transitions to `Expired` with `actor_type=system` in its event row, structurally identical to a human-triggered event.
10. Build generic UI: Canvas, Condition Builder, Simulate Panel, Version/Publish Bar, List/Detail views, Custom Field Manager (§9) — build against WorkOrder first, then point unmodified at Permit. **Checkpoint:** same UI code, different `entity_type` selected, correct field/gate options render for each with no UI code changes.
11. Add optimistic concurrency check (§10). **Checkpoint:** concurrent transition race on the same entity resolves cleanly — one succeeds, one gets `stale_write`.
12. Package via App Module pipeline (§12); deploy to a test workspace. **Checkpoint (full end-to-end):** create a Permit → complete risk assessment → issue it (gated on Safety Officer role) → activate it → create a linked WorkOrder → attempt to start the WorkOrder before the permit is Active (blocked, correct gate named in error) → activate the permit → retry (succeeds) → complete and close the WorkOrder → hand back and close the Permit — all through the deployed app's real UI, full event history visible and correct on both entities throughout.

**Sign-off gate before considering a third entity type (e.g., Alert):** confirm step 7 required zero changes to the event store, command handler, or projector — only new table registration and configuration. If true, the core architectural thesis of this spec is validated.
