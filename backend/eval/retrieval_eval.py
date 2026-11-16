# Retrieval and safety evaluation over the labelled question set in eval/retrieval_questions.json.
# Usage, from backend/:  python -m eval.retrieval_eval            (writes eval/retrieval_report.json and .md)
#                        python -m eval.retrieval_eval --no-write (print only)
# Compares plain keyword search with glossary-expanded search, by language, for the lesson blocks the
# /session agents choose from and the document corpus the quiz builder cites. No provider calls.

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

HERE = Path(__file__).resolve().parent
QUESTIONS_PATH = HERE / "retrieval_questions.json"
LANGS = ("en", "kn", "kn-Latn")
MODES = ("keyword", "glossary")  # glossary = keyword search with glossary query expansion
TOP_K = 5


def load_questions() -> Dict[str, Any]:
    return json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))


def passage_matches(chunk: Dict[str, Any], label: Dict[str, str]) -> bool:
    return chunk["documentId"] == label["documentId"] and label["contains"].casefold() in chunk["text"].casefold()


def _rank(found: List[Any], is_relevant: Callable[[Any], bool]) -> Optional[int]:
    return next((i for i, item in enumerate(found, 1) if is_relevant(item)), None)


def block_rank(q: Dict[str, Any], expand: bool) -> Optional[int]:
    from agents import retrieval_agent

    ids = retrieval_agent.search(query=q["text"], limit=TOP_K, expand=expand).contentIds
    return _rank(ids, lambda cid: cid in q["relevantBlocks"])


def passage_rank(q: Dict[str, Any], expand: bool) -> Optional[int]:
    import knowledge

    chunks = knowledge.search(q["text"], limit=TOP_K, expand=expand)
    return _rank(chunks, lambda c: any(passage_matches(c, label) for label in q["relevantPassages"]))


def _summary(ranks: List[Optional[int]]) -> Dict[str, Any]:
    n = len(ranks)
    hit = lambda k: sum(1 for r in ranks if r is not None and r <= k)
    return {
        "n": n,
        "hit@1": hit(1),
        "hit@3": hit(3),
        "hit@5": hit(5),
        "mrr": round(sum(1 / r for r in ranks if r) / n, 3) if n else None,
    }


def _by_lang(rows: List[Dict[str, Any]], key: str) -> Dict[str, Any]:
    out = {"all": _summary([r[key] for r in rows])}
    for lang in LANGS:
        out[lang] = _summary([r[key] for r in rows if r["lang"] == lang])
    return out


def run() -> Dict[str, Any]:
    import knowledge
    from agents import safety_controller
    from agents.content import repo

    data = load_questions()
    questions = data["questions"]

    block_rows, passage_rows = [], []
    for q in questions:
        if q["expectedSafety"] == "SAFE" and q["relevantBlocks"]:
            block_rows.append({"id": q["id"], "lang": q["lang"],
                               **{m: block_rank(q, m == "glossary") for m in MODES}})
        if q["relevantPassages"]:
            passage_rows.append({"id": q["id"], "lang": q["lang"],
                                 **{m: passage_rank(q, m == "glossary") for m in MODES}})

    safety_rows = []
    for q in questions:
        got = safety_controller.classify(q["text"])
        safety_rows.append({"id": q["id"], "lang": q["lang"], "expected": q["expectedSafety"],
                            "got": got.category, "ruleId": got.ruleId, "ok": got.category == q["expectedSafety"]})

    def safety_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        unsafe = [r for r in rows if r["expected"] != "SAFE"]
        safe = [r for r in rows if r["expected"] == "SAFE"]
        return {
            "n": len(rows),
            "correct": sum(r["ok"] for r in rows),
            "unsafeRouted": f"{sum(r['ok'] for r in unsafe)}/{len(unsafe)}",
            "falseAlarms": f"{sum(not r['ok'] for r in safe)}/{len(safe)}",
        }

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "questionSet": {"version": data["version"], "reviewStatus": data["reviewStatus"],
                        "count": len(questions),
                        "byLang": {lang: sum(q["lang"] == lang for q in questions) for lang in LANGS}},
        "contentVersion": repo().version,
        "corpus": [s["documentId"] for s in knowledge.list_sources()["sources"]],
        "topK": TOP_K,
        "blocks": {m: _by_lang(block_rows, m) for m in MODES},
        "passages": {m: _by_lang(passage_rows, m) for m in MODES},
        "safety": {"all": safety_summary(safety_rows),
                   **{lang: safety_summary([r for r in safety_rows if r["lang"] == lang]) for lang in LANGS}},
        "misses": {
            "blocks@3": [r["id"] for r in block_rows if not (r["glossary"] and r["glossary"] <= 3)],
            "passages@3": [r["id"] for r in passage_rows if not (r["glossary"] and r["glossary"] <= 3)],
            "safety": [{k: r[k] for k in ("id", "lang", "expected", "got", "ruleId")} for r in safety_rows if not r["ok"]],
        },
        "contentGaps": sorted({f"{q['group']}: {q['topic']}" for q in questions
                               if q["expectedSafety"] == "SAFE" and not q["relevantBlocks"]}),
        "noCorpusPassage": sorted({f"{q['group']}: {q['topic']}" for q in questions
                                   if q["expectedSafety"] == "SAFE" and not q["relevantPassages"]}),
    }


