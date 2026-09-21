"""0004_workflow_roles_and_tasks

Dynamic workflow roles and task assignments (IBM Maximo MAXROLE & WFTASK analogue).

Revision ID: 0004_workflow_roles_and_tasks
Revises: 0003_person_module
Create Date: 2026-09-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004_workflow_roles_and_tasks'
down_revision: Union[str, None] = '0003_person_module'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # workflow_role table
    op.create_table(
        'workflow_role',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('role_type', sa.String(length=30), nullable=False),
        sa.Column('person_id', sa.String(length=50), nullable=True),
        sa.Column('group_name', sa.String(length=50), nullable=True),
        sa.Column('field_name', sa.String(length=100), nullable=True),
        sa.Column('email_address', sa.String(length=255), nullable=True),
        sa.Column('resolution_strategy', sa.String(length=50), nullable=False, server_default='broadcast'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['person_id'], ['person.person_id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['group_name'], ['person_group.group_name'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # task_assignment table
    op.create_table(
        'task_assignment',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.String(length=50), nullable=False),
        sa.Column('workflow_version', sa.String(length=50), nullable=True),
        sa.Column('node_id', sa.String(length=100), nullable=True),
        sa.Column('state_name', sa.String(length=100), nullable=False),
        sa.Column('role_id', sa.String(length=50), nullable=True),
        sa.Column('assigned_person_id', sa.String(length=50), nullable=True),
        sa.Column('assigned_group_name', sa.String(length=50), nullable=True),
        sa.Column('assigned_email', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='ASSIGNED'),
        sa.Column('instructions', sa.String(length=1000), nullable=True),
        sa.Column('time_limit_hours', sa.Integer(), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_trace', sa.JSON(), nullable=True),
        sa.Column('completed_by', sa.String(length=255), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['workflow_role.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assigned_person_id'], ['person.person_id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assigned_group_name'], ['person_group.group_name'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_task_assignment_entity_type'), 'task_assignment', ['entity_type'], unique=False)
    op.create_index(op.f('ix_task_assignment_entity_id'), 'task_assignment', ['entity_id'], unique=False)
    op.create_index(op.f('ix_task_assignment_role_id'), 'task_assignment', ['role_id'], unique=False)
    op.create_index(op.f('ix_task_assignment_assigned_person_id'), 'task_assignment', ['assigned_person_id'], unique=False)
    op.create_index(op.f('ix_task_assignment_status'), 'task_assignment', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_task_assignment_status'), table_name='task_assignment')
    op.drop_index(op.f('ix_task_assignment_assigned_person_id'), table_name='task_assignment')
    op.drop_index(op.f('ix_task_assignment_role_id'), table_name='task_assignment')
    op.drop_index(op.f('ix_task_assignment_entity_id'), table_name='task_assignment')
    op.drop_index(op.f('ix_task_assignment_entity_type'), table_name='task_assignment')
    op.drop_table('task_assignment')
    op.drop_table('workflow_role')
