from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

import auth
import db
from agents import orchestrator, tutor_agent
from agents.models import AnswerIn, Lang

router = APIRouter(prefix="/session", tags=["session"])


class StartRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    durationMinutes: Literal[5, 10, 15]
    lang: Lang = "kn"
    priorGaps: List[str] = Field(default_factory=list, max_length=10)


class StepRequest(BaseModel):
    sessionId: str
    action: Literal["approve", "answer", "ask", "resume"]
    editedContentIds: Optional[List[str]] = Field(default=None, max_length=20)  # approve: ASHA's edited plan
    answers: Optional[List[AnswerIn]] = Field(default=None, max_length=10)  # answer
    text: Optional[str] = Field(default=None, min_length=1, max_length=500)  # ask

    @model_validator(mode="after")
    def _fields_for_action(self):
        if self.action == "answer" and not self.answers:
            raise ValueError("answers is required for action 'answer'")
        if self.action == "ask" and not self.text:
            raise ValueError("text is required for action 'ask'")
        return self


class CompleteRequest(BaseModel):
    sessionId: str


def _load(session_id: str, user: auth.User):
    # ASHA workers reach only their own sessions; supervisors can read every session
    try:
        s = orchestrator.get(session_id)
    except orchestrator.NotFound:
        raise HTTPException(status_code=404, detail="session not found")
    if user.role == "asha" and s.ashaId not in (None, user.username):
        raise HTTPException(status_code=404, detail="session not found")
    return s


def _envelope(s, **parts: Any) -> Dict[str, Any]:
    return {"sessionId": s.id, "state": s.state, **parts}


@router.post("/start")
async def start(req: StartRequest, user: auth.User = Depends(auth.require_asha)):
    out = await orchestrator.start(req.topic, req.durationMinutes, req.lang, req.priorGaps,
                                   asha_id=user.username, asha_name=user.name)
    s = out["session"]
    return _envelope(s, plan=out["plan"], planSource=s.planSource if out["plan"] else None, safety=out["safety"],
                     requiresAshaApproval=out["plan"] is not None)


@router.post("/step")
async def step(req: StepRequest, user: auth.User = Depends(auth.require_asha)):
    s = _load(req.sessionId, user)
    try:
        if req.action == "approve":
            out = orchestrator.approve(s, req.editedContentIds)
        elif req.action == "answer":
            out = await orchestrator.answer(s, req.answers)
        elif req.action == "resume":
            out = orchestrator.resume(s)
        else:
            out = await orchestrator.ask(s, req.text)
    except orchestrator.BadState as e:
        raise HTTPException(status_code=409, detail=str(e))
    except (tutor_agent.TutorError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _envelope(s, action=req.action, **out)


@router.post("/complete")
async def complete(req: CompleteRequest, user: auth.User = Depends(auth.require_asha)):
    s = _load(req.sessionId, user)
    return _envelope(s, **(await orchestrator.complete(s)))


@router.get("/mine")
def my_sessions(limit: int = 20, user: auth.User = Depends(auth.require_asha)):
    # the signed-in ASHA's recent sessions, for resuming and for linking a household visit
    rows = []
    for s in db.list_sessions(limit=min(max(limit, 1), 100), asha=user.username):
        rows.append({"id": s.id, "topic": s.topic, "lang": s.lang, "state": s.state, "createdAt": s.createdAt,
                     "durationMin": s.durationMinutes, "answered": len(s.answers),
                     "quizScore": round(tutor_agent.score(s.answers)) if s.answers else None})
    return rows


@router.get("/{session_id}")
def get_session(session_id: str, user: auth.User = Depends(auth.require_staff)):
    # full record with audit log, for the ASHA who ran it and for the supervisor dashboard
    return _load(session_id, user)
