"""Household visits logged by the signed-in ASHA worker.

The household takes the checkpoint quiz together during the ASHA-led session, so a visit's quiz score is
never typed in: it is copied from the linked session, or left empty when no session was run.
"""

import uuid
from datetime import date
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

import auth
import db
from agents import tutor_agent
from agents.models import now_iso

router = APIRouter(prefix="/visits", tags=["visits"])


class VisitIn(BaseModel):
    household: str = Field(min_length=1, max_length=100)
    village: str = Field(min_length=1, max_length=100)
    district: str = Field(min_length=1, max_length=60)
    topic: str = Field(default="", max_length=200)
    lang: Literal["kn", "en", "hi"] = "kn"
    durationMin: int = Field(default=10, ge=1, le=240)
    outcome: Literal["completed", "partial", "referred"] = "completed"
    notes: str = Field(default="", max_length=1000)
    sessionId: Optional[str] = Field(default=None, max_length=40)


def to_dict(r: db.VisitRow, asha_name: Optional[str] = None) -> Dict[str, Any]:
    out = {"id": r.id, "household": r.household, "village": r.village, "district": r.district, "topic": r.topic,
           "lang": r.lang, "date": r.date, "durationMin": r.duration_min, "outcome": r.outcome, "notes": r.notes,
           "quizScore": r.quiz_score, "sessionId": r.session_id, "createdAt": r.created_at,
           "ashaId": r.asha_username}
    if asha_name is not None:
        out["ashaName"] = asha_name
    return out


def list_all() -> List[Dict[str, Any]]:
    # supervisor view: every ASHA's visits, newest first
    with db.session_factory()() as s:
        rows = s.execute(select(db.VisitRow, db.UserRow.name).join(db.UserRow, db.UserRow.username == db.VisitRow.asha_username)
                         .order_by(db.VisitRow.created_at.desc())).all()
        return [to_dict(v, name) for v, name in rows]


@router.get("")
def my_visits(user: auth.User = Depends(auth.require_asha)):
    with db.session_factory()() as s:
        rows = s.scalars(select(db.VisitRow).where(db.VisitRow.asha_username == user.username)
                         .order_by(db.VisitRow.created_at.desc()))
        return [to_dict(r) for r in rows]


@router.post("")
def add_visit(body: VisitIn, user: auth.User = Depends(auth.require_asha)):
    topic, lang, duration, score = body.topic, body.lang, body.durationMin, None
    if body.sessionId:
        sess = db.load(body.sessionId)
        if sess is None or sess.ashaId != user.username:
            raise HTTPException(status_code=404, detail="session not found")
        # the household's score and the session details come from the session record, not the form
        topic = topic or sess.topic
        lang, duration = sess.lang, sess.durationMinutes
        score = round(tutor_agent.score(sess.answers)) if sess.answers else None
    if not topic:
        raise HTTPException(status_code=422, detail="topic is required when no session is linked")
    row = db.VisitRow(id=f"v-{uuid.uuid4().hex[:12]}", asha_username=user.username, household=body.household.strip(),
                      village=body.village.strip(), district=body.district, topic=topic, lang=lang,
                      date=date.today().isoformat(), duration_min=duration, outcome=body.outcome,
                      notes=body.notes.strip(), quiz_score=score, session_id=body.sessionId, created_at=now_iso())
    with db.session_factory()() as s, s.begin():
        s.add(row)
    return to_dict(row)


@router.delete("/{visit_id}")
def delete_visit(visit_id: str, user: auth.User = Depends(auth.require_asha)):
    with db.session_factory()() as s, s.begin():
        row = s.get(db.VisitRow, visit_id)
        if row is None or row.asha_username != user.username:
            raise HTTPException(status_code=404, detail="visit not found")
        s.delete(row)
    return {"ok": True}
