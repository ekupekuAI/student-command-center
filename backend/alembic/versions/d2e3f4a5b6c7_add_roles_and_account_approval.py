"""add roles and account approval

Revision ID: d2e3f4a5b6c7
Revises: c1f0a1b2c3d4
Create Date: 2026-08-17

Strategy:
  1. Add `role` (default 'user') and `account_status` (default 'pending').
  2. Backfill every existing row to role='user', account_status='approved' so
     no current account is locked out by the new approval gate.

The master admin account is NOT created here — it is seeded idempotently at
app startup from ADMIN_EMAIL / ADMIN_PASSWORD (see app.main._lifespan), so the
operator can configure/rotate it without re-running migrations.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        'users',
        sa.Column('role', sa.String(length=20), server_default='user', nullable=False),
    )
    op.add_column(
        'users',
        sa.Column(
            'account_status',
            sa.String(length=20),
            server_default='pending',
            nullable=False,
        ),
    )

    # Existing accounts keep full access: mark them approved with the default role.
    bind.execute(
        sa.text("UPDATE users SET role = 'user', account_status = 'approved'")
    )


def downgrade() -> None:
    op.drop_column('users', 'account_status')
    op.drop_column('users', 'role')