"""0002_condition_registry

Centralized, reusable, versioned condition registry (replaces gate_instance).

Revision ID: 0002_condition_registry
Revises: 0001_initial_schema
Create Date: 2026-09-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_condition_registry'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # condition_definition — live (current) rule registry
    op.create_table(
        'condition_definition',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('definition', sa.JSON(), nullable=False),
        sa.Column('current_version', sa.Integer(), nullable=False),
        sa.Column('failure_policy', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_condition_definition_entity_type'), 'condition_definition', ['entity_type'], unique=False)

    # condition_version — immutable snapshots for tracking/history
    op.create_table(
        'condition_version',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('condition_id', sa.String(length=100), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('definition', sa.JSON(), nullable=False),
        sa.Column('failure_policy', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['condition_id'], ['condition_definition.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_condition_version_condition_id'), 'condition_version', ['condition_id'], unique=False)

    op.drop_index('ix_gate_instance_entity_type', table_name='gate_instance')
    op.drop_table('gate_instance')


def downgrade() -> None:
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

    op.drop_index(op.f('ix_condition_version_condition_id'), table_name='condition_version')
    op.drop_table('condition_version')
    op.drop_index(op.f('ix_condition_definition_entity_type'), table_name='condition_definition')
    op.drop_table('condition_definition')