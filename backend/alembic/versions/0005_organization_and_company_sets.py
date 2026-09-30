"""0005_organization_and_company_sets

Enterprise EAM Organization, Company Sets, Company Master, Sites, and local Companies architecture.

Revision ID: 0005_organization_and_company_sets
Revises: 0004_workflow_roles_and_tasks
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005_organization_and_company_sets'
down_revision: Union[str, None] = '0004_workflow_roles_and_tasks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # company_set table (Enterprise EAM SETS with SETTYPE='COMPANY')
    op.create_table(
        'company_set',
        sa.Column('set_id', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('auto_add_companies', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('set_id')
    )

    # company_master table (Enterprise EAM COMPMASTER at Set level)
    op.create_table(
        'company_master',
        sa.Column('company', sa.String(length=50), nullable=False),
        sa.Column('company_set_id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False, server_default='V'),
        sa.Column('currency_code', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('tax_id', sa.String(length=50), nullable=True),
        sa.Column('homepage', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('fax', sa.String(length=50), nullable=True),
        sa.Column('address_line1', sa.String(length=255), nullable=True),
        sa.Column('address_line2', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('state_province', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=30), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_set_id'], ['company_set.set_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('company', 'company_set_id')
    )

    # organization table (Enterprise EAM ORGANIZATION)
    op.create_table(
        'organization',
        sa.Column('org_id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('company_set_id', sa.String(length=50), nullable=False),
        sa.Column('item_set_id', sa.String(length=50), nullable=False, server_default='ITEMSET1'),
        sa.Column('base_currency_1', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('base_currency_2', sa.String(length=10), nullable=True),
        sa.Column('clearing_account', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('purchasing_options', sa.JSON(), nullable=False),
        sa.Column('inventory_options', sa.JSON(), nullable=False),
        sa.Column('work_order_options', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_set_id'], ['company_set.set_id']),
        sa.PrimaryKeyConstraint('org_id')
    )

    # site table (Enterprise EAM SITE)
    op.create_table(
        'site',
        sa.Column('site_id', sa.String(length=50), nullable=False),
        sa.Column('org_id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organization.org_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('site_id')
    )

    # company_org table (Enterprise EAM COMPANIES at Org level)
    op.create_table(
        'company_org',
        sa.Column('org_id', sa.String(length=50), nullable=False),
        sa.Column('company', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False, server_default='V'),
        sa.Column('currency_code', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('payment_terms', sa.String(length=50), nullable=False, server_default='NET30'),
        sa.Column('freight_terms', sa.String(length=50), nullable=False, server_default='PREPAID'),
        sa.Column('fob', sa.String(length=50), nullable=False, server_default='DESTINATION'),
        sa.Column('customer_account_num', sa.String(length=100), nullable=True),
        sa.Column('tax_exempt', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('tax_code', sa.String(length=50), nullable=True),
        sa.Column('gl_account', sa.String(length=100), nullable=True),
        sa.Column('disabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('remit_to_address', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organization.org_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('org_id', 'company')
    )

    # company_contact table (Enterprise EAM COMPCONTACT)
    op.create_table(
        'company_contact',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('company', sa.String(length=50), nullable=False),
        sa.Column('company_set_id', sa.String(length=50), nullable=False),
        sa.Column('org_id', sa.String(length=50), nullable=True),
        sa.Column('contact_name', sa.String(length=255), nullable=False),
        sa.Column('position', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('company_contact')
    op.drop_table('company_org')
    op.drop_table('site')
    op.drop_table('organization')
    op.drop_table('company_master')
    op.drop_table('company_set')
