"""0003_person_module

Person and Person Group master identity tables (IBM Maximo PERSON & PERSONGROUP analogue).

Revision ID: 0003_person_module
Revises: 0002_condition_registry
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003_person_module'
down_revision: Union[str, None] = '0002_condition_registry'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # person table
    op.create_table(
        'person',
        sa.Column('person_id', sa.String(length=50), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('primary_email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('site', sa.String(length=50), nullable=True),
        sa.Column('supervisor_id', sa.String(length=50), nullable=True),
        sa.Column('primary_calendar', sa.String(length=50), nullable=True),
        sa.Column('primary_shift', sa.String(length=50), nullable=True),
        sa.Column('workflow_delegate_id', sa.String(length=50), nullable=True),
        sa.Column('delegate_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delegate_to', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['supervisor_id'], ['person.person_id']),
        sa.ForeignKeyConstraint(['workflow_delegate_id'], ['person.person_id']),
        sa.PrimaryKeyConstraint('person_id')
    )
    op.create_index(op.f('ix_person_primary_email'), 'person', ['primary_email'], unique=False)
    op.create_index(op.f('ix_person_supervisor_id'), 'person', ['supervisor_id'], unique=False)

    # person_group table
    op.create_table(
        'person_group',
        sa.Column('group_name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('is_crew_work_group', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('use_for_org', sa.String(length=50), nullable=True),
        sa.Column('use_for_site', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('group_name')
    )

    # person_group_member table
    op.create_table(
        'person_group_member',
        sa.Column('group_name', sa.String(length=50), nullable=False),
        sa.Column('person_id', sa.String(length=50), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_group_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_org_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_site_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.ForeignKeyConstraint(['group_name'], ['person_group.group_name']),
        sa.ForeignKeyConstraint(['person_id'], ['person.person_id']),
        sa.PrimaryKeyConstraint('group_name', 'person_id')
    )

    # person_availability table
    op.create_table(
        'person_availability',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('person_id', sa.String(length=50), nullable=False),
        sa.Column('reason', sa.String(length=50), nullable=False),
        sa.Column('available_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('available_to', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['person_id'], ['person.person_id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_person_availability_person_id'), 'person_availability', ['person_id'], unique=False)

    # person_audit table
    op.create_table(
        'person_audit',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('person_id', sa.String(length=50), nullable=False),
        sa.Column('changed_by', sa.String(length=255), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('old_value', sa.String(length=1000), nullable=True),
        sa.Column('new_value', sa.String(length=1000), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['person_id'], ['person.person_id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_person_audit_person_id'), 'person_audit', ['person_id'], unique=False)

    # Add person_id to app_user
    op.add_column('app_user', sa.Column('person_id', sa.String(length=50), nullable=True))
    op.create_foreign_key('fk_app_user_person_id', 'app_user', 'person', ['person_id'], ['person_id'])


def downgrade() -> None:
    op.drop_constraint('fk_app_user_person_id', 'app_user', type_='foreignkey')
    op.drop_column('app_user', 'person_id')

    op.drop_index(op.f('ix_person_audit_person_id'), table_name='person_audit')
    op.drop_table('person_audit')

    op.drop_index(op.f('ix_person_availability_person_id'), table_name='person_availability')
    op.drop_table('person_availability')

    op.drop_table('person_group_member')
    op.drop_table('person_group')

    op.drop_index(op.f('ix_person_supervisor_id'), table_name='person')
    op.drop_index(op.f('ix_person_primary_email'), table_name='person')
    op.drop_table('person')
