from typing import Dict, List, Optional, Sequence

from agents import retrieval_agent
from agents.content import repo
from agents.models import (AnswerFeedback, AnswerIn, AnswerRecord, NextActivity, QuizItem, SessionRecord,
                           TutorResult)
from schemas import LessonPlan

# fixed branching thresholds (percent of answers correct so far)
HARD_AT = 80.0
MEDIUM_AT = 40.0

# activity shape per level: (kind, content difficulty to look for, extra concept tags)
_ACTIVITY = {
    "easy": ("recap", "basic", []),
    "medium": ("guided_practice", "intermediate", []),
    "hard": ("case_study", "advanced", ["case-study"]),
}


class TutorError(ValueError):
    pass


def level_for(score_percent: float) -> str:
    if score_percent >= HARD_AT:
        return "hard"
    if score_percent >= MEDIUM_AT:
        return "medium"
    return "easy"


def score(answers: Sequence[AnswerRecord]) -> float:
    if not answers:
        return 0.0
    return round(100.0 * sum(a.correct for a in answers) / len(answers), 1)


def gaps_from(answers: Sequence[AnswerRecord]) -> List[str]:
    # a concept is a gap when its most recent answer was wrong
    latest: Dict[str, bool] = {}
    for a in answers:
        latest[a.conceptTag] = a.correct
    return [tag for tag, ok in latest.items() if not ok]


def plan_tags(plan: Optional[LessonPlan]) -> List[str]:
    if plan is None:
        return []
    r = repo()
    tags: List[str] = []
    for m in plan.lessonPlan:
        for t in r.module_concepts.get(m.moduleId, []):
            if t not in tags:
                tags.append(t)
    return tags


def public_question(q: Dict) -> QuizItem:
    return QuizItem(id=q["id"], conceptTag=q["conceptTag"], question=q["question"], options=q["options"])


def pick_questions(plan: Optional[LessonPlan], exclude_ids: Sequence[str], gaps: Sequence[str], n: int = 3) -> List[Dict]:
    # order: open gaps first, then concepts of the approved plan, then the rest of the bank
    r = repo()
    tags = plan_tags(plan)
    pool = [q for q in r.quiz if q["id"] not in set(exclude_ids)]
    rank = lambda q: (0 if q["conceptTag"] in gaps else 1 if q["conceptTag"] in tags else 2, q["id"])
    return sorted(pool, key=rank)[:n]


def _reinforcement(tag: str, lang: str, delivered: Sequence[str]) -> List[str]:
    # ask the retrieval agent for blocks on the missed concept; keep only ones carrying that exact tag,
    # preferring one not yet shown, otherwise re-show an already delivered one
    res = retrieval_agent.search(concept_tags=[tag], difficulty="basic", lang=lang, limit=10)
    tagged = [h.id for h in res.hits if tag.lower() in (t.lower() for t in h.conceptTags)]
    fresh = [c for c in tagged if c not in set(delivered)]
    return (fresh or tagged)[:1]


def _next_activity(level: str, gaps: List[str], focus: List[str], lang: str, delivered: Sequence[str],
                   question_ids: List[str]) -> NextActivity:
    kind, difficulty, extra = _ACTIVITY[level]
    tags = extra + (gaps or focus)
    res = retrieval_agent.search(concept_tags=tags, difficulty=difficulty, lang=lang, limit=2, exclude_ids=delivered)
    if not res.contentIds:
        res = retrieval_agent.search(concept_tags=tags, difficulty=difficulty, lang=lang, limit=2)
    return NextActivity(level=level, kind=kind, contentIds=res.contentIds, questionIds=question_ids)


def run(session: SessionRecord, new_answers: List[AnswerIn]) -> tuple:
    # returns (TutorResult, new AnswerRecords); the orchestrator stores the records
    r = repo()
    if not new_answers:
        raise TutorError("no answers given")
    asked = set(session.askedQuestionIds)
    answered = {a.questionId for a in session.answers}

    records: List[AnswerRecord] = []
    feedback: List[AnswerFeedback] = []
    for a in new_answers:
        q = r.quiz_by_id.get(a.questionId)
        if q is None:
            raise TutorError(f"unknown question {a.questionId}")
        if a.questionId not in asked:
            raise TutorError(f"question {a.questionId} was not asked in this session")
        if a.questionId in answered or any(x.questionId == a.questionId for x in records):
            raise TutorError(f"question {a.questionId} already answered")
        if a.selectedIndex >= len(q["options"]):
            raise TutorError(f"selectedIndex out of range for {a.questionId}")

        correct = a.selectedIndex == q["correctIndex"]  # fixed scoring rule
        records.append(AnswerRecord(questionId=q["id"], selectedIndex=a.selectedIndex, correct=correct,
                                    conceptTag=q["conceptTag"]))
        feedback.append(AnswerFeedback(
            questionId=q["id"], correct=correct, conceptTag=q["conceptTag"], explanation=q["explanation"],
            reinforcementContentIds=[] if correct else _reinforcement(q["conceptTag"], session.lang,
                                                                     session.deliveredContentIds),
        ))

    all_answers = session.answers + records
    pct = score(all_answers)
    gaps = gaps_from(all_answers)
    lvl = level_for(pct)

    next_qs = pick_questions(session.approvedPlan, list(asked | answered | {x.questionId for x in records}), gaps, n=2)
    activity = _next_activity(lvl, gaps, plan_tags(session.approvedPlan), session.lang,
                              session.deliveredContentIds, [q["id"] for q in next_qs])

    result = TutorResult(
        scorePercent=pct, answered=len(all_answers), correct=sum(a.correct for a in all_answers), gaps=gaps,
        feedback=feedback, nextActivity=activity, nextQuestions=[public_question(q) for q in next_qs],
    )
    return result, records
