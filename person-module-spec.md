# CompassX Person & Person Group Module — Phase 1 Spec

**Status:** Draft for build
**Scope:** Person identity + Person Groups (teams), modeled on IBM Maximo `People` / `Person Groups`
**Design lineage note (§3.3 of `compassx-workflow-engine-spec.md`):** Person is **master data, NOT a generic workflow entity**. It ships alongside `app_user / app_role` as app-native registry data (like Maximo `PERSON`), it does NOT get `workflow_definition`, `states/transitions`, `valid-transitions`, or a replayable event projector. Lifecycle is a status flag + validation rules, matching IBM. Workflows/conditions *reference* Person/Groups; they never drive them.

---

## 1. Scope decisions (from review)

| Decision | Choice |
|---|---|
| Scope | Person + Person Groups only (Labor/Craft/Availability deferred) |
| `workorder.assigned_to` | Migrate in place: `text` → `entity_reference → person` |
| Person lifecycle | Master-data CRUD + `ACTIVE/INACTIVE` flag with IBM-style inactivation blockers (no event sourcing) |
| Person ↔ User | 1:1 optional (a Person may exist with no login; a User must have a Person) — Maximo rule |

---

## 2. Data Model (DDL)

### 2.1 `person`

System-level master identity, mirroring `PERSON`. `person_id` is the stable identifier **and** the accepted `actor_id` everywhere in the platform (like Maximo `PERSONID`).

```sql
CREATE TABLE person (
  person_id             VARCHAR(50)  PRIMARY KEY,          -- UPPER by default (email local-part upcased), Maximo PERSONID analogue
  display_name          VARCHAR(255) NOT NULL,
  first_name            VARCHAR(100) NULL,
  last_name             VARCHAR(100) NULL,
  primary_email         VARCHAR(255) NULL,                 -- distinct from app_user.email (optional contact)
  phone                 VARCHAR(50)  NULL,
  site                  VARCHAR(50)  NULL,                 -- e.g. 'HQ' (default context)
  supervisor_id         VARCHAR(50)  NULL REFERENCES person(person_id),
  primary_calendar      VARCHAR(50)  NULL,                 -- free key; availability stub uses it later
  primary_shift         VARCHAR(50)  NULL,
  workflow_delegate_id  VARCHAR(50)  NULL REFERENCES person(person_id),
  delegate_from         TIMESTAMPTZ  NULL,                 -- workflow routing to delegate window (Maximo)
  delegate_to           TIMESTAMPTZ  NULL,
  status                VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by            VARCHAR(255) NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_status    ON person(status);
CREATE INDEX idx_person_supervisor ON person(supervisor_id);
CREATE INDEX idx_person_email     ON person(primary_email);
```

### 2.2 `person_group`

Named team — Maximo `PERSONGROUP`. Used for `workorder.owner_group`, workflow routing, and (future) crew work groups.

```sql
CREATE TABLE person_group (
  group_name        VARCHAR(50)  PRIMARY KEY,              -- e.g. 'SHIFT_CREW_A'
  description       VARCHAR(255) NULL,
  is_crew_work_group BOOLEAN     NOT NULL DEFAULT FALSE,   -- Maximo Crew Work Group flag (stub for Crews)
  use_for_org       VARCHAR(50)  NULL,                     -- optional org scope
  use_for_site      VARCHAR(50)  NULL,                     -- optional site scope
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### 2.3 `person_group_member`

```sql
CREATE TABLE person_group_member (
  group_name        VARCHAR(50)  NOT NULL REFERENCES person_group(group_name),
  person_id         VARCHAR(50)  NOT NULL REFERENCES person(person_id),
  sequence          INTEGER      NOT NULL DEFAULT 1,       -- workflow routing order (Maximo)
  is_group_default  BOOLEAN      NOT NULL DEFAULT FALSE,
  is_org_default    BOOLEAN      NOT NULL DEFAULT FALSE,
  is_site_default   BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (group_name, person_id),
  UNIQUE (group_name, sequence)                            -- sequence must be stable for routing
);

