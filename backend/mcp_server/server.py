"""
CompassX EAM Model Context Protocol (MCP) Server.

Provides a unified MCP server interface exposing all platform capabilities:
- workflow: State machine authoring, validation, publishing, and auto-settling
- records: Single command CQRS pipeline, state transitions, event audit log, replay
- forms: Entity forms design, section groups, stage-form bindings, visibility rules
- entity: Entity types metadata, custom fields registry, relationships
- condition: Deterministic business-rule condition gates and rule-tree evaluation
- people: People directory, profiles, shifts, calendars, delegations, availability, person groups
- context: Acting on behalf of users with automatic RBAC role resolution
"""

import sys
import argparse
import json
from typing import Optional
from mcp.server.fastmcp import FastMCP

from backend.mcp_server.context import get_db_session, get_current_actor
from backend.models.entity_type import EntityTypeDefinition
from backend.models.workflow import WorkflowDefinition
from backend.models.entities import DynamicEntity
from backend.models.person import Person
from backend.models.users import AppUser

# Import tool functions
from backend.mcp_server.tools.records import (
    records_list,
    records_get,
    records_create,
    records_transition,
    records_get_valid_transitions,
    records_simulate_transition,
    records_rebuild_cache,
)
from backend.mcp_server.tools.workflow import (
    workflow_list,
    workflow_get,
    workflow_get_active,
    workflow_get_history,
    workflow_save_draft,
    workflow_validate,
    workflow_publish,
    workflow_deprecate,
    workflow_delete,
)
from backend.mcp_server.tools.forms import (
    forms_list,
    forms_get,
    forms_save,
    forms_get_history,
    forms_delete,
)
from backend.mcp_server.tools.entity import (
    entity_type_list,
    entity_type_get,
    entity_type_create,
    entity_type_update,
    entity_type_delete,
    entity_fields_list,
    entity_field_create,
    entity_field_update,
    entity_field_delete,
)
from backend.mcp_server.tools.condition import (
    condition_types_list,
    condition_list,
    condition_get,
    condition_save,
    condition_delete,
    condition_versions_list,
    condition_used_by,
    condition_evaluate,
)
from backend.mcp_server.tools.people import (
    people_list,
    people_get,
    people_create,
    people_update,
    people_delete,
    people_activate,
    people_inactivate,
    people_get_related,
    people_availability_list,
    people_availability_create,
    people_audit_list,
    people_groups_list,
    people_group_get,
    people_group_create,
    people_group_update,
    people_group_delete,
    people_group_member_add,
    people_group_member_update,
    people_group_member_remove,
)
from backend.mcp_server.tools.context import (
    user_set_active_actor,
    user_get_active_actor,
    user_list_available_actors,
    user_list_roles,
)

SERVER_INSTRUCTIONS = """
CompassX Enterprise Asset Management (EAM) MCP Server.

You are interacting with an event-sourced, CQRS-structured Enterprise Asset Management system.
As an AI agent, you can perform actions ON BEHALF OF USERS across 6 core application modules:

1. Records Module (tools starting with 'records_'):
   - Manage entity records (e.g. work orders, permits, safety certificates).
   - Propose state transitions with automatic gate/condition enforcement and optimistic concurrency.
   - Query complete immutable event history and audit timeline.
   - Simulate transitions (dry-run) without modifying records.
   - Replay event logs to rebuild materialized caches.

2. Workflow Module (tools starting with 'workflow_'):
   - Inspect active, draft, and deprecated workflow definitions.
   - Author workflow drafts with state-machine graphs, transitions, and conditional choices.
   - Validate graph connectivity and reachability rules.
   - Publish workflows with automatic versioning and deprecation.

3. Forms Module (tools starting with 'forms_'):
   - Query and update visual layout configurations, grid coordinates, and sections.
   - Configure field controls, shared option lists, and visibility conditions.
   - Inspect workflow stage-to-form bindings.

4. Entity Module (tools starting with 'entity_'):
   - Register and manage custom entity types.
   - Define custom fields (text, number, date, select, entity_reference) with validation.
   - Inspect delete blockers before field or entity removal.

5. Condition Module (tools starting with 'condition_'):
   - Author reusable business rule conditions (role checks, numeric thresholds, fields, dates, related entities).
   - Perform impact analysis to see where conditions are referenced across workflows and forms.
   - Evaluate conditions against test payloads and actor permissions.

6. People Module (tools starting with 'people_'):
   - Manage directory of persons, supervisor hierarchies, shifts, calendars, and delegations.
   - Schedule availability/unavailability windows.
   - Manage Person Groups (crew work groups, member priorities, defaults).

7. User Acting Context (tools starting with 'user_'):
   - Use `user_set_active_actor` to change the session's default user/actor identity.
   - Or pass `on_behalf_of` directly to any action tool (e.g. `records_create`, `records_transition`).
   - Use `user_list_available_actors` and `user_list_roles` to see who exists and what roles they possess.
"""


