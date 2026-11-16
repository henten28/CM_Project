# Query expansion from the Kannada-English glossary in content/glossary.json. Search only: it widens
# what retrieval looks for and never changes lesson text, answers or safety decisions.
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from agents.transliterate import latin_keys

GLOSSARY_PATH = Path(__file__).resolve().parent.parent / "content" / "glossary.json"
# shorter terms ("kai", "amr") must match a whole word; longer ones may carry a suffix (sonkige -> sonku)
MIN_PREFIX = 4
_PLAIN_WORD = re.compile(r"[a-z]+")


@dataclass
class Expansion:
    entries: List[str] = field(default_factory=list)       # matched glossary ids, in glossary order
    en: List[str] = field(default_factory=list)            # English terms (and related terms) to search for
    kn: List[str] = field(default_factory=list)            # Kannada-script terms to search for
    tags: Set[str] = field(default_factory=set)            # concept tags the matched terms point at
    forms: List[List[str]] = field(default_factory=list)   # per matched entry: every searchable form, lowercased


@lru_cache(maxsize=1)
def _index() -> Tuple[List[Dict[str, Any]], List[Tuple[Tuple[str, ...], int, bool]]]:
    data = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
    entries = data["entries"]
    patterns: List[Tuple[Tuple[str, ...], int, bool]] = []  # (words, entry index, phonetic?)
    for index, entry in enumerate(entries):
        # English matches plain words, so "was" never collides with "wash"; Kannada script and
        # romanised Kannada match on phonetic keys, so jwara / jvara / ಜ್ವರ compare equal
        for term in entry["en"]:
            patterns.append((tuple(_PLAIN_WORD.findall(term.lower())), index, False))
        for term in entry["kn"] + entry["knLatn"]:
            patterns.append((tuple(latin_keys(term)), index, True))
    return entries, [p for p in patterns if p[0]]


def _word_matches(word: str, term: str) -> bool:
    return word.startswith(term) if len(term) >= MIN_PREFIX else word == term


def _phrase_in(words: List[str], terms: Tuple[str, ...]) -> bool:
    n = len(terms)
    for start in range(len(words) - n + 1):
        # in a phrase every word but the last must match exactly; the last may be inflected
        if all(words[start + j] == terms[j] for j in range(n - 1)) and _word_matches(words[start + n - 1], terms[-1]):
            return True
    return False


def expand(text: str) -> Expansion:
    """Glossary entries mentioned in text, in any of English, Kannada script or romanised Kannada."""
    entries, patterns = _index()
    plain = _PLAIN_WORD.findall((text or "").lower())
    keyed = latin_keys(text or "")
    matched: Set[int] = set()
    for terms, index, phonetic in patterns:
        if index not in matched and _phrase_in(keyed if phonetic else plain, terms):
            matched.add(index)
    result = Expansion()
    for index in sorted(matched):
        entry = entries[index]
        english = entry["en"] + entry.get("related", [])
        result.entries.append(entry["id"])
        result.en += [t for t in english if t not in result.en]
        result.kn += [t for t in entry["kn"] if t not in result.kn]
        result.tags |= set(entry["tags"])
        result.forms.append([t.lower() for t in english + entry["kn"]])
    return result