def _fmt(s: Dict[str, Any], key: str) -> str:
    return f"{s[key]}/{s['n']}" if s["n"] else "n/a"


def to_markdown(rep: Dict[str, Any]) -> str:
    qs = rep["questionSet"]
    lines = [
        "# Retrieval and safety evaluation",
        "",
        f"Generated {rep['generatedAt']}, content {rep['contentVersion']}, {qs['count']} labelled questions "
        f"({', '.join(f'{v} {k}' for k, v in qs['byLang'].items())}), question set v{qs['version']} ({qs['reviewStatus']}).",
        f"Corpus: {', '.join(rep['corpus'])}. A hit means a labelled block or passage is in the top k results.",
        "",
    ]
    for title, key in (("Lesson blocks (/session retrieval agent, content/modules.json)", "blocks"),
                       ("Corpus passages (quiz builder and /agent-session, knowledge/documents)", "passages")):
        lines += [f"## {title}", "", "| Search | Language | hit@1 | hit@3 | hit@5 | MRR |", "|---|---|---|---|---|---|"]
        for mode in MODES:
            for lang in ("all",) + LANGS:
                s = rep[key][mode][lang]
                lines.append(f"| {mode} | {lang} | {_fmt(s, 'hit@1')} | {_fmt(s, 'hit@3')} | {_fmt(s, 'hit@5')} | {s['mrr']} |")
        lines.append("")
    lines += ["## Safety routing", "", "| Language | Correct | Unsafe questions routed | False alarms on teaching questions |",
              "|---|---|---|---|"]
    for lang in ("all",) + LANGS:
        s = rep["safety"][lang]
        lines.append(f"| {lang} | {s['correct']}/{s['n']} | {s['unsafeRouted']} | {s['falseAlarms']} |")
    lines += ["", "## Misses with glossary search", "",
              f"- Blocks not in top 3: {', '.join(rep['misses']['blocks@3']) or 'none'}",
              f"- Passages not in top 3: {', '.join(rep['misses']['passages@3']) or 'none'}",
              "- Safety mismatches: " + (", ".join(f"{m['id']} ({m['lang']}, expected {m['expected']}, got {m['got']})"
                                                   for m in rep["misses"]["safety"]) or "none"),
              "", "## Coverage gaps", "",
              "Teaching questions that no approved block answers: " + ("; ".join(rep["contentGaps"]) or "none") + ".",
              "",
              "Teaching questions with no supporting corpus passage yet: " + ("; ".join(rep["noCorpusPassage"]) or "none") + ".",
              ""]
    return "\n".join(lines)


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-write", action="store_true", help="print the report without saving it")
    args = parser.parse_args()
    rep = run()
    md = to_markdown(rep)
    print(md)
    if not args.no_write:
        (HERE / "retrieval_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (HERE / "retrieval_report.md").write_text(md, encoding="utf-8")


if __name__ == "__main__":
    cli()
