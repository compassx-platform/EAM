"""0001_initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-15 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. app_role
    op.create_table(
        'app_role',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_app_role_name'), 'app_role', ['name'], unique=True)

    # 2. app_user
    op.create_table(
        'app_user',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_app_user_email'), 'app_user', ['email'], unique=True)

    # 3. app_user_role
    op.create_table(
        'app_user_role',
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('role_id', sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['app_role.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'role_id')
    )

    # 4. entity_field
    op.create_table(
        'entity_field',
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('field_type', sa.String(length=30), nullable=False),
        sa.Column('required', sa.Boolean(), nullable=False),
        sa.Column('select_options', sa.JSON(), nullable=True),
        sa.Column('option_list_key', sa.String(length=100), nullable=True),
        sa.Column('reference_entity_type', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('entity_type', 'field_name')
    )

    # 5. workflow_definition
    op.create_table(
        'workflow_definition',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('version_label', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('definition', sa.JSON(), nullable=False),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workflow_definition_entity_type'), 'workflow_definition', ['entity_type'], unique=False)
    op.create_index(op.f('ix_workflow_definition_status'), 'workflow_definition', ['status'], unique=False)
    op.create_index(op.f('ix_workflow_definition_version_label'), 'workflow_definition', ['version_label'], unique=False)

    # 6. gate_instance
    op.create_table(
        'gate_instance',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('gate_type', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('params', sa.JSON(), nullable=False),
        sa.Column('failure_policy', sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gate_instance_entity_type'), 'gate_instance', ['entity_type'], unique=False)

    # 7. entity_form
    op.create_table(
        'entity_form',
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('layout', sa.JSON(), nullable=False),
        sa.Column('sections', sa.JSON(), nullable=False),
        sa.Column('cols', sa.Integer(), nullable=False),
        sa.Column('row_height', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('entity_type')
    )

    # 8. option_list
    op.create_table(
        'option_list',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('list_key', sa.String(length=100), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('version_label', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('items', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_option_list_list_key'), 'option_list', ['list_key'], unique=False)
    op.create_index(op.f('ix_option_list_status'), 'option_list', ['status'], unique=False)

    # 9. workorder
    op.create_table(
        'workorder',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=100), nullable=False),
        sa.Column('workflow_version', sa.String(length=100), nullable=False),
        sa.Column('last_event_id', sa.String(length=36), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workorder_entity_type'), 'workorder', ['entity_type'], unique=False)
    op.create_index(op.f('ix_workorder_status'), 'workorder', ['status'], unique=False)

    # 10. workorder_event
    op.create_table(
        'workorder_event',
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('entity_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('actor_id', sa.String(length=255), nullable=False),
        sa.Column('actor_type', sa.String(length=20), nullable=False),
        sa.Column('transaction_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('from_state', sa.String(length=100), nullable=True),
        sa.Column('to_state', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('event_id')
    )
    op.create_index(op.f('ix_workorder_event_entity_id'), 'workorder_event', ['entity_id'], unique=False)
    op.create_index(op.f('ix_workorder_event_event_type'), 'workorder_event', ['event_type'], unique=False)

    # 11. permit
    op.create_table(
        'permit',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=100), nullable=False),
        sa.Column('workflow_version', sa.String(length=100), nullable=False),
        sa.Column('last_event_id', sa.String(length=36), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permit_entity_type'), 'permit', ['entity_type'], unique=False)
    op.create_index(op.f('ix_permit_status'), 'permit', ['status'], unique=False)

    # 12. permit_event
    op.create_table(
        'permit_event',
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('entity_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('actor_id', sa.String(length=255), nullable=False),
        sa.Column('actor_type', sa.String(length=20), nullable=False),
        sa.Column('transaction_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('from_state', sa.String(length=100), nullable=True),
        sa.Column('to_state', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('event_id')
    )
    op.create_index(op.f('ix_permit_event_entity_id'), 'permit_event', ['entity_id'], unique=False)
    op.create_index(op.f('ix_permit_event_event_type'), 'permit_event', ['event_type'], unique=False)

    # 13. pm_schedule
    op.create_table(
        'pm_schedule',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=100), nullable=False),
        sa.Column('workflow_version', sa.String(length=100), nullable=False),
        sa.Column('last_event_id', sa.String(length=36), nullable=True),
        sa.Column('custom_fields', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pm_schedule_entity_type'), 'pm_schedule', ['entity_type'], unique=False)
    op.create_index(op.f('ix_pm_schedule_status'), 'pm_schedule', ['status'], unique=False)

    # 14. pm_schedule_event
    op.create_table(
        'pm_schedule_event',
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('entity_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('actor_id', sa.String(length=255), nullable=False),
        sa.Column('actor_type', sa.String(length=20), nullable=False),
        sa.Column('transaction_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('from_state', sa.String(length=100), nullable=True),
        sa.Column('to_state', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('event_id')
    )
    op.create_index(op.f('ix_pm_schedule_event_entity_id'), 'pm_schedule_event', ['entity_id'], unique=False)
    op.create_index(op.f('ix_pm_schedule_event_event_type'), 'pm_schedule_event', ['event_type'], unique=False)


def downgrade() -> None:
    op.drop_table('pm_schedule_event')
    op.drop_table('pm_schedule')
    op.drop_table('permit_event')
    op.drop_table('permit')
    op.drop_table('workorder_event')
    op.drop_table('workorder')
    op.drop_table('option_list')
    op.drop_table('entity_form')
    op.drop_table('gate_instance')
    op.drop_table('workflow_definition')
    op.drop_table('entity_field')
    op.drop_table('app_user_role')
    op.drop_table('app_user')
    op.drop_table('app_role')
