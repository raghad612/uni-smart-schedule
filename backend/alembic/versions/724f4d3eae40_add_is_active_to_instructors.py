"""add_is_active_to_instructors

Revision ID: 724f4d3eae40
Revises: a0e979108215
Create Date: 2026-06-06 11:55:58.790115

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '724f4d3eae40'
down_revision: Union[str, None] = 'a0e979108215'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('instructors',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true')
    )


def downgrade() -> None:
    op.drop_column('instructors', 'is_active')