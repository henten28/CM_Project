import json
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException

import db
from agents import tutor_agent
from agents.models import SessionRecord

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

EVAL_REPORT = Path(__file__).resolve().parent.parent / "eval" / "report.json"


def _plan_valid(s: SessionRecord) -> Optional[bool]:
    # True when the planner's own output passed backend validation; None when no plan was made (safety hold)
    if s.plan is None:
        return None
    for h in s.log:
        if h.action == "plan_for_review":
            notes = h.data.get("notes") or []
            return not any(str(n).startswith(("llm_plan_rejected", "llm_error")) for n in notes)
    return True


def _row(s: SessionRecord) -> Dict[str, Any]:
    gaps = [g.conceptTag for g in s.summary.remainingGaps] if s.summary else tutor_agent.gaps_from(s.answers)
    return {
        "id": s.id, "topic": s.topic, "lang": s.lang, "state": s.state,
        "date": s.createdAt[:10], "createdAt": s.createdAt, "durationMin": s.durationMinutes,
        "quizScore": round(tutor_agent.score(s.answers)), "totalQ": len(s.answers),
        "correctQ": sum(a.correct for a in s.answers), "gaps": gaps,
        "safetyRouted": bool(s.escalations), "openTasks": sum(t.status == "open" for t in s.escalations),
        "lessonPlanValid": _plan_valid(s), "planSource": s.planSource if s.plan else None,
        "sessionCompleted": s.state == "COMPLETED",
    }


@router.get("/sessions")
def sessions(limit: int = 200):
    # newest first; one row per session for the supervisor dashboard
    return [_row(s) for s in db.list_sessions(limit=min(max(limit, 1), 1000))]


@router.get("/tasks")
def tasks(status: Literal["open", "closed", "all"] = "open"):
    return db.list_tasks(None if status == "all" else status)


@router.post("/tasks/{task_id}/close")
def close_task(task_id: str):
    task = db.close_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.get("/evaluation")
def evaluation():
    # latest report written by `python -m eval.run_eval`; null when it has never been run
    if not EVAL_REPORT.exists():
        return None
    return json.loads(EVAL_REPORT.read_text(encoding="utf-8"))
