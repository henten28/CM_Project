import logging
import uuid
from typing import Any, Dict, List, Optional

from agents import planning_agent, retrieval_agent, safety_controller, summary_agent, tutor_agent
from agents.content import repo
from agents.models import AnswerIn, Handoff, SafetyResult, SessionRecord, now_iso

log = logging.getLogger("orchestrator")

# in-memory session store for the prototype; the proposal's SQLite + SQLAlchemy layer replaces this
_SESSIONS: Dict[str, SessionRecord] = {}


class NotFound(LookupError):
    pass


class BadState(RuntimeError):
    pass


def _handoff(s: SessionRecord, source: str, target: str, action: str, **data: Any) -> None:
    s.log.append(Handoff(source=source, target=target, action=action, data=data))
    log.info("%s %s -> %s: %s %s", s.id, source, target, action, data)


def get(session_id: str) -> SessionRecord:
    s = _SESSIONS.get(session_id)
    if s is None:
        raise NotFound(session_id)
    return s


def _require(s: SessionRecord, *states: str) -> None:
    if s.state not in states:
        raise BadState(f"session is {s.state}, expected {' or '.join(states)}")


def _safety_gate(s: SessionRecord, text: str, where: str) -> Optional[SafetyResult]:
    # runs before any agent sees free text; a hit hard-overrides generation
    res = safety_controller.classify(text)
    if not res.triggered:
        return None
    task = safety_controller.escalation_for(res)
    s.escalations.append(task)
    _handoff(s, where, "safety_controller", "override", category=res.category, ruleId=res.ruleId, taskId=task.id)
    return res


# ── 1. start: planning agent proposes, ASHA reviews ──

async def start(topic: str, duration: int, lang: str, prior_gaps: List[str]) -> Dict[str, Any]:
    s = SessionRecord(id=f"sess-{uuid.uuid4().hex[:12]}", topic=topic, durationMinutes=duration, lang=lang,
                      priorGaps=prior_gaps)
    _SESSIONS[s.id] = s
    _handoff(s, "api", "orchestrator", "start", duration=duration, lang=lang, priorGaps=prior_gaps)

    safety = _safety_gate(s, topic, "start")
    if safety:
        s.state = "SAFETY_HOLD"
        s.startSafety = safety
        return {"session": s, "safety": safety, "plan": None}

    plan, source, notes = await planning_agent.run(topic, duration, lang, prior_gaps)
    s.plan, s.planSource = plan, source
    _handoff(s, "planning_agent", "asha", "plan_for_review", planSource=source, notes=notes,
             contentIds=[c for m in plan.lessonPlan for c in m.contentIds])
    return {"session": s, "safety": None, "plan": plan}


# ── 2. steps: approve, answer, ask ──

def approve(s: SessionRecord, edited_content_ids: Optional[List[str]]) -> Dict[str, Any]:
    _require(s, "AWAITING_APPROVAL")
    plan = s.plan
    warnings: List[str] = []
    if edited_content_ids is not None:
        # ASHA edits must still use approved content ids; time may run over, which is the ASHA's call
        known = repo().block_by_id
        unknown = [c for c in edited_content_ids if c not in known]
        if unknown:
            raise ValueError(f"edited plan has unknown or unapproved content ids: {unknown}")
        ids = list(dict.fromkeys(edited_content_ids))
        if not ids:
            raise ValueError("edited plan is empty")
        plan = planning_agent.build_plan(ids)
        total = sum(m.estimatedMinutes for m in plan.lessonPlan)
        if total > s.durationMinutes:
            warnings.append(f"edited plan is {total} min, over the {s.durationMinutes} min session")
    s.approvedPlan = plan
    s.state = "IN_PROGRESS"
    _handoff(s, "asha", "orchestrator", "approve", edited=edited_content_ids is not None, warnings=warnings)

    ids = [c for m in plan.lessonPlan for c in m.contentIds]
    content = retrieval_agent.fetch(ids, s.lang)
    s.deliveredContentIds += [c for c in content.contentIds if c not in s.deliveredContentIds]
    _handoff(s, "retrieval_agent", "tutor_agent", "lesson_content", contentIds=content.contentIds,
             sources=[x["id"] for x in content.sources])

    questions = tutor_agent.pick_questions(plan, [], s.priorGaps, n=3)
    s.askedQuestionIds += [q["id"] for q in questions]
    _handoff(s, "tutor_agent", "asha", "checkpoint_quiz", questionIds=[q["id"] for q in questions])
    return {"content": content, "questions": [tutor_agent.public_question(q) for q in questions],
            "warnings": warnings}


def answer(s: SessionRecord, answers: List[AnswerIn]) -> Dict[str, Any]:
    _require(s, "IN_PROGRESS")
    result, records = tutor_agent.run(s, answers)
    s.answers += records
    s.askedQuestionIds += [q.id for q in result.nextQuestions if q.id not in s.askedQuestionIds]

    shown = [c for f in result.feedback for c in f.reinforcementContentIds] + result.nextActivity.contentIds
    shown = list(dict.fromkeys(shown))
    content = retrieval_agent.fetch(shown, s.lang)
    s.deliveredContentIds += [c for c in content.contentIds if c not in s.deliveredContentIds]
    _handoff(s, "tutor_agent", "retrieval_agent", "reinforcement_request", gaps=result.gaps,
             contentIds=content.contentIds)
    _handoff(s, "tutor_agent", "asha", "next_activity", score=result.scorePercent,
             level=result.nextActivity.level, kind=result.nextActivity.kind)
    return {"tutor": result, "content": content}


def ask(s: SessionRecord, text: str) -> Dict[str, Any]:
    _require(s, "AWAITING_APPROVAL", "IN_PROGRESS", "SAFETY_HOLD")
    safety = _safety_gate(s, text, "ask")
    if safety:
        return {"safety": safety, "content": None}
    # safe educational question: answer only with approved content, never generated text
    content = retrieval_agent.search(query=text, lang=s.lang, limit=3)
    _handoff(s, "retrieval_agent", "asha", "answer_from_library", contentIds=content.contentIds,
             refinements=content.refinements)
    return {"safety": None, "content": content}


# ── 3. complete: summary agent ──

def complete(s: SessionRecord) -> Dict[str, Any]:
    if s.state == "COMPLETED" and s.summary is not None:
        return {"summary": s.summary}  # idempotent
    s.summary = summary_agent.run(s)
    s.state = "COMPLETED"
    s.completedAt = now_iso()
    _handoff(s, "summary_agent", "dashboard", "session_summary", score=s.summary.scorePercent,
             gaps=[g.conceptTag for g in s.summary.remainingGaps], referrals=len(s.summary.referralTasks))
    return {"summary": s.summary}
