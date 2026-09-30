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
                pool_recycle=1800,
                pool_use_lifo=True,
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
        # Approved business definitions: what "revenue" or "overdue" means.
        self.business_definitions = Table(
            "business_definitions",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("connection_id", String, nullable=False),
            Column("term", String, nullable=False),
            Column("synonyms", Text, nullable=False, server_default="[]"),
            Column("description", Text, nullable=False, server_default=""),
            Column("table_name", String, nullable=False),
            Column("column_name", String),
            Column("filter_sql", Text, nullable=False, server_default=""),
            Column("status", String, nullable=False, server_default="draft"),
            Column("version", Integer, nullable=False, server_default="1"),
            Column("created_by", String),
            Column("approved_by", String),
            Column("approved_at", String),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        Index("idx_business_definitions_connection", self.business_definitions.c.connection_id, self.business_definitions.c.status)
        # Question-to-SQL pairs confirmed by an analyst.
        self.verified_queries = Table(
            "verified_queries",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("connection_id", String, nullable=False),
            Column("question", Text, nullable=False),
            Column("question_key", String, nullable=False),
            Column("sql", Text, nullable=False),
            Column("definition_ids", Text, nullable=False, server_default="[]"),
            Column("approved_by", String),
            Column("created_at", String, nullable=False),
        )
        Index("idx_verified_queries_lookup", self.verified_queries.c.connection_id, self.verified_queries.c.question_key)
        # Review queue: handed-off, clarified and flagged answers for an analyst.
        self.review_items = Table(
            "review_items",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("owner_id", String),
            Column("connection_id", String),
            Column("run_id", String),
            Column("question", Text, nullable=False),
            Column("sql", Text, nullable=False, server_default=""),
            Column("source", String, nullable=False),
            Column("outcome", String),
            Column("verification", Text, nullable=False, server_default="{}"),
            Column("note", Text, nullable=False, server_default=""),
            Column("status", String, nullable=False, server_default="open"),
            Column("resolution", String),
            Column("resolution_note", Text),
            Column("corrected_sql", Text),
            Column("reviewed_by", String),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        Index("idx_review_items_status", self.review_items.c.status, self.review_items.c.created_at.desc())
        # Access roles per organisation (owner, analyst, viewer), set by owners only.
        self.workspace_members = Table(
            "workspace_members",
            self.metadata,
            Column("organization_key", String, primary_key=True),
            Column("user_id", String, primary_key=True),
            Column("access_role", String, nullable=False),
            Column("updated_by", String),
            Column("updated_at", String, nullable=False),
        )
        # Password hashes (scrypt) for real accounts; the public demo reviewer has none.
        self.user_credentials = Table(
            "user_credentials",
            self.metadata,
            Column("user_id", String, primary_key=True),
            Column("password_hash", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        # Confidence model refitted per data source from analysts' review decisions.
        self.workspace_calibrations = Table(
            "workspace_calibrations",
            self.metadata,
            Column("connection_id", String, primary_key=True),
            Column("model", Text, nullable=False),
            Column("labels", Integer, nullable=False, server_default="0"),
            Column("correct", Integer, nullable=False, server_default="0"),
            Column("fitted_at", String, nullable=False),
        )
        # One-time password reset links: only a hash of each token is stored.
        self.password_resets = Table(
            "password_resets",
            self.metadata,
            Column("token_hash", String, primary_key=True),
            Column("user_id", String, nullable=False),
            Column("created_at", String, nullable=False),
            Column("expires_at", String, nullable=False),
            Column("used_at", String),
        )
        Index("idx_password_resets_user", self.password_resets.c.user_id, self.password_resets.c.created_at)
        # Reports saved from Report Studio, per user and data source.
        self.saved_reports = Table(
            "saved_reports",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("owner_id", String, nullable=False),
            Column("connection_id", String, nullable=False),
            Column("title", String, nullable=False),
            Column("question", Text, nullable=False, server_default=""),
            Column("report", Text, nullable=False),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        Index("idx_saved_reports_owner", self.saved_reports.c.owner_id, self.saved_reports.c.connection_id)
        # Saved reports emailed on a schedule (the weekly pack), refreshed without AI each time.
        self.report_schedules = Table(
            "report_schedules",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("owner_id", String, nullable=False),
            Column("connection_id", String, nullable=False),
            Column("title", String, nullable=False),
            Column("report", Text, nullable=False),
            Column("recipients", Text, nullable=False),
            Column("weekday", Integer, nullable=False),
            Column("hour", Integer, nullable=False),
            Column("active", Integer, nullable=False, server_default="1"),
            Column("next_run_at", String, nullable=False),
            Column("last_sent_at", String),
            Column("last_status", String),
            Column("created_at", String, nullable=False),
            Column("updated_at", String, nullable=False),
        )
        Index("idx_report_schedules_due", self.report_schedules.c.active, self.report_schedules.c.next_run_at)
        # Trust or Bust study responses (consenting, anonymous participants only).
        self.arena_responses = Table(
            "arena_responses",
            self.metadata,
            Column("id", String, primary_key=True),
            Column("session_id", String, nullable=False),
            Column("participant_id", String, nullable=False),
            Column("step_id", String, nullable=False),
            Column("kind", String, nullable=False),
            Column("condition", String, nullable=False),
            Column("payload", Text, nullable=False),
            Column("created_at", String, nullable=False),
        )
        Index("idx_arena_responses_session", self.arena_responses.c.session_id)
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
