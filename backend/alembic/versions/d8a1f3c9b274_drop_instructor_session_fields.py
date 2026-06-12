"""drop_instructor_session_fields

Revision ID: d8a1f3c9b274
Revises: f6fa6551acdf
Create Date: 2026-06-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8a1f3c9b274'
down_revision: Union[str, None] = 'f6fa6551acdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('instructors', 'required_sessions')
    op.drop_column('instructors', 'max_sessions_per_day')


def downgrade() -> None:
    op.add_column('instructors',
        sa.Column('required_sessions', sa.Integer(), nullable=False, server_default='10')
    )
    op.add_column('instructors',
        sa.Column('max_sessions_per_day', sa.Integer(), nullable=False, server_default='2')
    )