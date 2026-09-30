"""0006_locations_and_assets

Site Locations and multi-level Parent-Child Asset hierarchy architecture.

Revision ID: 0006_locations_and_assets
Revises: 0005_organization_and_company_sets
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006_locations_and_assets'
down_revision: Union[str, None] = '0005_organization_and_company_sets'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # location table
    op.create_table(
        'location',
        sa.Column('location_id', sa.String(length=50), nullable=False),
        sa.Column('site_id', sa.String(length=50), nullable=False),
        sa.Column('org_id', sa.String(length=50), nullable=False),
        sa.Column('parent_location_id', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('type', sa.String(length=30), nullable=False, server_default='OPERATING'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='OPERATING'),
        sa.Column('gl_account', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['site_id'], ['site.site_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('location_id', 'site_id')
    )

    # asset table with parent-child hierarchy
    op.create_table(
        'asset',
        sa.Column('asset_id', sa.String(length=50), nullable=False),
        sa.Column('site_id', sa.String(length=50), nullable=False),
        sa.Column('org_id', sa.String(length=50), nullable=False),
        sa.Column('location_id', sa.String(length=50), nullable=True),
        sa.Column('parent_asset_id', sa.String(length=50), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('item_num', sa.String(length=50), nullable=True),
        sa.Column('serial_num', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='OPERATING'),
        sa.Column('vendor', sa.String(length=50), nullable=True),
        sa.Column('manufacturer', sa.String(length=100), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('purchase_cost', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('install_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['site_id'], ['site.site_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('asset_id', 'site_id')
    )


def downgrade() -> None:
    op.drop_table('asset')
    op.drop_table('location')
