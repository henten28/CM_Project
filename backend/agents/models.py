from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from schemas import LessonPlan

Lang = Literal["kn", "en", "hi"]
Level = Literal["easy", "medium", "hard"]
SafetyCategory = Literal["SAFE", "URGENT", "DOSAGE", "SELF_MEDICATION", "PERSONAL_MEDICAL"]
# SAFETY_HOLD: the start topic itself tripped the safety controller, so no plan was generated
SessionState = Literal["AWAITING_APPROVAL", "IN_PROGRESS", "SAFETY_HOLD", "COMPLETED"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Bilingual(BaseModel):
    kn: str
    en: str


# ── retrieval ──

class ContentHit(BaseModel):
    id: str
    moduleId: str
    title: Bilingual
    body: Bilingual
    conceptTags: List[str]
    difficulty: str
    sourceId: str
    source: str
    version: int
    verified: bool
    score: float


class RetrievalResult(BaseModel):
    contentIds: List[str]
    hits: List[ContentHit]
    sources: List[Dict[str, str]]  # [{id, name}]
    refinements: List[str]  # which filters were relaxed to reach coverage
    displayLang: Literal["kn", "en"]
    contentVersion: str


# ── tutor ──

class QuizItem(BaseModel):
    # what the client sees: no correct answer
    id: str
    conceptTag: str
    question: Bilingual
    options: List[Bilingual]


class AnswerIn(BaseModel):
    questionId: str
    selectedIndex: int = Field(ge=0)


class AnswerRecord(BaseModel):
    questionId: str
    selectedIndex: int
    correct: bool
    conceptTag: str
    at: str = Field(default_factory=now_iso)


class AnswerFeedback(BaseModel):
    questionId: str
    correct: bool
    conceptTag: str
    explanation: Bilingual  # reviewed explanation from the quiz bank
    reinforcementContentIds: List[str]


class NextActivity(BaseModel):
    level: Level
    kind: Literal["recap", "guided_practice", "case_study"]
    contentIds: List[str]
    questionIds: List[str]


class TutorResult(BaseModel):
    scorePercent: float
    answered: int
    correct: int
    gaps: List[str]
    feedback: List[AnswerFeedback]
    nextActivity: NextActivity
    nextQuestions: List[QuizItem]


# ── safety ──

class EscalationTask(BaseModel):
    id: str
    category: SafetyCategory
    ruleId: str
    actionKey: str  # stable key the dashboard can localise
    action: str  # English description for the supervisor dashboard
    status: Literal["open", "closed"] = "open"
    simulated: bool = True  # prototype: no real referral is sent
    createdAt: str = Field(default_factory=now_iso)


class SafetyResult(BaseModel):
    triggered: bool
    category: SafetyCategory
    ruleId: Optional[str] = None
    message: Optional[Dict[str, str]] = None  # fixed text, keys kn/en/hi
    helpline: Optional[str] = None


# ── summary ──

class CoveredModule(BaseModel):
    moduleId: str
    title: Bilingual
    contentIds: List[str]


class GapItem(BaseModel):
    conceptTag: str
    label: Bilingual
    suggestedContentIds: List[str]
    followUp: Bilingual


class SessionSummary(BaseModel):
    sessionId: str
    scorePercent: float
    answered: int
    covered: List[CoveredModule]
    remainingGaps: List[GapItem]
    referralTasks: List[EscalationTask]
    sourcesCited: List[Dict[str, str]]
    contentVersion: str
    note: Bilingual


# ── session record and audit log ──

class Handoff(BaseModel):
    at: str = Field(default_factory=now_iso)
    source: str
    target: str
    action: str
    data: Dict[str, Any] = Field(default_factory=dict)


class SessionRecord(BaseModel):
    id: str
    state: SessionState = "AWAITING_APPROVAL"
    topic: str
    durationMinutes: int
    lang: Lang
    priorGaps: List[str]
    plan: Optional[LessonPlan] = None
    planSource: Literal["llm", "rules"] = "rules"
    approvedPlan: Optional[LessonPlan] = None
    startSafety: Optional[SafetyResult] = None  # set when the start topic itself was unsafe
    deliveredContentIds: List[str] = Field(default_factory=list)
    askedQuestionIds: List[str] = Field(default_factory=list)
    answers: List[AnswerRecord] = Field(default_factory=list)
    escalations: List[EscalationTask] = Field(default_factory=list)
    log: List[Handoff] = Field(default_factory=list)
    summary: Optional[SessionSummary] = None
    createdAt: str = Field(default_factory=now_iso)
    completedAt: Optional[str] = None
