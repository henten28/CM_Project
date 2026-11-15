"""Sign-in for ASHA workers and supervisors.

Household learners never sign in: they open a published quiz link. Passwords are stored as salted
PBKDF2 hashes and sessions as random bearer tokens (only their SHA-256 is kept in the database).
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

import config
import db
from agents.models import now_iso

log = logging.getLogger("auth")

Role = Literal["asha", "supervisor"]
_ITERATIONS = 200_000


class User(BaseModel):
    username: str
    name: str
    role: Role
    district: str = ""
    block: str = ""


# ── passwords and tokens ──

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS).hex()
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(check, digest)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user(row: db.UserRow) -> User:
    return User(username=row.username, name=row.name, role=row.role, district=row.district, block=row.block)


# ── accounts ──

DEMO_USERS = [
    # username, name, role, district, block, password env var, default password
    ("asha", "Savitha K (ASHA)", "asha", "Mysuru", "Hunsur", "DEMO_ASHA_PASSWORD", "asha123"),
    ("asha2", "Rekha M (ASHA)", "asha", "Mandya", "Maddur", "DEMO_ASHA_PASSWORD", "asha123"),
    ("supervisor", "Dr. Anand (Supervisor)", "supervisor", "Mysuru", "", "DEMO_SUPERVISOR_PASSWORD", "super123"),
]


def create_user(username: str, name: str, role: Role, password: str, district: str = "", block: str = "") -> User:
    with db.session_factory()() as s, s.begin():
        row = db.UserRow(username=username.strip().lower(), name=name, role=role, district=district, block=block,
                         password_hash=hash_password(password), created_at=now_iso())
        s.merge(row)
    return _user(row)


def ensure_demo_users() -> None:
    # creates the demo accounts once; existing accounts (and changed passwords) are left alone
    if not config.SEED_DEMO_USERS:
        return
    import os
    with db.session_factory()() as s:
        existing = set(s.scalars(select(db.UserRow.username)))
    for username, name, role, district, block, env, default in DEMO_USERS:
        if username not in existing:
            try:
                create_user(username, name, role, os.getenv(env, default), district, block)
                log.info("created demo account %s (%s)", username, role)
            except IntegrityError:
                pass  # another request created it at the same moment


def login(username: str, password: str) -> Optional[tuple]:
    ensure_demo_users()
    with db.session_factory()() as s, s.begin():
        row = s.get(db.UserRow, username.strip().lower())
        if row is None or not verify_password(password, row.password_hash):
            return None
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=config.AUTH_TOKEN_HOURS)
        # drop this user's expired tokens while we are here
        s.execute(delete(db.AuthTokenRow).where(db.AuthTokenRow.username == row.username,
                                                db.AuthTokenRow.expires_at < now_iso()))
        s.add(db.AuthTokenRow(token_hash=_token_hash(token), username=row.username, expires_at=expires.isoformat()))
        return token, _user(row)


def logout(token: str) -> None:
    with db.session_factory()() as s, s.begin():
        s.execute(delete(db.AuthTokenRow).where(db.AuthTokenRow.token_hash == _token_hash(token)))


def user_for_token(token: str) -> Optional[User]:
    with db.session_factory()() as s:
        tok = s.get(db.AuthTokenRow, _token_hash(token))
        if tok is None or tok.expires_at < now_iso():
            return None
        row = s.get(db.UserRow, tok.username)
        return _user(row) if row else None


# ── FastAPI dependencies ──

def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip() or None


def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[User]:
    token = _bearer(authorization)
    return user_for_token(token) if token else None


def current_user(user: Optional[User] = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="sign in required")
    return user


def require(*roles: str):
    # dependency factory: the signed-in user must have one of these roles
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"this action needs the {' or '.join(roles)} role")
        return user
    return dep


require_asha = require("asha")
require_supervisor = require("supervisor")
require_staff = require("asha", "supervisor")
