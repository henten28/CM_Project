import logging
from typing import Dict, List, Optional, Tuple

from agents import retrieval_agent
from agents.content import repo
from schemas import AgentNote, LessonModule, LessonPlan
from services import bedrock

log = logging.getLogger("planning_agent")

ALLOWED_DURATIONS = (5, 10, 15)

SYSTEM = (
    "You are the Planning Agent of AMR Jagruti, an education tool for ASHA workers. "
    "Build a short lesson plan using ONLY content block ids from the catalog. "
    "Group blocks under their own moduleId. The sum of block minutes must not exceed the session duration. "
    "Prefer blocks that cover the learner's prior gaps, then the requested topic, then basic before advanced. "
    "Never write medical advice; agentNote only describes the plan, in Kannada (kn) and English (en)."
)


def build_plan(content_ids: List[str]) -> LessonPlan:
    # group an ordered list of block ids into modules; minutes always come from the repository
    r = repo()
    groups: Dict[str, List[str]] = {}
    for cid in content_ids:
        groups.setdefault(r.block_by_id[cid]["moduleId"], []).append(cid)
    modules = [
        LessonModule(
            moduleId=mid,
            contentIds=cids,
            estimatedMinutes=sum(r.block_by_id[c]["estimatedMinutes"] for c in cids),
        )
        for mid, cids in groups.items()
    ]
    total = sum(m.estimatedMinutes for m in modules)
    note = AgentNote(
        kn=f"ಯೋಜನಾ ಏಜೆಂಟ್: {len(modules)} ಮಾಡ್ಯೂಲ್, {len(content_ids)} ವಿಷಯ ಬ್ಲಾಕ್ ({total} ನಿಮಿಷ). ASHA ಅನುಮೋದನೆ ಅಗತ್ಯ.",
        en=f"Planning Agent: {len(modules)} module(s), {len(content_ids)} content block(s) ({total} min). ASHA approval required.",
    )
    return LessonPlan(lessonPlan=modules, agentNote=note)


def validate_plan(plan: LessonPlan, duration: Optional[int]) -> Tuple[Optional[LessonPlan], List[str]]:
    # returns a normalised plan (minutes recomputed from the repo) or None with the reasons it failed
    r = repo()
    errors: List[str] = []
    ordered: List[str] = []
    for m in plan.lessonPlan:
        if m.moduleId not in r.module_by_id:
            errors.append(f"unknown module {m.moduleId}")
            continue
        if not m.contentIds:
            errors.append(f"module {m.moduleId} has no content")
        for cid in m.contentIds:
            block = r.block_by_id.get(cid)
            if block is None:
                errors.append(f"unknown or unapproved content {cid}")
            elif block["moduleId"] != m.moduleId:
                errors.append(f"content {cid} does not belong to {m.moduleId}")
            elif cid in ordered:
                errors.append(f"duplicate content {cid}")
            else:
                ordered.append(cid)
    if not ordered:
        errors.append("plan has no content")
    if errors:
        return None, errors
    fixed = build_plan(ordered)
    total = sum(m.estimatedMinutes for m in fixed.lessonPlan)
    if duration is not None and total > duration:
        return None, [f"plan is {total} min, over the {duration} min session"]
    return fixed, []


def rules_plan(topic: str, duration: int, prior_gaps: List[str], lang: str) -> LessonPlan:
    r = repo()
    # 1) blocks for prior gaps, 2) blocks for the topic, 3) anything else basic-first as filler
    # one block per prior gap, so gaps never crowd the requested topic out of a short session
    gap_ids = [c for g in prior_gaps for c in retrieval_agent.search(concept_tags=[g], lang=lang, limit=1).contentIds]
    topic_ids = retrieval_agent.search(query=topic, lang=lang, limit=10).contentIds
    filler = [b["id"] for b in sorted(r.blocks, key=lambda b: (b["difficulty"] != "basic", b["id"]))]

    chosen: List[str] = []
    used = 0
    for cid in gap_ids + topic_ids + filler:
        mins = r.block_by_id[cid]["estimatedMinutes"]
        if cid in chosen or used + mins > duration:
            continue
        chosen.append(cid)
        used += mins
    if not chosen:
        # session shorter than any block: take the shortest relevant one
        pool = gap_ids + topic_ids or filler
        chosen = [min(pool, key=lambda c: r.block_by_id[c]["estimatedMinutes"])]

    # keep repository order inside the plan so lessons read in sequence
    order = {b["id"]: i for i, b in enumerate(r.blocks)}
    return build_plan(sorted(chosen, key=order.__getitem__))


def _catalog() -> str:
    r = repo()
    return "\n".join(
        f"- {b['id']} | module {b['moduleId']} | {b['estimatedMinutes']} min | {b['difficulty']} | "
        f"tags {','.join(b['conceptTags'])} | {b['title']['en']}"
        for b in r.blocks
    )


async def run(topic: str, duration: int, lang: str, prior_gaps: List[str]) -> Tuple[LessonPlan, str, List[str]]:
    # returns (plan, source, notes); source is "llm" or "rules"
    if duration not in ALLOWED_DURATIONS:
        raise ValueError(f"duration must be one of {ALLOWED_DURATIONS}")

    if bedrock.is_mock_mode():
        return rules_plan(topic, duration, prior_gaps, lang), "rules", ["mock mode: rule-based plan"]

    prompt = (
        f"Topic: {topic}\nSession duration: {duration} minutes\nLearner language: {lang}\n"
        f"Prior gaps (concept tags): {', '.join(prior_gaps) or 'none'}\n\nContent catalog:\n{_catalog()}"
    )
    try:
        draft = await bedrock.generate_structured(prompt, LessonPlan, system=SYSTEM)
    except bedrock.BedrockError as e:
        log.warning("planning LLM failed, using rules: %s", e)
        return rules_plan(topic, duration, prior_gaps, lang), "rules", [f"llm_error: {e}"]

    plan, errors = validate_plan(draft, duration)
    if plan is None:
        # the backend, not the model, decides what is allowed
        log.warning("planning LLM output rejected: %s", errors)
        return rules_plan(topic, duration, prior_gaps, lang), "rules", [f"llm_plan_rejected: {e}" for e in errors]
    return plan, "llm", []
