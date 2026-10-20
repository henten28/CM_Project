from typing import List

from agents import retrieval_agent, tutor_agent
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
