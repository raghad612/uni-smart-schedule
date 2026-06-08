"""simplify_course_semester_to_period

Revision ID: f6fa6551acdf
Revises: 724f4d3eae40
Create Date: 2026-06-07 11:56:34.649604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6fa6551acdf'
down_revision: Union[str, None] = '724f4d3eae40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert "2024-1" → "1", "2024-2" → "2", etc.
    op.execute("""
        UPDATE course_instances
        SET semester = SPLIT_PART(semester, '-', 2)
        WHERE semester LIKE '%-%'
    """)

def downgrade() -> None:
    pass
