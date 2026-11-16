import re
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from pydantic import BaseModel, ConfigDict, Field

from agents import glossary, llm
from agents.content import display_lang, repo
from agents.models import ContentHit, RetrievalResult

# split on whitespace and punctuation only; \w would break Kannada/Hindi vowel signs
_SPLIT = re.compile(r"[\s,.;:!?()\[\]\"'“”‘’/।|-]+")
_STOP = {"the", "and", "for", "what", "why", "how", "are", "is", "a", "an", "of", "to", "in", "on", "with",
         "about", "when", "can", "should", "does", "do", "you", "it", "this", "that", "be", "or"}
_DIFF_ORDER = {"basic": 0, "intermediate": 1, "advanced": 2}


def _tokens(text: str) -> List[str]:
    return [t for t in _SPLIT.split(text.lower()) if len(t) >= 3 and t not in _STOP]


def _haystack(block: Dict) -> str:
    # search both reviewed languages so a Kannada query can hit English-tagged blocks and vice versa
    parts = [block["title"]["kn"], block["title"]["en"], block["body"]["kn"], block["body"]["en"]]
    parts += block["conceptTags"]
    return " ".join(parts).lower()


def _score(block: Dict, tokens: List[str], tags: Set[str], module_boost: Set[str], hay: str,
           glossary_tags: Set[str] = frozenset(), concepts: Sequence[Sequence[str]] = ()) -> float:
    block_tags = {t.lower() for t in block["conceptTags"]}
    score = 3.0 * len(tags & block_tags)  # concept-tag filter hits weigh most
    score += 1.5 * len(glossary_tags & block_tags)  # tags implied by glossary terms in the query
    # keyword hits, capped; a glossary concept counts once however many of its spellings appear
    hits = sum(1 for t in tokens if t in hay) + sum(1 for forms in concepts if any(f in hay for f in forms))
    score += min(hits, 5)
    if block["moduleId"] in module_boost:
        score += 1.5  # topic index points at this module
    return score


def _hit(b: Dict, score: float) -> ContentHit:
    return ContentHit(
        id=b["id"], moduleId=b["moduleId"], title=b["title"], body=b["body"],
        conceptTags=b["conceptTags"], difficulty=b["difficulty"], sourceId=b["sourceId"],
        source=repo().sources[b["sourceId"]], version=b["version"], verified=True, score=score,
    )


def fetch(content_ids: Iterable[str], lang: str = "en") -> RetrievalResult:
    # exact lookup of approved ids, in the order given (used once a plan is approved)
    r = repo()
    hits = []
    for cid in content_ids:
        b = r.block_by_id.get(cid)
        if b is None or not r.is_verified(b):
            continue
        hits.append(_hit(b, 0.0))
    source_ids = sorted({h.sourceId for h in hits})
    return RetrievalResult(
        contentIds=[h.id for h in hits], hits=hits,
        sources=[{"id": sid, "name": r.sources[sid]} for sid in source_ids],
        refinements=[], displayLang=display_lang(lang), contentVersion=r.version,
    )


def search(
    query: str = "",
    concept_tags: Iterable[str] = (),
    module_ids: Iterable[str] = (),
    difficulty: Optional[str] = None,
    lang: str = "en",
    min_results: int = 1,
    limit: int = 5,
    exclude_ids: Iterable[str] = (),
    expand: bool = True,
) -> RetrievalResult:
    r = repo()
    tokens = _tokens(query)
    tags = {t.lower() for t in concept_tags}
    modules = set(module_ids)
    excluded = set(exclude_ids)

    # glossary expansion searches the English and Kannada-script forms of terms written in any script,
    # so "jwara", "ಜ್ವರ" and "fever" all search the same way
    glossary_tags: Set[str] = set()
    concepts: List[List[str]] = []
    q_lower = query.lower()
    if expand and query:
        expansion = glossary.expand(query)
        concepts = expansion.forms
        covered = {f for forms in concepts for f in forms}
        tokens = [t for t in tokens if t not in covered]  # already counted through their concept
        glossary_tags = {t.lower() for t in expansion.tags}
        q_lower = " ".join([q_lower] + expansion.en + expansion.kn).lower()

    # topic index keywords (en + kn) map free text to modules
    module_boost = {m for key, mods in r.topic_index.items() if key in q_lower for m in mods}

    has_criteria = bool(tokens or tags or modules or module_boost or glossary_tags or concepts)
    tag_words = [w for t in tags for w in t.split("-") if len(w) >= 3]

    # refinement passes: each one relaxes a filter when coverage is short
    passes = [
        ("exact", difficulty, modules, tokens),
        ("drop_difficulty", None, modules, tokens),
        ("drop_module_filter", None, set(), tokens),
        ("expand_tags_to_keywords", None, set(), tokens + tag_words),
    ]
    refinements: List[str] = []
    ranked: List[tuple] = []

    for name, diff, mods, toks in passes:
        if name != "exact":
            refinements.append(name)
        ranked = []
        for b in r.blocks:
            if b["id"] in excluded or not r.is_verified(b):
                continue
            if diff and b["difficulty"] != diff:
                continue
            if mods and b["moduleId"] not in mods:
                continue
            s = _score(b, toks, tags, module_boost, _haystack(b), glossary_tags, concepts)
            if mods:
                s += 2.0  # explicitly requested module
            if s <= 0 and has_criteria:
                continue
            ranked.append((s, b))
        if len(ranked) >= min_results:
            break

    # highest score first, then easier content, then stable id order
    ranked.sort(key=lambda sb: (-sb[0], _DIFF_ORDER.get(sb[1]["difficulty"], 9), sb[1]["id"]))
    ranked = ranked[:limit]

    hits = [_hit(b, s) for s, b in ranked]
    source_ids = sorted({h.sourceId for h in hits})
    return RetrievalResult(
        contentIds=[h.id for h in hits],
        hits=hits,
        sources=[{"id": sid, "name": r.sources[sid]} for sid in source_ids],
        refinements=refinements,
        displayLang=display_lang(lang),
        contentVersion=r.version,
    )


