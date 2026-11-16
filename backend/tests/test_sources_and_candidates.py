# Guards for the source catalogue, the download script and the draft question bank.
import json
import re
from pathlib import Path

import pytest

import fetch_sources
import knowledge
from agents.content import CONTENT_PATH

KANNADA = re.compile(r"[ಀ-೿]")
CONTENT = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
APPROVED_TAGS = {t.lower() for b in CONTENT["blocks"] if b["reviewStatus"] == "approved" for t in b["conceptTags"]}
CANDIDATES_PATH = CONTENT_PATH.parent / "question_candidates.json"
CANDIDATES = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))["candidates"]
SEED = {d["id"]: d for d in json.loads(knowledge.SEED_MANIFEST_PATH.read_text(encoding="utf-8"))["documents"]}
_SPACE = re.compile(r"\s+")


# ── draft question bank ──

def test_candidates_are_complete_and_promotable():
    quiz_ids = {q["id"] for q in CONTENT["quiz"]}
    ids = [c["id"] for c in CANDIDATES]
    assert len(ids) == len(set(ids)) and not set(ids) & quiz_ids
    for c in CANDIDATES:
        where = c["id"]
        assert 2 <= len(c["options"]) <= 4, where
        assert 0 <= c["correctIndex"] < len(c["options"]), where
        for part in [c["question"], c["explanation"], *c["options"]]:
            assert part["en"].strip() and KANNADA.search(part["kn"]), f"{where}: missing en or kn text"
        # the tutor needs an approved block with this tag to reinforce a wrong answer once promoted
        assert c["conceptTag"].lower() in APPROVED_TAGS, f"{where}: no approved block tagged {c['conceptTag']}"
        assert c["origin"] in ("copied", "adapted", "ai-drafted"), where
        assert c["reviewStatus"] in ("draft", "approved"), where
        if c["reviewStatus"] == "approved":
            assert all(c["review"].get(k) for k in ("medicalAccuracy", "kannada", "reviewer", "date")), \
                f"{where}: approved candidates need a completed review record"


def test_candidate_passages_appear_verbatim_in_the_cited_source():
    knowledge.reset_cache()
    knowledge._ensure_index()
    chunks = knowledge._cache_chunks
    for c in CANDIDATES:
        src = c["source"]
        assert src["documentId"] in SEED, f"{c['id']}: cite a curated seed source"
        assert src["url"] == SEED[src["documentId"]]["url"], f"{c['id']}: url differs from the manifest"
        passage = _SPACE.sub(" ", src["passage"]).strip()
        assert any(passage in ch["text"] for ch in chunks if ch["documentId"] == src["documentId"]), \
            f"{c['id']}: passage not found word for word in {src['documentId']}"


def test_candidates_make_no_approval_claims_and_give_no_doses():
    claim = re.compile(r"government[- ]approved|approved by (the )?(government|ncdc|who|mohfw|cdc)", re.IGNORECASE)
    for c in CANDIDATES:
        text = " ".join([c["question"]["en"], c["explanation"]["en"], *(o["en"] for o in c["options"])])
        assert not claim.search(text), c["id"]
        assert not fetch_sources._DOSE_RE.search(text), f"{c['id']}: mentions a dose or drug name"


# ── source catalogue and download script ──

def test_catalogue_entries_are_well_formed():
    catalog = fetch_sources.load_catalog()
    ids = [e["id"] for e in catalog]
    assert len(ids) == len(set(ids))
    for e in catalog:
        assert e["url"].startswith("https://") and e["kind"] in ("pdf", "html"), e["id"]
        assert e["title"] and e["publisher"] and e["license"], e["id"]
        if not e.get("fetch"):
            assert e["notes"], f"{e['id']}: say why it is not downloaded by default"
    assert not set(ids) & set(SEED), "catalogue ids must not override curated seed sources"


@pytest.fixture
def local_corpus(tmp_path, monkeypatch):
    monkeypatch.setattr(fetch_sources, "DOCUMENTS_DIR", tmp_path / "documents")
    monkeypatch.setattr(fetch_sources, "MANIFEST_PATH", tmp_path / "sources.json")
    return tmp_path


ENTRY = {"id": "who-test", "title": "Test page", "publisher": "WHO", "url": "https://example.org/page",
         "kind": "html", "license": "not stated"}
PAGE = ("<html><head><script>var x = 1;</script></head><body><nav>Menu Home</nav><main>"
        "<h1>Antimicrobial resistance</h1><p>" + "Antibiotics are losing effectiveness. " * 8 + "</p>"
        "<ul><li>Use antibiotics only when prescribed.</li></ul></main><footer>Footer</footer></body></html>")


def test_html_is_saved_as_text_and_registered_unapproved(local_corpus):
    path = fetch_sources._save(ENTRY, PAGE.encode())
    text = path.read_text(encoding="utf-8")
    assert path.suffix == ".txt" and "## Antimicrobial resistance" in text
    assert "Use antibiotics only when prescribed." in text
    assert "var x" not in text and "Menu Home" not in text and "Footer" not in text
    assert fetch_sources._register(ENTRY, path) == "registered, approved:false"
    manifest = json.loads((local_corpus / "sources.json").read_text(encoding="utf-8"))
    assert manifest["documents"][0]["approved"] is False


def test_approval_survives_only_an_identical_redownload(local_corpus):
    path = fetch_sources._save(ENTRY, PAGE.encode())
    fetch_sources._register(ENTRY, path)
    manifest_path = local_corpus / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["documents"][0]["approved"] = True  # a reviewer approved it
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    assert fetch_sources._register(ENTRY, path) == "approved (unchanged file)"
    changed = fetch_sources._save(ENTRY, PAGE.replace("losing", "gaining").encode())
    assert fetch_sources._register(ENTRY, changed) == "registered, approved:false"


def test_download_rejects_non_pdf_and_oversized_files(monkeypatch):
    class Resp:
        def __init__(self, body):
            self.body = body

        def read(self, n):
            return self.body[:n]

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(fetch_sources, "_request", lambda url, **kw: Resp(b"<html>Client Challenge</html>"))
    with pytest.raises(ValueError, match="did not return a PDF"):
        fetch_sources._download({"url": "https://x", "kind": "pdf"}, 1_000_000)
    monkeypatch.setattr(fetch_sources, "_request", lambda url, **kw: Resp(b"%PDF" + b"0" * 100))
    with pytest.raises(ValueError, match="larger than"):
        fetch_sources._download({"url": "https://x", "kind": "pdf"}, 50)


def test_dose_scan_flags_amounts_and_drug_names(tmp_path):
    doc = tmp_path / "notes.md"
    doc.write_text("Wash hands with soap.\n\nGive 250 mg twice a day.\n\nAmoxicillin is an antibiotic.", encoding="utf-8")
    flagged = fetch_sources.dose_scan(doc)
    assert flagged and "250 mg" in flagged[0] and "amoxicillin" in flagged[0]
    (tmp_path / "clean.md").write_text("Wash hands with soap for at least 20 seconds.", encoding="utf-8")
    assert fetch_sources.dose_scan(tmp_path / "clean.md") == []
