"""Same-browser prototype endpoints for the persistent ASHA-reviewed agent."""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import knowledge
from agent_loop import AgentError, get_session, list_sessions, mutate_session, start_session

router = APIRouter(prefix="/agent", tags=["agent"])


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(min_length=1, max_length=300)
    durationMinutes: Literal[5, 10, 15]
    lang: Literal["en", "kn", "hi"] = "en"
    priorGaps: list[str] = Field(default_factory=list, max_length=20)


class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["approve", "revise", "continue", "answer", "ask", "finish"]
    proposalId: Optional[str] = Field(default=None, max_length=80)
    feedback: Optional[str] = Field(default=None, max_length=2000)
    selectedIndex: Optional[int] = None
    text: Optional[str] = Field(default=None, max_length=2000)
    view: Literal["asha", "learner"] = "asha"


def _agent_error(error: AgentError) -> HTTPException:
    status = 404 if str(error) == "session not found" else 409
    return HTTPException(status_code=status, detail=str(error))


@router.get("/sources")
def sources():
    return knowledge.list_sources()


@router.get("/sessions")
def sessions():
    return list_sessions()


@router.post("/start")
async def start(body: StartRequest):
    try:
        return await start_session(body.topic, body.durationMinutes, body.lang, body.priorGaps)
    except AgentError as error:
        raise _agent_error(error) from error


@router.get("/session/{session_id}")
def session(session_id: str, view: Literal["asha", "learner"] = "learner"):
    try:
        return get_session(session_id, view)
    except AgentError as error:
        raise _agent_error(error) from error


@router.post("/session/{session_id}/action")
async def action(session_id: str, body: ActionRequest):
    try:
        return await mutate_session(
            session_id, action=body.action, proposal_id=body.proposalId,
            feedback=body.feedback, selected_index=body.selectedIndex,
            text=body.text, view=body.view,
        )
    except AgentError as error:
        raise _agent_error(error) from error