# ── LLM-assisted search (used for free-text questions during a session) ──
# The model turns a household's question (Kannada, English or mixed) into search terms and filters drawn from the
# approved vocabulary. Retrieval itself stays lexical over reviewed content, so the model can widen or narrow the
# search but can never add content. If coverage is empty, the model gets one chance to refine its search.


class SearchPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    searchTerms: List[str] = Field(default_factory=list, max_length=8,
                                   description="short English keywords likely to appear in the lesson text")
    conceptTags: List[str] = Field(default_factory=list, max_length=4, description="tags from the given vocabulary")
    moduleIds: List[str] = Field(default_factory=list, max_length=3, description="module ids from the given list")


RETRIEVAL_SYSTEM = (
    "You are the Retrieval Agent. Turn the question into a search over the approved lesson library. "
    "Questions may be in Kannada, English, Hindi or romanised Kannada. Return short English search terms, "
    "concept tags chosen ONLY from the vocabulary, and at most three module ids ONLY from the module list. "
    "Do not answer the question yourself."
)


def vocabulary() -> Tuple[List[str], List[str]]:
    r = repo()
    tags = sorted({t for b in r.blocks for t in b["conceptTags"]})
    modules = [f"{m['id']}: {m['title']['en']}" for m in r.modules]
    return tags, modules


def _clean(plan: SearchPlan) -> Tuple[SearchPlan, List[str]]:
    # keep only tags and modules that exist; the model never gets to invent filters
    r = repo()
    tags, _ = vocabulary()
    known_tags = {t.lower(): t for t in tags}
    dropped = [t for t in plan.conceptTags if t.lower() not in known_tags]
    dropped += [m for m in plan.moduleIds if m not in r.module_by_id]
    cleaned = SearchPlan(
        searchTerms=[t.strip()[:40] for t in plan.searchTerms if t.strip()][:8],
        conceptTags=[known_tags[t.lower()] for t in plan.conceptTags if t.lower() in known_tags],
        moduleIds=[m for m in plan.moduleIds if m in r.module_by_id],
    )
    return cleaned, [f"dropped_unknown:{d}" for d in dropped]


async def agentic_search(query: str, lang: str = "en", limit: int = 3) -> Tuple[RetrievalResult, Dict]:
    """Returns (result, trace). trace records what the agent searched for, for the audit log."""
    tags, modules = vocabulary()
    prompt = (f"Question: {query}\nSession language: {lang}\n\nConcept tag vocabulary: {', '.join(tags)}\n"
              f"Modules:\n" + "\n".join(modules))
    plan, note = await llm.call("retrieval_agent", prompt, SearchPlan, RETRIEVAL_SYSTEM, max_tokens=300)
    if plan is None:
        res = search(query=query, lang=lang, limit=limit)
        return res, {"agentSource": "rules", "note": note}

    plan, dropped = _clean(plan)
    trace: Dict = {"agentSource": "llm", "searchTerms": plan.searchTerms, "conceptTags": plan.conceptTags,
                   "moduleIds": plan.moduleIds, "dropped": dropped}
    res = search(query=" ".join([query] + plan.searchTerms), concept_tags=plan.conceptTags,
                 module_ids=plan.moduleIds, lang=lang, limit=limit)
    if res.contentIds:
        return res, trace

    # coverage is empty: ask once for a broader search, then fall back to plain keyword search
    retry_prompt = (prompt + f"\n\nYour previous search (terms {plan.searchTerms}, tags {plan.conceptTags}, "
                    f"modules {plan.moduleIds}) found no approved lessons. Propose a broader search.")
    plan2, note2 = await llm.call("retrieval_agent", retry_prompt, SearchPlan, RETRIEVAL_SYSTEM, max_tokens=300)
    if plan2 is not None:
        plan2, dropped2 = _clean(plan2)
        trace["refined"] = {"searchTerms": plan2.searchTerms, "conceptTags": plan2.conceptTags, "dropped": dropped2}
        res = search(query=" ".join([query] + plan2.searchTerms), concept_tags=plan2.conceptTags, lang=lang,
                     limit=limit)
        res.refinements.insert(0, "llm_refined_search")
        if res.contentIds:
            return res, trace
    res = search(query=query, lang=lang, limit=limit)
    res.refinements.insert(0, "llm_search_empty_fell_back_to_keywords")
    trace["fallback"] = note2 if plan2 is None else "keywords"
    return res, trace
