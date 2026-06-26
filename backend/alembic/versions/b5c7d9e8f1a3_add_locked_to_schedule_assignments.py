"""add_locked_to_schedule_assignments

Revision ID: b5c7d9e8f1a3
Revises: d8a1f3c9b274
Create Date: 2026-06-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5c7d9e8f1a3'
down_revision: Union[str, None] = 'd8a1f3c9b274'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `locked` drives both the gap optimizer's skip behavior and the
    # carry-forward inheritance into new proposals. server_default='false'
    # ensures every existing assignment row gets locked=False on upgrade,
    # making this migration backward-compatible.
    op.add_column(
        'schedule_assignments',
        sa.Column('locked', sa.Boolean(), nullable=False, server_default='false'),
    )
    # Audit columns. Nullable because they only get populated when an admin
    # actively locks an assignment. Cheap to add now, expensive to retrofit.
    op.add_column(
        'schedule_assignments',
        sa.Column('locked_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    op.add_column(
        'schedule_assignments',
        sa.Column('locked_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('schedule_assignments', 'locked_at')
    op.drop_column('schedule_assignments', 'locked_by')
    op.drop_column('schedule_assignments', 'locked')