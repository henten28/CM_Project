"""Unauthenticated same-browser demo API for reviewed quizzes and learner attempts."""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictInt

import quiz_bank

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


class CitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chunkId: str = Field(min_length=1, max_length=160)
    quote: str = Field(min_length=1, max_length=1500)


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    explanation: str = Field(min_length=1, max_length=800)
    conceptTag: str = Field(min_length=1, max_length=80)
    citations: list[CitationInput] = Field(min_length=1, max_length=10)


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(min_length=1, max_length=300)
    lang: Literal["en", "kn", "hi"] = "en"
    difficulty: Literal["basic", "intermediate", "advanced"] = "basic"
    questionCount: StrictInt = Field(default=5, ge=1, le=10)


class DraftAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["edit_question", "regenerate_question", "regenerate_quiz", "publish"]
    expectedRevision: StrictInt = Field(ge=1)
    questionId: Optional[str] = Field(default=None, max_length=100)
    question: Optional[QuestionInput] = None
    feedback: Optional[str] = Field(default=None, max_length=2000)


class AttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: StrictInt = Field(ge=1)


class SubmittedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questionId: str = Field(min_length=1, max_length=100)
    selectedIndex: StrictInt


class SubmitAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[SubmittedAnswer] = Field(min_length=1, max_length=10)


def _error(error: quiz_bank.QuizError) -> HTTPException:
    missing = str(error).endswith("not found") or str(error).endswith("version not found")
    return HTTPException(status_code=404 if missing else 409, detail=str(error))


@router.get("")
def published_quizzes():
    return quiz_bank.list_published()


@router.get("/drafts")
def drafts():
    return quiz_bank.list_drafts()


@router.post("/drafts")
async def create_draft(body: DraftRequest):
    try:
        return await quiz_bank.create_draft(body.topic, body.lang, body.difficulty, body.questionCount)
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.get("/drafts/{draft_id}")
def draft(draft_id: str):
    try:
        return quiz_bank.get_draft(draft_id)
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.post("/drafts/{draft_id}/action")
async def draft_action(draft_id: str, body: DraftAction):
    try:
        return await quiz_bank.mutate_draft(
            draft_id, action=body.action, expected_revision=body.expectedRevision,
            question_id=body.questionId,
            question=body.question.model_dump() if body.question is not None else None,
            feedback=body.feedback,
        )
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.get("/attempts/{attempt_id}")
def attempt(attempt_id: str):
    try:
        return quiz_bank.get_attempt(attempt_id)
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.post("/attempts/{attempt_id}/submit")
async def submit(attempt_id: str, body: SubmitAttempt):
    try:
        return await quiz_bank.submit_attempt(
            attempt_id, [answer.model_dump() for answer in body.answers])
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.get("/{quiz_id}")
def published_quiz(quiz_id: str, version: Optional[int] = Query(default=None, ge=1)):
    try:
        return quiz_bank.get_published(quiz_id, version)
    except quiz_bank.QuizError as error:
        raise _error(error) from error


@router.post("/{quiz_id}/attempts")
async def create_attempt(quiz_id: str, body: AttemptRequest):
    try:
        return await quiz_bank.create_attempt(quiz_id, body.version)
    except quiz_bank.QuizError as error:
        raise _error(error) from error
