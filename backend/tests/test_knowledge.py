import json
import os
from pathlib import Path

import pytest

import knowledge


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    knowledge.reset_cache()
    monkeypatch.setattr(knowledge, "KNOWLEDGE_DIR", tmp_path)
    monkeypatch.setattr(knowledge, "DOCUMENTS_DIR", tmp_path / "documents")
    monkeypatch.setattr(knowledge, "MANIFEST_PATH", tmp_path / "sources.json")
    monkeypatch.setattr(knowledge, "SEED_MANIFEST_PATH", tmp_path / "sources.seed.json")
    knowledge.DOCUMENTS_DIR.mkdir()
    yield tmp_path
    knowledge.reset_cache()


def write_manifest(path, entries):
    path.write_text(json.dumps({"documents": entries}), encoding="utf-8")


def test_only_approved_local_docs_are_indexed_and_match_query(corpus):
    (corpus / "documents" / "amr.md").write_text(
        "Antimicrobial resistance occurs when microbes survive medicines.\n\n"
        "Hand washing can prevent infection.", encoding="utf-8")
    (corpus / "documents" / "draft.txt").write_text("private draft marker", encoding="utf-8")
    write_manifest(corpus / "sources.json", [
        {"id": "amr", "title": "AMR guide", "file": "amr.md", "url": "https://example.org/amr", "approved": True},
        {"id": "draft", "title": "Draft", "file": "draft.txt", "approved": False},
    ])

    results = knowledge.search("antimicrobial resistance", limit=3)
    assert results and results[0]["documentId"] == "amr"
    assert "survive medicines" in results[0]["text"]
    assert results[0]["location"] == "paragraph 1"
    assert results[0]["provenance"] == "approved-local-document"
    assert knowledge.get_chunk(results[0]["chunkId"]) == results[0]
    assert knowledge.search("private draft marker") == []
    status = knowledge.list_sources()
    assert status["usingDemo"] is False
    assert status["chunkCount"] == 2
    assert [s["documentId"] for s in status["sources"]] == ["amr"]


def test_chunk_ids_change_with_content_and_cache_refreshes_on_file_edit(corpus):
    doc = corpus / "documents" / "guide.txt"
    doc.write_text("A unique first sentence.", encoding="utf-8")
    write_manifest(corpus / "sources.json", [
        {"id": "guide", "title": "Guide", "file": "guide.txt", "approved": True},
    ])
    first = knowledge.search("unique first")[0]
    doc.write_text("A unique revised sentence.", encoding="utf-8")
    os.utime(doc, None)
    second = knowledge.search("unique revised")[0]
    assert second["chunkId"] != first["chunkId"]
    assert knowledge.get_chunk(first["chunkId"]) is None


@pytest.mark.parametrize("bad_path", ["../outside.txt", "/tmp/outside.txt"])
def test_rejects_path_traversal_without_falling_back_to_demo(corpus, bad_path):
    write_manifest(corpus / "sources.json", [
        {"id": "escape", "title": "Escape", "file": bad_path, "approved": True},
    ])
    status = knowledge.list_sources()
    assert status["usingDemo"] is False
    assert status["chunkCount"] == 0
    assert any("inside knowledge/documents" in error for error in status["errors"])
    assert knowledge.search("antibiotic") == []


def test_rejects_symlink_escape(corpus, tmp_path):
    outside = tmp_path / "outside.md"
    outside.write_text("should not be indexed", encoding="utf-8")
    (corpus / "documents" / "escape.md").symlink_to(outside)
    write_manifest(corpus / "sources.json", [
        {"id": "escape", "title": "Escape", "file": "escape.md", "approved": True},
    ])
    status = knowledge.list_sources()
    assert not status["usingDemo"]
    assert status["chunkCount"] == 0
    assert any("resolves outside" in error for error in status["errors"])


def test_malformed_manifest_is_reported_without_demo_fallback(corpus):
    (corpus / "sources.json").write_text("{broken", encoding="utf-8")
    status = knowledge.list_sources()
    assert status["usingDemo"] is False
    assert status["chunkCount"] == 0
    assert "could not be read" in status["errors"][0]
    assert knowledge.search("antibiotic") == []


def test_missing_local_manifest_uses_seed_source_and_local_override(corpus):
    (corpus / "documents" / "seed.md").write_text("Curated source marker.", encoding="utf-8")
    write_manifest(corpus / "sources.seed.json", [
        {"id": "seed", "title": "Curated", "file": "seed.md", "approved": True,
         "url": "https://example.org", "provenance": "official-source-excerpt", "publisher": "CDC"},
    ])
    hit = knowledge.search("curated source")[0]
    assert hit["provenance"] == "official-source-excerpt"
    source = knowledge.list_sources()["sources"][0]
    assert source["publisher"] == "CDC"
    assert not knowledge.list_sources()["usingDemo"]

    write_manifest(corpus / "sources.json", [
        {"id": "seed", "title": "Disabled seed", "file": "missing.txt", "approved": False},
    ])
    knowledge.reset_cache()
    assert knowledge.list_sources()["chunkCount"] == 0
    assert knowledge.search("curated source") == []


def test_empty_corpus_falls_back_to_legacy_demo_with_explicit_provenance(corpus):
    status = knowledge.list_sources()
    assert status["usingDemo"] is True
    result = knowledge.search("antibiotics")
    assert result
    assert result[0]["provenance"] == "legacy-demo-unverified"
    assert result[0]["url"] == ""
    assert result[0]["documentId"] == "legacy-demo-library"


def test_scanned_pdf_import_is_reported_without_demo(corpus):
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with (corpus / "documents" / "scan.pdf").open("wb") as file:
        writer.write(file)
    write_manifest(corpus / "sources.json", [
        {"id": "scan", "title": "Scanned PDF", "file": "scan.pdf", "approved": True},
    ])
    status = knowledge.list_sources()
    assert status["usingDemo"] is False
    assert status["chunkCount"] == 0
    assert any("OCR is not supported" in error for error in status["errors"])
