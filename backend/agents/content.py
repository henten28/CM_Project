import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

CONTENT_PATH = Path(__file__).resolve().parent.parent / "content" / "modules.json"

# languages with reviewed text in the repository; anything else falls back to English
VERIFIED_LANGS = ("kn", "en")


class ContentRepo:
    def __init__(self, data: Dict[str, Any]):
        self.version: str = data["contentVersion"]
        self.sources: Dict[str, str] = {s["id"]: s["name"] for s in data["sources"]}
        self.modules: List[Dict[str, Any]] = data["modules"]
        self.module_by_id: Dict[str, Dict[str, Any]] = {m["id"]: m for m in self.modules}
        self.topic_index: Dict[str, List[str]] = data["topicIndex"]
        self.module_concepts: Dict[str, List[str]] = data["moduleConcepts"]
        # only reviewed items are ever visible to agents
        self.blocks: List[Dict[str, Any]] = [b for b in data["blocks"] if b.get("reviewStatus") == "approved"]
        self.block_by_id: Dict[str, Dict[str, Any]] = {b["id"]: b for b in self.blocks}
        self.quiz: List[Dict[str, Any]] = [q for q in data["quiz"] if q.get("reviewStatus") == "approved"]
        self.quiz_by_id: Dict[str, Dict[str, Any]] = {q["id"]: q for q in self.quiz}
        # reviewed kn/en strings from lib/agents/summary.ts
        self.gap_labels: Dict[str, Dict[str, str]] = data.get("gapLabels", {})
        self.follow_ups: Dict[str, Dict[str, str]] = data.get("followUps", {})

    def blocks_for_module(self, module_id: str) -> List[Dict[str, Any]]:
        return [b for b in self.blocks if b["moduleId"] == module_id]

    def is_verified(self, block: Dict[str, Any]) -> bool:
        # verified = approved, from a known source, with both Kannada and English text present
        return (
            block.get("sourceId") in self.sources
            and all(block["title"].get(l) and block["body"].get(l) for l in VERIFIED_LANGS)
        )


@lru_cache(maxsize=1)
def repo() -> ContentRepo:
    with open(CONTENT_PATH, encoding="utf-8") as f:
        return ContentRepo(json.load(f))


def display_lang(lang: str) -> str:
    return lang if lang in VERIFIED_LANGS else "en"
