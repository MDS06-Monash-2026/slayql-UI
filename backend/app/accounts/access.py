"""Access roles and passwords.

Roles are per organisation and cannot be set by the user they describe:
  owner    manages members and everything an analyst can do
  analyst  approves definitions, works the review queue, hosts the arena
  viewer   asks questions, flags answers, builds reports
The first member of an organisation becomes its owner; later members join as
viewers until an owner promotes them. The profile's free-text "role" is only a
job title and grants nothing.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

ROLES = ("owner", "analyst", "viewer")
RANK = {"viewer": 0, "analyst": 1, "owner": 2}
MIN_PASSWORD_LENGTH = 8
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 32}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def organization_key(name: str) -> str:
    return " ".join(str(name or "").casefold().split())


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def check_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        candidate = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), **_SCRYPT)
        return hmac.compare_digest(candidate, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


class AccessStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.members = database.workspace_members
        self.credentials = database.user_credentials
        self.profiles = database.user_profiles

    # --- passwords -----------------------------------------------------------

    def has_password(self, user_id: str) -> bool:
        with self.database.engine.connect() as conn:
            return conn.execute(select(self.credentials.c.user_id).where(self.credentials.c.user_id == user_id)).first() is not None

    def set_password(self, user_id: str, password: str) -> None:
        if len(password or "") < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Use a password of at least {MIN_PASSWORD_LENGTH} characters.")
        with self.database.engine.begin() as conn:
            conn.execute(delete(self.credentials).where(self.credentials.c.user_id == user_id))
            conn.execute(insert(self.credentials).values(user_id=user_id, password_hash=hash_password(password), updated_at=_now()))

    def verify_password(self, user_id: str, password: str) -> bool:
        with self.database.engine.connect() as conn:
            row = conn.execute(select(self.credentials.c.password_hash).where(self.credentials.c.user_id == user_id)).first()
        return bool(row) and check_password(password or "", row[0])

    # --- roles -----------------------------------------------------------------

    def role_for(self, profile: Dict[str, Any], *, default: Optional[str] = None) -> str:
        """The user's role in their organisation, creating the membership on first use."""
        key = organization_key(profile["organization_name"])
        with self.database.engine.begin() as conn:
            row = conn.execute(select(self.members.c.access_role).where(
                self.members.c.organization_key == key, self.members.c.user_id == profile["id"])).first()
            if row:
                return row[0]
            has_owner = conn.execute(select(self.members.c.user_id).where(
                self.members.c.organization_key == key, self.members.c.access_role == "owner")).first() is not None
            role = default or ("viewer" if has_owner else "owner")
            conn.execute(insert(self.members).values(
                organization_key=key, user_id=profile["id"], access_role=role, updated_by="system", updated_at=_now()))
            return role

    def list_members(self, organization_name: str) -> List[Dict[str, Any]]:
        key = organization_key(organization_name)
        statement = (
            select(self.members.c.user_id, self.members.c.access_role, self.profiles.c.name, self.profiles.c.email,
                   self.profiles.c.role)
            .join(self.profiles, self.profiles.c.id == self.members.c.user_id)
            .where(self.members.c.organization_key == key)
            .order_by(self.profiles.c.name)
        )
        with self.database.engine.connect() as conn:
            return [
                {"user_id": row.user_id, "access_role": row.access_role, "name": row.name, "email": row.email, "title": row.role}
                for row in conn.execute(statement)
            ]

    def member_ids(self, organization_name: str) -> List[str]:
        key = organization_key(organization_name)
        with self.database.engine.connect() as conn:
            return [row[0] for row in conn.execute(select(self.members.c.user_id).where(self.members.c.organization_key == key))]

    def set_role(self, organization_name: str, user_id: str, role: str, actor_id: str) -> Dict[str, Any]:
        if role not in ROLES:
            raise ValueError("Role must be owner, analyst or viewer.")
        key = organization_key(organization_name)
        with self.database.engine.begin() as conn:
            current = conn.execute(select(self.members.c.access_role).where(
                self.members.c.organization_key == key, self.members.c.user_id == user_id)).first()
            if not current:
                raise LookupError("That person is not a member of this organisation.")
            if current[0] == "owner" and role != "owner":
                owners = conn.execute(select(self.members.c.user_id).where(
                    self.members.c.organization_key == key, self.members.c.access_role == "owner")).fetchall()
                if len(owners) <= 1:
                    raise ValueError("An organisation needs at least one owner. Promote someone else first.")
            conn.execute(update(self.members).where(
                self.members.c.organization_key == key, self.members.c.user_id == user_id,
            ).values(access_role=role, updated_by=actor_id, updated_at=_now()))
        return {"user_id": user_id, "access_role": role}


access_store = AccessStore(control_database)
