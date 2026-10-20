from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

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
    action: Literal["approve", "answer", "ask"]
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


def _load(session_id: str):
    try:
        return orchestrator.get(session_id)
    except orchestrator.NotFound:
        raise HTTPException(status_code=404, detail="session not found")


def _envelope(s, **parts: Any) -> Dict[str, Any]:
    return {"sessionId": s.id, "state": s.state, **parts}


@router.post("/start")
async def start(req: StartRequest):
    out = await orchestrator.start(req.topic, req.durationMinutes, req.lang, req.priorGaps)
    s = out["session"]
    return _envelope(s, plan=out["plan"], planSource=s.planSource if out["plan"] else None, safety=out["safety"],
                     requiresAshaApproval=out["plan"] is not None)


@router.post("/step")
def step(req: StepRequest):
    s = _load(req.sessionId)
    try:
        if req.action == "approve":
            out = orchestrator.approve(s, req.editedContentIds)
        elif req.action == "answer":
            out = orchestrator.answer(s, req.answers)
        else:
            out = orchestrator.ask(s, req.text)
    except orchestrator.BadState as e:
        raise HTTPException(status_code=409, detail=str(e))
    except (tutor_agent.TutorError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _envelope(s, action=req.action, **out)


@router.post("/complete")
def complete(req: CompleteRequest):
    s = _load(req.sessionId)
    return _envelope(s, **orchestrator.complete(s))


@router.get("/{session_id}")
def get_session(session_id: str):
    # full record with audit log, for the supervisor dashboard
    return _load(session_id)
