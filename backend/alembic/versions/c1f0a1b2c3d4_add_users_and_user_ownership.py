"""add users and user ownership

Revision ID: c1f0a1b2c3d4
Revises: ec5ea20fad54
Create Date: 2026-08-17

Migration strategy for the existing single-user database:
  1. Create the `users` table.
  2. Add nullable `user_id` columns to every user-owned entity table.
  3. Create one dev/default account (email/password overridable via
     DEV_USER_EMAIL / DEV_USER_PASSWORD env vars at migration time).
  4. Backfill all existing rows to that account.
  5. Add FK (ON DELETE CASCADE), index, and NOT NULL constraint.

No existing data is ever deleted.
"""
from typing import Sequence, Union

import os
import uuid

import bcrypt
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f0a1b2c3d4'
down_revision: Union[str, None] = 'ec5ea20fad54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_TABLES = ("subjects", "tasks", "notes", "study_sessions", "activities")


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('token_version', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    for table in USER_TABLES:
        op.add_column(table, sa.Column('user_id', sa.String(length=36), nullable=True))

    # Create the dev/default account and assign every existing row to it.
    # Safe default: no account is created unless the operator explicitly sets
    # DEV_USER_EMAIL and DEV_USER_PASSWORD at migration time. That keeps a
    # known-password account out of the codebase and fresh installs free of
    # test data. Upgrading a database that already has rows REQUIRES both
    # variables, otherwise the migration aborts rather than guessing.
    # NOTE: the email must pass EmailStr validation (no .local / reserved TLDs).
    dev_email = os.environ.get('DEV_USER_EMAIL')
    dev_password = os.environ.get('DEV_USER_PASSWORD')

    existing_rows = 0
    for table in USER_TABLES:
        existing_rows += int(bind.execute(sa.text(f'SELECT COUNT(*) FROM {table}')).scalar())

    if dev_email and dev_password:
        dev_user_id = uuid.uuid4().hex
        password_hash = bcrypt.hashpw(dev_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        bind.execute(
            sa.text(
                "INSERT INTO users (id, name, email, password_hash, token_version) "
                "VALUES (:id, :name, :email, :hash, 0)"
            ),
            {"id": dev_user_id, "name": "Dev User", "email": dev_email.strip().lower(), "hash": password_hash},
        )
    elif existing_rows > 0:
        raise RuntimeError(
            "Migration found existing rows but no owner account. Set the "
            "DEV_USER_EMAIL and DEV_USER_PASSWORD environment variables so the "
            "migration can create the account that will own the existing data."
        )
    else:
        dev_user_id = None

    if dev_user_id is not None:
        for table in USER_TABLES:
            bind.execute(sa.text(f'UPDATE {table} SET user_id = :uid'), {"uid": dev_user_id})

    # Ownership foreign keys, indexes, and NOT NULL constraints.
    for table in USER_TABLES:
        op.create_foreign_key(
            f'fk_{table}_user_id', table, 'users', ['user_id'], ['id'], ondelete='CASCADE'
        )
        op.alter_column(table, 'user_id', existing_type=sa.String(length=36), nullable=False)
        op.create_index(op.f(f'ix_{table}_user_id'), table, ['user_id'], unique=False)


def downgrade() -> None:
    for table in reversed(USER_TABLES):
        op.drop_index(op.f(f'ix_{table}_user_id'), table_name=table)
        op.drop_constraint(f'fk_{table}_user_id', table, type_='foreignkey')
        op.drop_column(table, 'user_id')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')