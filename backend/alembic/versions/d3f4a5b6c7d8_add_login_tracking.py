"""add login tracking

Revision ID: d3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-17 00:00:00.000000

Adds login_count (total successful logins) and last_login_at to users so the
admin console can show how many times the admin has signed in. Both are
additive and safe: login_count defaults to 0 for existing rows.
"""

import sqlalchemy as sa

from alembic import op

revision = "d3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("login_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "login_count")