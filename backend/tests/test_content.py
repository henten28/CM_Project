# Guards for content/modules.json, so a teammate adding content gets a clear failure instead of a broken session.
import json
import re

from agents.content import CONTENT_PATH

DATA = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
SOURCES = {s["id"] for s in DATA["sources"]}
MODULES = {m["id"] for m in DATA["modules"]}
BLOCKS = DATA["blocks"]
QUIZ = DATA["quiz"]
KANNADA = re.compile(r"[ಀ-೿]")


def test_version_and_sources():
    assert re.fullmatch(r"\d{4}\.\d{2}\.\d+", DATA["contentVersion"])
    assert all(s["id"] and s["name"] for s in DATA["sources"])


def test_ids_are_unique():
    for items in (BLOCKS, QUIZ, DATA["modules"], DATA["sources"]):
        ids = [x["id"] for x in items]
        assert len(ids) == len(set(ids)), f"duplicate ids: {sorted(i for i in ids if ids.count(i) > 1)}"


def test_every_block_is_complete():
    for b in BLOCKS:
        where = b["id"]
        assert b["moduleId"] in MODULES, f"{where}: unknown module {b['moduleId']}"
        assert b["sourceId"] in SOURCES, f"{where}: unknown source {b['sourceId']}"
        assert b["reviewStatus"] in ("approved", "draft", "retired"), f"{where}: bad reviewStatus"
        assert isinstance(b["version"], int) and b["version"] >= 1, f"{where}: bad version"
        assert b["difficulty"] in ("basic", "intermediate", "advanced"), f"{where}: bad difficulty"
        assert 1 <= b["estimatedMinutes"] <= 15, f"{where}: estimatedMinutes out of range"
        assert b["conceptTags"], f"{where}: no concept tags"
        for field in ("title", "body"):
            assert b[field]["en"].strip(), f"{where}: missing English {field}"
            assert KANNADA.search(b[field]["kn"]), f"{where}: Kannada {field} missing or not in Kannada script"


def test_every_question_is_answerable_and_reinforceable():
    approved_tags = {t.lower() for b in BLOCKS if b["reviewStatus"] == "approved" for t in b["conceptTags"]}
    for q in QUIZ:
        where = q["id"]
        assert len(q["options"]) >= 2, f"{where}: needs at least two options"
        assert 0 <= q["correctIndex"] < len(q["options"]), f"{where}: correctIndex out of range"
        for part in [q["question"], q["explanation"], *q["options"]]:
            assert part["en"].strip() and KANNADA.search(part["kn"]), f"{where}: missing en or kn text"
        # the tutor needs an approved block with the same tag to reinforce a wrong answer
        assert q["conceptTag"].lower() in approved_tags, f"{where}: no approved block tagged {q['conceptTag']}"


def test_every_module_has_approved_content():
    for m in MODULES:
        assert any(b["moduleId"] == m and b["reviewStatus"] == "approved" for b in BLOCKS), f"{m} has no approved block"


def test_indexes_point_at_real_modules():
    for key, mods in DATA["topicIndex"].items():
        assert set(mods) <= MODULES, f"topicIndex[{key}] has unknown modules"
    assert set(DATA["moduleConcepts"]) <= MODULES
    for tag, text in {**DATA["gapLabels"], **DATA["followUps"]}.items():
        assert text["en"].strip() and KANNADA.search(text["kn"]), f"{tag}: missing en or kn text"
