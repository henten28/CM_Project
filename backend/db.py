import json
import threading
from typing import Any, Dict, List, Optional

from sqlalchemy import ForeignKey, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

import config
from agents.models import EscalationTask, Handoff, SessionRecord, now_iso


class Base(DeclarativeBase):
    pass


class SessionRow(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    state: Mapped[str] = mapped_column(String(24), index=True)
    topic: Mapped[str] = mapped_column(String(200))
    lang: Mapped[str] = mapped_column(String(4))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    completed_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # the rest of the session record; escalations and the log live in their own tables
    record_json: Mapped[str] = mapped_column(Text)


class ReferralTaskRow(Base):
    __tablename__ = "referral_tasks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    category: Mapped[str] = mapped_column(String(24))
    rule_id: Mapped[str] = mapped_column(String(40))
    action_key: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), index=True)
    simulated: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[str] = mapped_column(String(40))
    closed_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class AuditLogRow(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)  # position in the session's log
    at: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(60))
    data_json: Mapped[str] = mapped_column(Text)


_lock = threading.Lock()
_maker: Optional[sessionmaker] = None


def _factory() -> sessionmaker:
    # first requests arrive in parallel worker threads; only one may create the engine and tables
    global _maker
    if _maker is None:
        with _lock:
            if _maker is None:
                url = config.DATABASE_URL
                # FastAPI runs sync endpoints in worker threads, which SQLite blocks by default
                args = {"check_same_thread": False} if url.startswith("sqlite") else {}
                engine = create_engine(url, connect_args=args)
                Base.metadata.create_all(engine)  # prototype: create tables on first use, no migrations
                _maker = sessionmaker(engine, expire_on_commit=False)
    return _maker


def reset_engine() -> None:
    # drop the cached engine, e.g. after changing config.DATABASE_URL in tests
    global _maker
    with _lock:
        if _maker is not None:
            _maker.kw["bind"].dispose()
        _maker = None


def _task_row(t: EscalationTask, session_id: str) -> ReferralTaskRow:
    return ReferralTaskRow(id=t.id, session_id=session_id, category=t.category, rule_id=t.ruleId,
                           action_key=t.actionKey, action=t.action, status=t.status, simulated=t.simulated,
                           created_at=t.createdAt, closed_at=t.closedAt)


def _task_model(r: ReferralTaskRow) -> EscalationTask:
    return EscalationTask(id=r.id, category=r.category, ruleId=r.rule_id, actionKey=r.action_key, action=r.action,
                          status=r.status, simulated=r.simulated, createdAt=r.created_at, closedAt=r.closed_at)


# ── sessions ──

def save(s: SessionRecord) -> None:
    with _factory()() as db, db.begin():
        row = db.get(SessionRow, s.id) or SessionRow(id=s.id)
        row.state, row.topic, row.lang = s.state, s.topic, s.lang
        row.duration_minutes, row.created_at, row.completed_at = s.durationMinutes, s.createdAt, s.completedAt
        row.record_json = s.model_dump_json(exclude={"log", "escalations"})
        db.add(row)
        db.flush()  # session row must exist before tasks and log rows reference it

        # new referral tasks only; status changes are made by close_task
        known = set(db.scalars(select(ReferralTaskRow.id).where(ReferralTaskRow.session_id == s.id)))
        for t in s.escalations:
            if t.id not in known:
                db.add(_task_row(t, s.id))

        # the log is append-only: write entries past the last stored position
        stored = db.scalar(select(func.count()).where(AuditLogRow.session_id == s.id)) or 0
        for seq, h in enumerate(s.log[stored:], start=stored):
            db.add(AuditLogRow(session_id=s.id, seq=seq, at=h.at, source=h.source, target=h.target,
                               action=h.action, data_json=json.dumps(h.data, ensure_ascii=False, default=str)))


def load(session_id: str) -> Optional[SessionRecord]:
    with _factory()() as db:
        row = db.get(SessionRow, session_id)
        if row is None:
            return None
        s = SessionRecord.model_validate_json(row.record_json)
        s.escalations = [_task_model(r) for r in db.scalars(
            select(ReferralTaskRow).where(ReferralTaskRow.session_id == session_id).order_by(ReferralTaskRow.created_at))]
        s.log = [Handoff(at=r.at, source=r.source, target=r.target, action=r.action, data=json.loads(r.data_json))
                 for r in db.scalars(select(AuditLogRow).where(AuditLogRow.session_id == session_id)
                                     .order_by(AuditLogRow.seq))]
        return s


def list_sessions(limit: int = 200) -> List[SessionRecord]:
    with _factory()() as db:
        ids = list(db.scalars(select(SessionRow.id).order_by(SessionRow.created_at.desc()).limit(limit)))
    return [s for s in (load(i) for i in ids) if s is not None]


# ── referral tasks ──

def list_tasks(status: Optional[str] = None) -> List[Dict[str, Any]]:
    with _factory()() as db:
        q = select(ReferralTaskRow, SessionRow.topic, SessionRow.lang).join(
            SessionRow, SessionRow.id == ReferralTaskRow.session_id).order_by(ReferralTaskRow.created_at.desc())
        if status:
            q = q.where(ReferralTaskRow.status == status)
        return [{**_task_model(t).model_dump(), "sessionId": t.session_id, "topic": topic, "lang": lang}
                for t, topic, lang in db.execute(q)]


def close_task(task_id: str) -> Optional[EscalationTask]:
    with _factory()() as db, db.begin():
        row = db.get(ReferralTaskRow, task_id)
        if row is None:
            return None
        if row.status != "closed":
            row.status, row.closed_at = "closed", now_iso()
        return _task_model(row)
