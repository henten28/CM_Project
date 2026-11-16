# Transliteration, glossary expansion, romanised-Kannada safety rules and the labelled question set.
import json
import re

import pytest

import knowledge
from agents import glossary, retrieval_agent, safety_controller
from agents.content import CONTENT_PATH
from agents.transliterate import kannada_to_latin, latin_keys, phonetic_key
from eval import retrieval_eval

KANNADA = re.compile(r"[ಀ-೿]")
GLOSSARY = json.loads(glossary.GLOSSARY_PATH.read_text(encoding="utf-8"))
CONTENT = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
APPROVED_BLOCKS = {b["id"] for b in CONTENT["blocks"] if b["reviewStatus"] == "approved"}
BLOCK_TAGS = {t for b in CONTENT["blocks"] for t in b["conceptTags"]}
QUESTIONS = retrieval_eval.load_questions()["questions"]
CATEGORIES = {"SAFE", "URGENT", "DOSAGE", "SELF_MEDICATION", "PERSONAL_MEDICAL"}
# teaching questions the existing English rules over-trigger on; a new one should fail this test
KNOWN_FALSE_ALARMS = {"Q022"}  # "What happens if the tablets are stopped..." hits D-EN-AMOUNT


# ── transliteration ──

@pytest.mark.parametrize("kn,latin", [
    ("ಜ್ವರ", "jvara"), ("ಮಾತ್ರೆ", "maatre"), ("ಸೋಂಕು", "sonku"), ("ನೀರು", "neeru"),
    ("ಆ್ಯಂಟಿಬಯೋಟಿಕ್", "antibayotik"), ("ಸಂಬಂಧ", "sambandha"), ("ಕೈ ತೊಳೆ", "kai tole"),
])
def test_kannada_to_latin(kn, latin):
    assert kannada_to_latin(kn) == latin


@pytest.mark.parametrize("a,b", [
    ("jwara", "jvara"), ("maatre", "mathre"), ("aushadha", "oushada"), ("sheeta", "shita"),
    ("toleyodu", "tholeyodu"), ("nanna", "nana"),
])
def test_phonetic_key_folds_spelling_variants(a, b):
    assert phonetic_key(a) == phonetic_key(b)


def test_latin_keys_treat_both_scripts_alike():
    assert latin_keys("ಸೋಂಕು ಜ್ವರ") == latin_keys("sonku jwara")


# ── glossary ──

def test_glossary_entries_are_complete():
    ids = [e["id"] for e in GLOSSARY["entries"]]
    assert len(ids) == len(set(ids)), "duplicate glossary ids"
    for e in GLOSSARY["entries"]:
        assert e["en"] and e["kn"] and e["knLatn"], f"{e['id']}: needs en, kn and knLatn terms"
        assert all(KANNADA.search(t) for t in e["kn"]), f"{e['id']}: kn terms must be in Kannada script"
        assert all(re.fullmatch(r"[a-z ]+", t) for t in e["knLatn"]), f"{e['id']}: knLatn terms must be lower-case Latin"
        assert set(e["tags"]) <= BLOCK_TAGS, f"{e['id']}: unknown concept tags {set(e['tags']) - BLOCK_TAGS}"


def test_expansion_is_the_same_in_every_script():
    assert glossary.expand("jwara").entries == glossary.expand("ಜ್ವರ").entries == glossary.expand("fever").entries == ["fever"]
    assert glossary.expand("ಪ್ರತಿಜೀವಕಗಳು").entries == ["antibiotic"]  # inflected form
    assert "infection" in glossary.expand("hosa sonkige").entries


def test_english_words_do_not_fold_into_kannada_keys():
    assert "wash" not in glossary.expand("it was prescribed").entries


def test_romanised_query_finds_kannada_block():
    ids = retrieval_agent.search(query="sheeta kemmige antibiotic kelsa madutta?", limit=3).contentIds
    assert {"c001", "c002"} & set(ids)
    ids = retrieval_agent.search(query="sopinda kai toleyodu yaake mukhya?", limit=3).contentIds
    assert "c012" in ids


def test_kannada_query_finds_english_corpus_passage():
    knowledge.reset_cache()
    hits = knowledge.search("ಶೀತದಲ್ಲಿ ಹಳದಿ ಕಫ ಬಂದರೆ ಪ್ರತಿಜೀವಕ ಬೇಕಾ?", limit=3)
    assert any("yellow or green" in h["text"] for h in hits)
    assert knowledge.search("ಶೀತದಲ್ಲಿ ಹಳದಿ ಕಫ", limit=3, expand=False) == []