def create_mcp_server() -> FastMCP:
    """Creates and configures the FastMCP server with all registered tools and resources."""
    server = FastMCP(
        name="CompassX EAM",
        instructions=SERVER_INSTRUCTIONS,
    )
    server.settings.transport_security.enable_dns_rebinding_protection = False

    # 1. Records tools
    server.add_tool(records_list)
    server.add_tool(records_get)
    server.add_tool(records_create)
    server.add_tool(records_transition)
    server.add_tool(records_get_valid_transitions)
    server.add_tool(records_simulate_transition)
    server.add_tool(records_rebuild_cache)

    # 2. Workflow tools
    server.add_tool(workflow_list)
    server.add_tool(workflow_get)
    server.add_tool(workflow_get_active)
    server.add_tool(workflow_get_history)
    server.add_tool(workflow_save_draft)
    server.add_tool(workflow_validate)
    server.add_tool(workflow_publish)
    server.add_tool(workflow_deprecate)
    server.add_tool(workflow_delete)

    # 3. Forms tools
    server.add_tool(forms_list)
    server.add_tool(forms_get)
    server.add_tool(forms_save)
    server.add_tool(forms_get_history)
    server.add_tool(forms_delete)

    # 4. Entity tools
    server.add_tool(entity_type_list)
    server.add_tool(entity_type_get)
    server.add_tool(entity_type_create)
    server.add_tool(entity_type_update)
    server.add_tool(entity_type_delete)
    server.add_tool(entity_fields_list)
    server.add_tool(entity_field_create)
    server.add_tool(entity_field_update)
    server.add_tool(entity_field_delete)

    # 5. Condition tools
    server.add_tool(condition_types_list)
    server.add_tool(condition_list)
    server.add_tool(condition_get)
    server.add_tool(condition_save)
    server.add_tool(condition_delete)
    server.add_tool(condition_versions_list)
    server.add_tool(condition_used_by)
    server.add_tool(condition_evaluate)

    # 6. People tools
    server.add_tool(people_list)
    server.add_tool(people_get)
    server.add_tool(people_create)
    server.add_tool(people_update)
    server.add_tool(people_delete)
    server.add_tool(people_activate)
    server.add_tool(people_inactivate)
    server.add_tool(people_get_related)
    server.add_tool(people_availability_list)
    server.add_tool(people_availability_create)
    server.add_tool(people_audit_list)
    server.add_tool(people_groups_list)
    server.add_tool(people_group_get)
    server.add_tool(people_group_create)
    server.add_tool(people_group_update)
    server.add_tool(people_group_delete)
    server.add_tool(people_group_member_add)
    server.add_tool(people_group_member_update)
    server.add_tool(people_group_member_remove)

    # 7. User Context tools
    server.add_tool(user_set_active_actor)
    server.add_tool(user_get_active_actor)
    server.add_tool(user_list_available_actors)
    server.add_tool(user_list_roles)

    # Resources
    @server.resource("compassx://system/overview")
    def resource_system_overview() -> str:
        """Returns live system summary metrics."""
        with get_db_session() as db:
            entity_types = db.query(EntityTypeDefinition).count()
            workflows = db.query(WorkflowDefinition).filter(WorkflowDefinition.status == "published").count()
            records = db.query(DynamicEntity).count()
            persons = db.query(Person).count()
            users = db.query(AppUser).count()
            current_actor = get_current_actor()

            overview = {
                "active_entity_types_count": entity_types,
                "published_workflows_count": workflows,
                "total_records_count": records,
                "registered_persons_count": persons,
                "active_users_count": users,
                "current_session_actor": current_actor.actor_id,
            }
            return json.dumps(overview, indent=2)

    # Prompts
    @server.prompt("inspect_record")
    def prompt_inspect_record(entity_type: str, record_id: str) -> str:
        """Guides the agent to analyze a record's current state, valid next transitions, and audit timeline."""
        return (
            f"Please inspect the record of type '{entity_type}' with ID '{record_id}'.\n"
            f"1. Call `records_get('{entity_type}', '{record_id}')` to retrieve current state and event log.\n"
            f"2. Call `records_get_valid_transitions('{entity_type}', '{record_id}')` to find available next actions.\n"
            f"3. Summarize the status, who performed recent actions, and what transitions are legally callable next."
        )

    @server.prompt("simulate_workflow_transition")
    def prompt_simulate_transition(entity_type: str, record_id: str, event_type: str, on_behalf_of: str) -> str:
        """Guides the agent to dry-run a transition on behalf of a specific user."""
        return (
            f"Please simulate transition '{event_type}' on '{entity_type}' record '{record_id}' on behalf of '{on_behalf_of}'.\n"
            f"1. Call `records_simulate_transition('{entity_type}', '{event_type}', entity_id='{record_id}', on_behalf_of='{on_behalf_of}')`.\n"
            f"2. Verify whether condition gates (e.g. role check, thresholds) pass or block.\n"
            f"3. Report the result and any failing conditions."
        )

    return server


# Global server instance
from mcp.server.transport_security import TransportSecuritySettings

mcp = create_mcp_server()
mcp.settings.transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=False,
    allowed_hosts=["*"],
    allowed_origins=["*"]
)


def main():
    parser = argparse.ArgumentParser(description="CompassX EAM MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="Transport mode (default: stdio)",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host for SSE transport (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8001,
        help="Port for SSE transport (default: 8001)",
    )

    args = parser.parse_args()

    if args.transport == "stdio":
        mcp.run(transport="stdio")
    elif args.transport == "sse":
        mcp.settings.host = args.host
        mcp.settings.port = args.port
        mcp.run(transport="sse")


if __name__ == "__main__":
    main()
