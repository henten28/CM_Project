import re
from typing import Dict, Iterable, List, Optional, Set

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


def _score(block: Dict, tokens: List[str], tags: Set[str], module_boost: Set[str], hay: str) -> float:
    block_tags = {t.lower() for t in block["conceptTags"]}
    score = 3.0 * len(tags & block_tags)  # concept-tag filter hits weigh most
    score += min(sum(1 for t in tokens if t in hay), 5)  # keyword hits, capped
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
) -> RetrievalResult:
    r = repo()
    tokens = _tokens(query)
    tags = {t.lower() for t in concept_tags}
    modules = set(module_ids)
    excluded = set(exclude_ids)

    # topic index keywords (en + kn) map free text to modules
    q_lower = query.lower()
    module_boost = {m for key, mods in r.topic_index.items() if key in q_lower for m in mods}

    has_criteria = bool(tokens or tags or modules or module_boost)
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
            s = _score(b, toks, tags, module_boost, _haystack(b))
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
