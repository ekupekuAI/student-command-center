"""unify admin roles

Revision ID: e4f5a6b7c8d9
Revises: d3f4a5b6c7d8
Create Date: 2026-08-17 00:00:00.000000

Collapses the previous two privileged roles into a single admin role:
any existing master_admin rows become role 'admin'. Data-only change —
no column alters needed.
"""

import sqlalchemy as sa

from alembic import op

revision = "e4f5a6b7c8d9"
down_revision = "d3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'master_admin'")


def downgrade() -> None:
    # The original role split cannot be reconstructed from data alone, so the
    # downgrade leaves all admins as 'admin' (safe default).
    pass