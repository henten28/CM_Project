from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field


# ── structured output the model must return (mirrors lib/agents/planning.ts PlanOutput) ──

class LessonModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    moduleId: str = Field(description="id of a module from the provided catalog")
    contentIds: List[str] = Field(default_factory=list, description="content block ids for this module")
    estimatedMinutes: int = Field(ge=1, le=120)


class AgentNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kn: str = Field(min_length=1, description="note in Kannada")
    en: str = Field(min_length=1, description="note in English")


class LessonPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lessonPlan: List[LessonModule] = Field(min_length=1)
    agentNote: AgentNote


# ── request bodies ──

class ModuleInfo(BaseModel):
    id: str
    title: str
    estimatedMinutes: int = Field(ge=1)
    contentIds: List[str] = Field(default_factory=list)


class PlanRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    availableMinutes: int = Field(ge=1, le=240)
    priorGaps: List[str] = Field(default_factory=list)
    lang: Literal["kn", "en"] = "kn"
    modules: List[ModuleInfo] = Field(min_length=1)
