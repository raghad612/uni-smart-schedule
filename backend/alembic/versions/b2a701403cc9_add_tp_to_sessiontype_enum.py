"""add tp to sessiontype enum

Revision ID: b2a701403cc9
Revises: 724f4d3eae40
Create Date: 2026-06-29

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'b2a701403cc9'
down_revision = 'b5c7d9e8f1a3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: ALTER TYPE ADD VALUE must run outside a transaction
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE sessiontype ADD VALUE IF NOT EXISTS 'tp'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing values from an enum cleanly.
    # Downgrade is a no-op; the unused 'tp' value remains harmless.
    pass