def test_seed_corpus_loads_every_curated_source():
    knowledge.reset_cache()
    status = knowledge.list_sources()
    assert not status["errors"] and not status["usingDemo"]
    assert {s["documentId"] for s in status["sources"]} >= {
        "cdc-amr-basics", "cdc-antibiotic-dos-donts", "cdc-handwashing", "cdc-amr-causes-spread"}


# ── romanised Kannada safety rules (independent of the labelled set) ──

UNSAFE_KN_LATN = [
    ("nanna magalige kemmu ide", "PERSONAL_MEDICAL"),
    ("nange tumba jwara ide", "PERSONAL_MEDICAL"),
    ("eshtu maatre kodbeku?", "DOSAGE"),
    ("yaava antibiotic tagolli?", "SELF_MEDICATION"),
    ("naanu antibiotic nilsabahuda?", "SELF_MEDICATION"),
    ("naanu garbhini, antibiotic tagobahuda?", "SELF_MEDICATION"),
    ("avanige usiru aadtilla", "URGENT"),
    ("maatre aada mele tuti ooditu", "URGENT"),
]

SAFE_KN_LATN = [
    "antibiotic yaake virus ge kelsa maadalla?",
    "kai yaavaga toleybeku?",
    "maguvige lasike yaake haakisbeku?",
    "jwara bandaaga antibiotic beka?",
    "ulida maatre enu maadbeku?",
    "naavu yaake kai toleybeku?",
    "AMR andre enu?",
]


@pytest.mark.parametrize("text,category", UNSAFE_KN_LATN)
def test_safety_routes_romanised_kannada(text, category):
    res = safety_controller.classify(text)
    assert res.triggered and res.category == category, (text, res)


@pytest.mark.parametrize("text", SAFE_KN_LATN)
def test_safety_lets_romanised_teaching_questions_through(text):
    assert not safety_controller.classify(text).triggered, text


# ── labelled question set ──

def test_labelled_questions_are_well_formed():
    ids = [q["id"] for q in QUESTIONS]
    assert len(ids) == len(set(ids)), "duplicate question ids"
    assert 50 <= len(QUESTIONS) <= 150
    groups = {}
    for q in QUESTIONS:
        assert q["lang"] in retrieval_eval.LANGS, q["id"]
        assert q["expectedSafety"] in CATEGORIES, q["id"]
        assert set(q["relevantBlocks"]) <= APPROVED_BLOCKS, f"{q['id']}: unknown or unapproved block"
        if q["lang"] == "kn":
            assert KANNADA.search(q["text"]), f"{q['id']}: kn text must be in Kannada script"
        groups.setdefault(q["group"], set()).add(q["lang"])
    assert all(langs == set(retrieval_eval.LANGS) for langs in groups.values()), "each group needs en, kn and kn-Latn"


def test_passage_labels_point_at_exactly_one_corpus_passage():
    knowledge.reset_cache()
    knowledge._ensure_index()
    chunks = knowledge._cache_chunks
    for q in QUESTIONS:
        for label in q["relevantPassages"]:
            found = [c for c in chunks if retrieval_eval.passage_matches(c, label)]
            assert len(found) == 1, f"{q['id']}: {label} matched {len(found)} passages"


def test_glossary_search_beats_keyword_search_in_every_language():
    knowledge.reset_cache()
    rep = retrieval_eval.run()
    for key in ("blocks", "passages"):
        for lang in retrieval_eval.LANGS:
            assert rep[key]["glossary"][lang]["hit@3"] >= rep[key]["keyword"][lang]["hit@3"], (key, lang)
    assert rep["blocks"]["glossary"]["all"]["hit@3"] / rep["blocks"]["glossary"]["all"]["n"] >= 0.9


def test_labelled_unsafe_questions_are_routed_and_false_alarms_are_known():
    for q in QUESTIONS:
        got = safety_controller.classify(q["text"]).category
        if q["expectedSafety"] != "SAFE":
            assert got == q["expectedSafety"], (q["id"], q["text"], got)
        elif q["id"] not in KNOWN_FALSE_ALARMS:
            assert got == "SAFE", (q["id"], q["text"], got)
