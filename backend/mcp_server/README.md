# CompassX EAM — Model Context Protocol (MCP) Server

A comprehensive Model Context Protocol (MCP) server for CompassX Enterprise Asset Management (EAM), allowing AI agents to interact with all platform capabilities on behalf of users with automatic RBAC role and identity resolution.

The MCP implementation is isolated in `backend/mcp/` to ensure zero unintended modifications to existing backend code.

---

## 1. Architecture & "Act on Behalf of Users"

Agents connect to the MCP server and can execute actions on behalf of specific users or personas:

1. **Session Default Actor**:
   - `user_set_active_actor(actor_id, actor_type, actor_roles)` sets the session's active actor identity.
   - `user_get_active_actor()` inspects the current active actor and effective permissions.
   - `user_list_available_actors()` discovers all active users (`AppUser`) and persons (`Person`) in the system.
   - `user_list_roles()` enumerates platform RBAC roles (`Admin`, `Supervisor`, `Safety Officer`, `Technician`, `Manager`).

2. **Per-Call `on_behalf_of`**:
   - Every action tool (e.g. `records_create`, `records_transition`, `records_simulate_transition`, `workflow_save_draft`, `condition_save`) accepts an optional `on_behalf_of` parameter (email or PERSONID) and optional `actor_roles`.
   - When provided, the tool executes strictly under that identity.
   - Roles are dynamically resolved against both user accounts and person profiles (`Person.primary_email` &harr; `AppUser`).
   - All events appended to the event sourcing audit log record the acting user in `actor_id` and audit metadata.

---

## 2. Supported Modules & Tool Catalog

The server registers 61 specialized tools across 6 platform modules:

### 1. Records Module (`records_*`)
- `records_list`: List records for an entity type with filtering by status, search keywords, and pagination.
- `records_get`: Fetch current materialized row and complete chronological event sourcing audit history.
- `records_create`: Create an entity record on behalf of a user; binds to active published workflow and writes a `CREATED` event.
- `records_transition`: Propose and execute a workflow state transition on behalf of a user. Validates deterministic business rule gates (role check, thresholds, dates, field presence, related entities) and enforces optimistic concurrency (`expected_last_event_id`).
- `records_get_valid_transitions`: Inspect legally callable transitions from current state to guide agent decisions.
- `records_simulate_transition`: Dry-run/simulate a transition without modifying database state or logging events.
- `records_rebuild_cache`: Replay the append-only event log to verify event-sourcing consistency and rebuild cache.

### 2. Workflow Module (`workflow_*`)
- `workflow_list`: List workflow definitions filtered by entity type or status (`draft`, `published`, `deprecated`).
- `workflow_get`: Retrieve full workflow definition including states, transitions, choices, gates, and auto-settling rules.
- `workflow_get_active`: Get the currently published active workflow for an entity type.
- `workflow_get_history`: View version history across drafts, published, and deprecated workflows.
- `workflow_save_draft`: Create or update a draft workflow. Automatically forks into a new version if updating a published workflow.
- `workflow_validate`: Validate graph integrity (unreachable states, dead-ends, ambiguous choices, missing condition references).
- `workflow_publish`: Validate and publish a draft workflow, automatically deprecating prior active versions.
- `workflow_deprecate`: Mark a workflow as deprecated.
- `workflow_delete`: Delete draft or deprecated workflow definitions.

### 3. Forms Module (`forms_*`)
- `forms_list`: List saved entity form layouts and version information.
- `forms_get`: Get form layout, registered fields, and workflow stage bindings.
- `forms_save`: Save grid layout (supports headers, sections, field controls, options, visibility conditions, shared list bindings) with automatic `FormVersion` snapshots.
- `forms_get_history`: View form version history for an entity type.
- `forms_delete`: Delete form layout and version snapshots.

### 4. Entity Module (`entity_*`)
- `entity_type_list`: List all registered entity types with live summary metrics (field count, workflow count, form status, record count).
- `entity_type_get`: Get detailed schema definition and field list.
- `entity_type_create`: Register a new entity type, create default/custom fields, baseline form layout, and version snapshot.
- `entity_type_update`: Update display name, description, and icon.
- `entity_type_delete`: Safely delete entity type and cleanly cascade cleanup across dynamic records, events, conditions, workflows, forms, and fields.
- `entity_fields_list`: List custom fields with delete-blocker analysis (identifying references in workflows, forms, conditions).
- `entity_field_create`: Register a custom field with type validation (`text`, `number`, `date`, `select`, `entity_reference`, etc.).
- `entity_field_update`: Update field attributes and options.
- `entity_field_delete`: Safely delete a field (blocked if referenced).

### 5. Condition Module (`condition_*`)
- `condition_types_list`: Return atom types catalog (field comparison, role check, field_not_empty, date check, related entity check, arithmetic expression, person group) and operators.
- `condition_list`: List reusable condition definitions.
- `condition_get`: Get condition definition AST.
- `condition_save`: Create or update a condition rule tree or script expression with version history and failure policy (`block` vs `allow`).
- `condition_delete`: Delete condition and version snapshots.
- `condition_versions_list`: View condition version history.
- `condition_used_by`: Perform impact analysis of where a condition is used across workflows and forms.
- `condition_evaluate`: Test condition evaluation against custom fields and actor context.

### 6. People Module (`people_*`)
- `people_list`: Directory search with status (`ACTIVE`/`INACTIVE`), group filters, and pagination.
- `people_get`: Get person profile, linked user account, and assigned roles.
- `people_create`: Register a person (person_id, display name, email, site, supervisor, shift, calendar, workflow delegate).
- `people_update`: Update person profile attributes.
- `people_delete`: Safely delete person (safeguards prevent deleting active user accounts or persons with open records).
- `people_activate` / `people_inactivate`: Toggle status with cascading user account updates.
- `people_get_related`: Get open work orders, permits, supervisees, and groups referencing a person.
- `people_availability_list` / `people_availability_create`: Schedule availability windows (`Holiday`, `Sick`, `Overtime`, `Other`).
- `people_audit_list`: Chronological audit log of changes to a person.
- `people_groups_list`: List Person Groups and Crew Work Groups.
- `people_group_get`: Get group configuration and member roster.
- `people_group_create`: Create person group with initial members and default assignments.
- `people_group_update`: Update group description and crew settings.
- `people_group_delete`: Delete person group (safeguarded against record references).
- `people_group_member_add`: Add person to group with priority sequence and default flags.
- `people_group_member_update`: Update member sequence or defaults.
- `people_group_member_remove`: Remove person from group.

---

## 3. Running the MCP Server

### Stdio Transport (Default)
Ideal for local AI assistants (Claude Desktop, Cursor, Antigravity, etc.):

```bash
python -m backend.mcp_server
# or
python -m backend.mcp_server --transport stdio
```

### SSE Transport (HTTP / Streaming)
For network-accessible agents:

```bash
python -m backend.mcp_server --transport sse --host 0.0.0.0 --port 8001
```

---

## 4. MCP Client Configuration Example

To configure in Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "compassx-eam": {
      "command": "python",
      "args": [
        "-m",
        "backend.mcp_server"
      ],
      "cwd": "/path/to/mcp_server",
      "env": {
        "DATABASE_URL": "postgresql+psycopg2://postgres:postgres@localhost:5432/eam_db",
        "PYTHONPATH": "."
      }
    }
  }
}
```

---

## 5. Verification & Testing

Run the automated MCP test suite:

```bash
PYTHONPATH=. pytest -v tests/test_mcp_server.py
```
