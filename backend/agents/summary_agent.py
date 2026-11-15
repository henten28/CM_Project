from typing import Dict, List, Tuple

from pydantic import BaseModel, ConfigDict, Field

from agents import llm, retrieval_agent, tutor_agent
from agents.content import repo
from agents.models import Bilingual, CoveredModule, GapItem, SessionRecord, SessionSummary


def run(session: SessionRecord) -> SessionSummary:
    # deterministic compilation from the session log; no model call, so nothing medical is generated here
    r = repo()
    delivered = set(session.deliveredContentIds)

    covered: List[CoveredModule] = []
    if session.approvedPlan:
        for m in session.approvedPlan.lessonPlan:
            ids = [c for c in m.contentIds if c in delivered]
            if ids:
                covered.append(CoveredModule(moduleId=m.moduleId, title=r.module_by_id[m.moduleId]["title"],
                                             contentIds=ids))

    # open gaps = wrong on the latest attempt, plus prior gaps never answered correctly in this session
    gaps = tutor_agent.gaps_from(session.answers)
    fixed = {a.conceptTag for a in session.answers if a.correct}
    for g in session.priorGaps:
        if g not in gaps and g not in fixed:
            gaps.append(g)

    remaining = []
    for tag in gaps:
        label = r.gap_labels.get(tag, {"kn": tag, "en": tag})
        follow = r.follow_ups.get(tag, {"kn": f"{tag} ಬಗ್ಗೆ ಮರು ಶಿಕ್ಷಣ ನೀಡಿ.", "en": f"Re-educate on {tag} at next visit."})
        suggested = retrieval_agent.search(concept_tags=[tag], lang=session.lang, limit=2).contentIds
        remaining.append(GapItem(conceptTag=tag, label=label, suggestedContentIds=suggested, followUp=follow))

    cited_ids = sorted({r.block_by_id[c]["sourceId"] for c in delivered if c in r.block_by_id})
    pct = tutor_agent.score(session.answers)
    note = Bilingual(
        kn=f"ಸಾರಾಂಶ ಏಜೆಂಟ್: {len(covered)} ವಿಷಯ, ಅಂಕ {pct:g}%, {len(remaining)} ತಿಳಿವಳಿಕೆ ಕೊರತೆ.",
        en=f"Summary Agent: {len(covered)} topic(s) covered, score {pct:g}%, {len(remaining)} gap(s) identified.",
    )
    return SessionSummary(
        sessionId=session.id, scorePercent=pct, answered=len(session.answers), covered=covered,
        remainingGaps=remaining, referralTasks=session.escalations,
        sourcesCited=[{"id": s, "name": r.sources[s]} for s in cited_ids],
        contentVersion=r.version, note=note,
    )


# ── LLM summary: recap and next-visit suggestion written from the session log ──

class _Text(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kn: str = Field(description="Kannada")
    en: str = Field(description="English")


class SummaryDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    narrative: _Text = Field(description="2-3 sentence recap of the session for the ASHA worker and supervisor")
    nextVisit: _Text = Field(description="1-2 sentences: what the ASHA should revisit with this household next time")
    priorityGaps: List[str] = Field(max_length=10, description="the open gap tags, most important first")


SUMMARY_SYSTEM = (
    "You are the Summary and Follow-up Agent. Using ONLY the session facts given, write a short recap of what the "
    "household learned and how they did, and a suggestion for the next visit. Order the open gaps by importance "
    "using only the gap tags given. Mention referrals only as 'referred to the ANM/health worker'. Do not invent "
    "facts, scores, or medical advice."
)


async def run_with_llm(session: SessionRecord) -> Tuple[SessionSummary, Dict]:
    summary = run(session)
    if not llm.enabled():
        return summary, {"agentSource": "rules", "note": "mock mode: rules"}
    r = repo()
    gap_tags = [g.conceptTag for g in summary.remainingGaps]
    covered = "; ".join(f"{c.title.en} ({len(c.contentIds)} lesson(s))" for c in summary.covered) or "none"
    answers = "\n".join(f"  - {a.conceptTag}: {'correct' if a.correct else 'wrong'} | "
                        f"{r.quiz_by_id[a.questionId]['question']['en'] if a.questionId in r.quiz_by_id else a.questionId}"
                        for a in session.answers) or "  (no quiz answers)"
    prompt = (
        f"Topic: {session.topic} | duration {session.durationMinutes} min | language {session.lang}\n"
        f"Topics covered: {covered}\nQuiz score: {summary.scorePercent}% over {summary.answered} answer(s)\n"
        f"Answers:\n{answers}\nOpen gap tags: {', '.join(gap_tags) or 'none'}\n"
        f"Referrals logged by the safety controller: {len(summary.referralTasks)}"
    )
    draft, note = await llm.call("summary_agent", prompt, SummaryDraft, SUMMARY_SYSTEM, max_tokens=700)
    if draft is None:
        return summary, {"agentSource": "rules", "note": note}

    # reorder gaps by the model's priority, keeping only real gap tags; anything it left out keeps its place at the end
    order = [t for t in dict.fromkeys(draft.priorityGaps) if t in gap_tags]
    rank = {t: i for i, t in enumerate(order)}
    summary.remainingGaps.sort(key=lambda g: rank.get(g.conceptTag, len(rank)))
    summary.narrative = llm.safe_bilingual(Bilingual(kn=draft.narrative.kn, en=draft.narrative.en))
    summary.nextVisit = llm.safe_bilingual(Bilingual(kn=draft.nextVisit.kn, en=draft.nextVisit.en))
    summary.agentSource = "llm"
    return summary, {"agentSource": "llm", "priority": order,
                     "screenedOut": [k for k in ("narrative", "nextVisit") if getattr(summary, k) is None]}
