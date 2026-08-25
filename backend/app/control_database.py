"""Backend-owned persistence shared by accounts, history, and data-source metadata."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    URL,
    create_engine,
    text,
)

from backend.app.config import settings
from backend.app.connections.runtime import normalize_connection_string


class ControlDatabase:
    def __init__(self, database_url: Optional[str], sqlite_path: str, schema: str) -> None:
        self.is_postgres = bool(database_url)
        self.schema = schema if self.is_postgres else None

        if self.is_postgres:
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
                raise RuntimeError("BACKEND_DATABASE_SCHEMA must be a valid PostgreSQL identifier.")
            url = normalize_connection_string("postgresql", database_url or "")
            # Supabase's transaction pooler can hand a physical connection to
            # another client between transactions. Disable psycopg's automatic
            # server-side prepared statements to avoid name collisions.
            self.engine = create_engine(
                url,
                pool_pre_ping=True,
                connect_args={"prepare_threshold": None},
            )
        else:
            path = Path(sqlite_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            url = URL.create("sqlite+pysqlite", database=str(path))
            self.engine = create_engine(url)

        self.metadata = MetaData(schema=self.schema)
        profile_reference = (
            f"{self.schema}.user_profiles.id" if self.schema else "user_profiles.id"
        )

        self.user_profiles = Table(
            "user_profiles",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("email", String, nullable=False, unique=True),
            Column("name", String, nullable=False),
            Column("role", String, nullable=False),
            Column("organization_name", String, nullable=False),
            Column("bio", Text, nullable=False, server_default=""),
            Column("timezone", String, nullable=False, server_default="Asia/Kuala_Lumpur"),
            Column("avatar_bytes", LargeBinary),
            Column("avatar_content_type", String),
            Column("credits", Integer, nullable=False, server_default="1000"),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        self.credit_transactions = Table(
            "credit_transactions",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("user_id", String, ForeignKey(profile_reference), nullable=False),
            Column("amount", Integer, nullable=False),
            Column("reason", Text, nullable=False),
            Column("created_at", String, nullable=False),
        )
        self.backend_sessions = Table(
            "backend_sessions",
            self.metadata,
            Column("token", String, primary_key=True),
            Column("user_id", String, ForeignKey(profile_reference), nullable=False),
            Column("authenticated_at", String, nullable=False),
        )
        Index("idx_backend_sessions_user", self.backend_sessions.c.user_id)
        self.query_history = Table(
            "query_history",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("conversation_id", String, nullable=False),
            Column("prompt", Text, nullable=False),
            Column("model_id", String),
            Column("connection_id", String),
            Column("created_at", String, nullable=False),
            Column("owner_id", String),
        )
        Index("idx_query_history_created_at", self.query_history.c.created_at.desc())
        conversation_reference = (
            f"{self.schema}.chat_conversations.id" if self.schema else "chat_conversations.id"
        )
        self.chat_conversations = Table(
            "chat_conversations",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("owner_id", String, nullable=False),
            Column("connection_id", String),
            Column("title", Text, nullable=False),
            Column("selected_model_id", String),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        Index(
            "idx_chat_conversations_owner_updated",
            self.chat_conversations.c.owner_id,
            self.chat_conversations.c.updated_at.desc(),
        )
        self.chat_messages = Table(
            "chat_messages",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("conversation_id", String, ForeignKey(conversation_reference), nullable=False),
            Column("owner_id", String, nullable=False),
            Column("role", String, nullable=False),
            Column("content", Text, nullable=False),
            Column("sql", Text),
            Column("payload_json", Text, nullable=False, server_default="{}"),
            Column("created_at", String, nullable=False),
        )
        Index(
            "idx_chat_messages_conversation_created",
            self.chat_messages.c.conversation_id,
            self.chat_messages.c.created_at,
        )
        self.chat_reports = Table(
            "chat_reports",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("owner_id", String, nullable=False),
            Column("conversation_id", String, nullable=False),
            Column("message_id", String, nullable=False),
            Column("run_id", String),
            Column("category", String, nullable=False),
            Column("note", Text, nullable=False, server_default=""),
            Column("question", Text, nullable=False),
            Column("assistant_response", Text, nullable=False),
            Column("sql", Text),
            Column("context_json", Text, nullable=False, server_default="{}"),
            Column("status", String, nullable=False, server_default="new"),
            Column("resolution_note", Text, nullable=False, server_default=""),
            Column("created_at", String, nullable=False),
            Column("resolved_at", String),
        )
        Index(
            "idx_chat_reports_status_created",
            self.chat_reports.c.status,
            self.chat_reports.c.created_at.desc(),
        )
        Index("idx_chat_reports_owner", self.chat_reports.c.owner_id)
        self.data_connections = Table(
            "data_connections",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("name", String, nullable=False),
            Column("provider", String, nullable=False),
            Column("mode", String, nullable=False),
            Column("description", Text, nullable=False, server_default=""),
            Column("access_mode", String, nullable=False, server_default="read_only"),
            Column("status", String, nullable=False, server_default="pending"),
            Column("data_path", Text),
            Column("encrypted_credentials", Text),
            Column("created_at", String, nullable=False),
            Column("last_tested_at", String),
            Column("owner_id", String),
        )
        Index("idx_data_connections_owner", self.data_connections.c.owner_id)
        if self.is_postgres:
            with self.engine.begin() as connection:
                connection.execute(
                    text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
                    {"lock_name": f"slayql-control-schema:{self.schema}"},
                )
                connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{self.schema}"'))
                self.metadata.create_all(connection)
        else:
            self.metadata.create_all(self.engine)

    @property
    def backend(self) -> str:
        return "supabase" if self.is_postgres else "sqlite"


control_database = ControlDatabase(
    settings.DATABASE_URL,
    settings.CONTROL_DB_PATH,
    settings.BACKEND_DATABASE_SCHEMA,
)