-- Integrity: only ACTIVE persons can be added.
```

### 2.4 `person_availability` (table stub — schema now, endpoints Phase 1-lite)

Maximo `Modify Person Availability` analogue. Seeded empty; only create/list endpoints in Phase 1.

```sql
CREATE TABLE person_availability (
  id            VARCHAR(36)  PRIMARY KEY,
  person_id     VARCHAR(50)  NOT NULL REFERENCES person(person_id),
  reason        VARCHAR(50)  NOT NULL,                     -- 'Holiday' | 'Sick' | 'Overtime' | 'Other'
  available_from TIMESTAMPTZ NOT NULL,
  available_to  TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_avail_person ON person_availability(person_id);
```

### 2.5 `person_audit` (optional, Phase 1-lite — append-only changed-field log)

Maximo has only `CHANGEBY/CHANGEDATE`; we add a light audit without event-sourcing a projector.

```sql
CREATE TABLE person_audit (
  id           VARCHAR(36)  PRIMARY KEY,
  person_id    VARCHAR(50)  NOT NULL REFERENCES person(person_id),
  changed_by   VARCHAR(255) NOT NULL,
  field_name   VARCHAR(100) NOT NULL,
  old_value    JSONB        NULL,
  new_value    JSONB        NULL,
  occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_audit_person ON person_audit(person_id, occurred_at);
```

### 2.6 SQLAlchemy notes (how it lands in this repo)

- Add `backend/models/person.py` with `Person`, `PersonGroup`, `PersonGroupMember`, `PersonAvailability`, `PersonAudit` (`Base` + `utc_now`/`generate_uuid` from `models/base.py`), same style as `models/users.py`.
- `Base.metadata.create_all` picks up new tables.
- Existing dev DBs: add idempotent `_ensure_column`/`_ensure_table` backfills in `seed_data.seed_all` (same pattern used for `entity_field.label`).
- Alembic: add one revision `0003_person_module` alongside `0001`/`0002` (kept consistent for Postgres shell targeting).

### 2.7 Seeding / backfill rules (run in `seed_all`, idempotent)

1. For every `app_user`, ensure a `Person` exists: `person_id = UPPER(local part of email)` (e.g. `alice.safety@compassx.io` → `ALICE.SAFETY`), `display_name` copied, `primary_email = email`, `status = 'ACTIVE'`. Maximo aligns PERSONID=USERID.
2. For every `Person` with `primary_email` matching an `app_user.email`, nothing extra needed (already 1:1).
3. Seed two sample groups referencing seeded persons: `SHIFT_CREW_A`, `MAINT_CREW_B`.
4. Backfill `workorder.custom_fields.assigned_to` string values → `person_id` (see §4.3).

---

## 3. REST API Contract

Base prefix: `/api`. Auth model unchanged (app-native; `X-Actor-Id` / `X-Actor-Role` headers on write ops).

### 3.1 `Persons`

#### `GET /api/persons`
Query: `status` (ACTIVE|INACTIVE), `search` (LIKE on person_id/display_name/primary_email), `group` (members of group), `limit` (≤500), `offset`.
Response `200`:
```json
{
  "total": 12, "limit": 100, "offset": 0,
  "items": [
    { "person_id": "ALICE.SAFETY", "display_name": "Alice Vance", "first_name": "Alice",
      "last_name": "Vance", "primary_email": "alice.safety@compassx.io", "phone": null,
      "site": "HQ", "supervisor_id": "DIANA.ROSS", "primary_calendar": null, "primary_shift": "Day",
      "workflow_delegate_id": null, "delegate_from": null, "delegate_to": null,
      "status": "ACTIVE", "user_id": "alice.safety@compassx.io",
      "linked_roles": ["Safety Officer"], "created_at": "...", "updated_at": "..." }
  ]
}
```
`linked_roles` = roles on the linked `AppUser` (denormalized convenience; read-only).

#### `POST /api/persons`
Body: `{ person_id?, display_name, first_name?, last_name?, primary_email?, phone?, site?, supervisor_id?, primary_calendar?, primary_shift?, workflow_delegate_id?, delegate_from?, delegate_to? }`
Rules:
- `person_id` optional; default `UPPER(email-local-part)` or `UPPER(display_name->initials+seq)`.
- If `person_id` given, must match `^[A-Z][A-Z0-9._-]{0,49}$`, unique. `400` on duplicate.
- `supervisor_id` / `workflow_delegate_id` must reference another **ACTIVE** Person → else `400 person_not_found`.
- `delegate_from`/`to` sanity: `from <= to`.
- `201` returns full Person.

#### `GET /api/persons/{person_id}`
`200` Person; `404 person_not_found`.

#### `PUT /api/persons/{person_id}`
Partial update (PATCH semantics). Body = any mutable fields above. Supervisor/delegate existence re-validated. Cannot change `person_id`.
`200` updated Person; `404` not found.
Attempting supervisor set to self → `400 self_reference`.

#### `DELETE /api/persons/{person_id}`
Maximo rule mirrored: **hard delete only when no transactional history**.
- OK if zero references: not linked to `app_user`, not `assigned_to`/owner on any workorder/permit, not a group member, not superior/delegate of anyone, no availability rows.
- Else `409` with `{error_code:"delete_blocked", blockers:[...]}` — instruct caller to **inactivate** instead.

#### `POST /api/persons/{person_id}/inactivate`
Mirrors Maximo inactivation validations; `200` success:
```json
{ "inactivated": true, "person_id": "CHUCK.STONE", "inactivated_user_id": "charlie.tech@compassx.io", "blocks_ignored": [] }
```
`422` blocked with reason list (first applicable returns ALL reasons as `{error_code:"inactivate_blocked", blockers:[...]}`):
1. `open_assignment` — person referenced as `workorder.custom_fields.assigned_to` on non-terminal WO (status ∉ terminal_states).
2. `entity_owner` — `Reported By`/`owner`/`custodian` on any open ticket/WO/permit.
3. `supervisor_of` — active direct reports reference this `supervisor_id`.
4. `workflow_delegate_of` — someone has this person as `workflow_delegate_id` (inside delegate window).
5. `group_member` — any `person_group_member` row (must remove first).
6. `linked_user_system` — explicit flag override only (matches Maximo "System User" carve-out).
Then side effects (atomic): cascade `app_user.active = False`; soft-remove from lookups. Person remains queryable historically.

#### `POST /api/persons/{person_id}/activate`
Reverse. Reactivates linked user (if any). `200`.

#### `GET /api/persons/{person_id}/related`
Read-only reference scan (Maximo `View Related Assets and Locations` analogue):
```json
{ "person_id": "ALICE.SAFETY",
  "workorders": [{"id","status","title"}],
  "permits": [{"id","status","title"}],
  "supervises": ["CHUCK.STONE"],
  "groups": ["SHIFT_CREW_A"] }
```

#### `POST /api/persons/{person_id}/availability` + `GET /api/persons/{person_id}/availability`
Phase 1-lite over `person_availability` (create/list). Body `{reason, available_from, available_to}`. Overlap with existing window → `409 overlap`.

### 3.2 `Person Groups`

#### `GET /api/person-groups`
`?search=`; `200` summaries `[{group_name, description, is_crew_work_group, use_for_org, use_for_site, member_count}]`.

#### `POST /api/person-groups`
Body:
```json
{ "group_name":"SHIFT_CREW_A", "description":"Day shift mechanical crew", "is_crew_work_group":false,
  "members":[ {"person_id":"CHUCK.STONE","sequence":1,"is_group_default":true} ] }
```
Rules: `^[A-Z][A-Z0-9._-]{0,49}$` name; members must be ACTIVE; one default per group max. `201`.

#### `GET /api/person-groups/{group_name}`
`200` group + ordered members:
```json
{ "group_name":"SHIFT_CREW_A", "description":"...", "is_crew_work_group":false,
  "members": [ {"person_id":"CHUCK.STONE","sequence":1,"display_name":"Charlie Stone","status":"ACTIVE","is_group_default":true} ] }
```

#### `PUT /api/person-groups/{group_name}`
Partial update of description/scope flags. Members managed separately. `200`.

#### `DELETE /api/person-groups/{group_name}`
`200` if no references (no `workorder.owner_group`, no members required — members auto-removed). If referenced by live WOs → `409 delete_blocked`.

#### `POST /api/person-groups/{group_name}/members`
Body `{person_id, sequence?, is_group_default?}`. `201`. Sequence unique per group → `409 sequence_conflict`.

#### `PUT /api/person-groups/{group_name}/members/{person_id}`
Update sequence/defaults. `200`.

#### `DELETE /api/person-groups/{group_name}/members/{person_id}`
`200`. Removing last default allowed (group simply has no default).

### 3.3 Error envelope

All errors mirror existing routers: HTTP status + `{"error_code": "...", "message": "...", "details": {...}}` (or string `detail` for simple 404s).

---

## 4. Integration points (how it wires into existing code)

### 4.1 Auth / actor identity

- **Link now:** `app_user` gains optional `person_id VARCHAR(50) REFERENCES person(person_id)` (nullable, 1:1; `_ensure_column` backfill). `AppUser.to_dict()` adds `person_id`.
- `POST /api/auth/users` now also creates the backing `Person` (same rules as §2.7) — MAS suite-user sync analogue.
- `DELETE`/deactivation of a user → inactivates Person; inactivation of Person → deactivates user (§3.1) — no drift.
- `backend/services/entities.py:resolve_actor()` and `backend/services/condition_evaluator.py:_resolve_actor_roles()`: after the existing `AppUser` lookup, add a second pass resolving `person_id` → `primary_email` → `AppUser` → roles. Accept `person_id` as `actor_id` everywhere (`X-Actor-Id: CHUCK.STONE`).

### 4.2 Field validation hook

`backend/services/field_validator.py` — `entity_reference` branch (line ~124) currently only coerces to `str`. Extend:
```python
elif f.field_type == "entity_reference":
    if val:
        target = f.reference_entity_type
        if target in ("person", "person_group"):
            # must exist and (for person) be ACTIVE — else FieldValidationError
        else:
            # existing behavior: coerce only
```
So `assigned_to`/`owner_group` reject unknown IDs at create/transition time, and the `related` condition atom's lazy existence check becomes redundant for these — good (fail-fast at write).

### 4.3 WorkOrder schema migration [in place]

- Update seeded `EntityField(workorder, assigned_to)`: `field_type='entity_reference'`, `reference_entity_type='person'`, keep `label='Assigned To'`.
- Add `EntityField(workorder, owner_group)`: `field_type='entity_reference'`, `reference_entity_type='person_group'`.
- One-off backfill in `seed_all` for existing rows (idempotent):
  1. Map by display_name → person (e.g. `"Charlie Stone"` → `CHUCK.STONE`).
  2. If unrouted, match person_group name (e.g. `"Shift Crew A"` → `SHIFT_CREW_A`) and move to `owner_group`.
  3. Any remaining unmatched free text: sticky-keep in the `payload` as `legacy_assigned_to` and null the field (nothing silently lost).
- Existing conditions referencing `assigned_to` keep working (string `eq` against `person_id`).
- Update `EntityCreateForm` so `assigned_to` renders a dropdown sourced from `GET /api/persons?status=ACTIVE` (label = display_name, value = person_id), `owner_group` from `GET /api/person-groups`.

### 4.4 Condition registry (optional but recommended in Phase 1)

New atom type `person_group` in `condition_evaluator.py` (mirrors Maximo `owner_group` routing):
```json
{ "type": "person_group", "relationship_field": "assigned_to", "group": "SHIFT_CREW_A" }
```
→ passes if the person in `custom_fields[relationship_field]` is an ACTIVE member of `group`. This keeps the "work assigned to the right team" gate in the closed registry, reusing the central Conditions UI with **zero** workflow-engine changes. (If deferred, role atoms still gate as today.)

### 4.5 Frontend

- New top-level tab **People** (`Users` lucide icon) in `App.tsx` segmented nav (`Tab` union + `switchTab` + routes `/people`, `/people/:pid`, `/people/groups`).
- Screens (all per `clean-ui-progressive-disclosure` skill):
  - `PeopleView` — low-color list (`text-gray-700`, `bg-gray-100` ACTIVE tag), `+ New Person` → navigates to editor.
  - `PersonEditor` — Level-1 inspector (dividers `border-t border-gray-100`, no nested boxes): Identity, Contact, Role & Supervision, Delegate, Groups. Icon-only actions `Plus/Minus/MoreVertical/Info`; Level-2 `AnchoredDialog` (`right-[332px]`, caret, outside-click/Esc) for supervisor picker, delegate window, availability. Inactivate button (soft `text-red-600 hover:bg-red-50`) surfaces blockers inline.
  - `GroupsView` + `GroupEditor` — same L1/L2 pattern; member list with sequence reorder (`MoreVertical` → Level-2 dialog), `Minus` to remove, `Plus` to add.
- `api/client.ts`: add `listPersons/createPerson/updatePerson/deletePerson/inactivatePerson/activatePerson/getPersonRelated`, `listPersonGroups/createPersonGroup/...`, and type additions in `types.ts` (`Person`, `PersonGroup`, `PersonGroupMember`, `PersonAvailability`, `PersonRelated`).

---

## 5. Verification

- `PYTHONPATH=. pytest tests/` — existing suite green (0 regressions) **plus** new `tests/test_person_module.py`:
  - create person → appears in `/persons`; duplicate `person_id` → 400.
  - create group + add member; `entity_reference` validation rejects unknown `assigned_to`.
  - inactivate blocked when person is `assigned_to` on non-terminal WO (blockers listed); after WO closed → inactivate succeeds and cascades `app_user.active=false`.
  - backfill: seeded users → persons exist; legacy `assigned_to:"Charlie Stone"` → `"CHUCK.STONE"`.
- `npx tsc --noEmit` — 0 errors.
- Manual UI walkthrough: create Person → assign as `assigned_to` on a WO → run WO lifecycle → inactivate (blocked while WO open, then succeeds).

## 6. Explicitly deferred (Phase 2+)

Labor records + crafts/rates, Crews/Crew Types, full availability-driven scheduling, Maximo-style Person deletion archival, multi-org `COMPANY` integration, notification/delegate auto-rotation on delegate window end.