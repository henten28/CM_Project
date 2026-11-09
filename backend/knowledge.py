"""Local, paragraph-aware retrieval for approved knowledge documents.

No network requests or embedding service are used here. Retrieval is lexical, so
queries in a different language from a document may not find matching evidence.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import threading
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from agents.content import CONTENT_PATH

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
DOCUMENTS_DIR = KNOWLEDGE_DIR / "documents"
MANIFEST_PATH = KNOWLEDGE_DIR / "sources.json"
SEED_MANIFEST_PATH = KNOWLEDGE_DIR / "sources.seed.json"
MAX_CHUNK_CHARS = 1600

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
_cache_lock = threading.RLock()
_cache_signature: tuple[Any, ...] | None = None
_cache_chunks: list[dict[str, Any]] = []
_cache_sources: list[dict[str, Any]] = []
_cache_errors: list[str] = []
_cache_using_demo = True


def _stat(path: Path) -> tuple[int, int] | None:
    try:
        stat = path.stat()
        return (stat.st_mtime_ns, stat.st_size)
    except OSError:
        return None


def _manifest_signature() -> tuple[Any, ...]:
    """Include manifest and referenced approved files so edits refresh on demand."""
    signature: list[Any] = []
    for manifest_path in (SEED_MANIFEST_PATH, MANIFEST_PATH):
        signature.extend((str(manifest_path), _stat(manifest_path)))
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            for item in data.get("documents", []) if isinstance(data, dict) else []:
                if isinstance(item, dict) and isinstance(item.get("file"), str):
                    candidate = DOCUMENTS_DIR / item["file"]
                    signature.append((item["file"], _stat(candidate)))
        except (OSError, json.JSONDecodeError):
            pass
    return tuple(signature)


def reset_cache() -> None:
    """Clear the in-process index. Useful after changing local corpus files."""
    global _cache_signature, _cache_chunks, _cache_sources, _cache_errors, _cache_using_demo
    with _cache_lock:
        _cache_signature = None
        _cache_chunks = []
        _cache_sources = []
        _cache_errors = []
        _cache_using_demo = True


def _digest(value: str, length: int = 24) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def _make_chunk(document_id: str, title: str, url: str, location: str, text: str,
                provenance: str, content_hash: str, identity: str) -> dict[str, str]:
    chunk_id = "chunk-" + _digest("\0".join((document_id, content_hash, identity, location, text)))
    return {
        "chunkId": chunk_id,
        "documentId": document_id,
        "title": title,
        "url": url,
        "location": location,
        "text": text,
        "provenance": provenance,
    }


def _split_long(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split a long paragraph at sentence/word boundaries where practical."""
    if len(text) <= limit:
        return [text]
    sentences = re.split(r"(?<=[.!?।॥])\s+", text)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        while len(sentence) > limit:
            if current:
                pieces.append(current)
                current = ""
            cut = sentence.rfind(" ", 0, limit + 1)
            if cut < limit // 2:
                cut = limit
            pieces.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not sentence:
            continue
        if current and len(current) + 1 + len(sentence) > limit:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def _paragraph_chunks(text: str, document_id: str, title: str, url: str,
                      provenance: str, content_hash: str, identity: str,
                      location_prefix: str = "") -> list[dict[str, str]]:
    chunks: list[dict[str, str]] = []
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    paragraph_number = 0
    for paragraph in paragraphs:
        if not paragraph:
            continue
        paragraph_number += 1
        for part_number, piece in enumerate(_split_long(paragraph), 1):
            location = f"{location_prefix}paragraph {paragraph_number}"
            if part_number > 1:
                location += f", part {part_number}"
            chunks.append(_make_chunk(document_id, title, url, location, piece,
                                      provenance, content_hash, identity))
    return chunks


def _safe_url(value: Any) -> str:
    if value in (None, ""):
        return ""
    if not isinstance(value, str):
        raise ValueError("url must be a string")
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("url must be a safe http(s) URL without embedded credentials")
    return value


def _approved_path(file_value: Any) -> Path:
    if not isinstance(file_value, str) or not file_value.strip():
        raise ValueError("file must be a relative path under knowledge/documents")
    relative = Path(file_value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("file path must stay inside knowledge/documents")
    path = (DOCUMENTS_DIR / relative).resolve(strict=True)
    root = DOCUMENTS_DIR.resolve()
    if not path.is_relative_to(root):
        raise ValueError("file path resolves outside knowledge/documents")
    if path.suffix.lower() not in {".pdf", ".txt", ".md"}:
        raise ValueError("only .pdf, .txt, and .md files are supported")
    if not path.is_file():
        raise ValueError("file is not a regular document")
    return path


def _read_document(path: Path) -> list[tuple[str, str]]:
    if path.suffix.lower() != ".pdf":
        return [(path.read_text(encoding="utf-8"), "")]
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - installation issue
        raise ValueError("PDF support unavailable; install the pypdf dependency") from exc
    try:
        reader = PdfReader(str(path), strict=False)
        pages = [(page.extract_text() or "", f"page {index}") for index, page in enumerate(reader.pages, 1)]
    except Exception as exc:
        raise ValueError(f"could not read PDF: {exc.__class__.__name__}") from exc
    if not any(text.strip() for text, _ in pages):
        raise ValueError("PDF contains no extractable text (it may be scanned; OCR is not supported)")
    return pages


def _load_external() -> tuple[list[dict[str, Any]], list[dict[str, str]], list[str], bool]:
    errors: list[str] = []
    manifests: list[tuple[str, list[Any]]] = []
    seed_documents: list[Any] = []
    if SEED_MANIFEST_PATH.exists():
        try:
            seed_manifest = json.loads(SEED_MANIFEST_PATH.read_text(encoding="utf-8"))
            if not isinstance(seed_manifest, dict) or not isinstance(seed_manifest.get("documents"), list):
                raise ValueError("must contain a documents array")
            seed_documents = seed_manifest["documents"]
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            errors.append(f"sources.seed.json could not be read: {exc}")
    if MANIFEST_PATH.exists():
        try:
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            if not isinstance(manifest, dict) or not isinstance(manifest.get("documents"), list):
                raise ValueError("must contain a documents array")
            manifests.append(("local", manifest["documents"]))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            errors.append(f"sources.json could not be read: {exc}")
            if not seed_documents:
                return [], [], errors, False
    # A local entry with a matching ID overrides the curated seed. Setting it
    # approved:false is a convenient local opt-out for that seed document.
    effective: dict[str, tuple[str, Any]] = {}
    for index, item in enumerate(seed_documents, 1):
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            effective[item["id"]] = ("seed", item)
        else:
            errors.append(f"seed document entry {index} must have a string id")
    for manifest_name, document_list in manifests:
        for index, item in enumerate(document_list, 1):
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                effective[item["id"]] = (manifest_name, item)
            else:
                errors.append(f"{manifest_name} document entry {index} must have a string id")
    entries = list(effective.values())
    if not entries and not SEED_MANIFEST_PATH.exists() and not MANIFEST_PATH.exists():
        errors.append("No local source manifest is configured; using the existing demo library")
        return [], [], errors, True

    sources: list[dict[str, str]] = []
    chunks: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    approved_count = 0
    for index, (manifest_name, item) in enumerate(entries, 1):
        if not isinstance(item, dict):
            errors.append(f"document entry {index} must be an object")
            continue
        if item.get("approved") is not True:
            continue
        approved_count += 1
        document_id = item.get("id")
        title = item.get("title")
        try:
            if not isinstance(document_id, str) or not document_id.strip():
                raise ValueError("id must be a non-empty string")
            if document_id in seen_ids:
                raise ValueError(f"duplicate document id {document_id!r}")
            if not isinstance(title, str) or not title.strip():
                raise ValueError("title must be a non-empty string")
            url = _safe_url(item.get("url", ""))
            provenance = item.get("provenance", "approved-local-document")
            if not isinstance(provenance, str) or not provenance.strip():
                raise ValueError("provenance must be a non-empty string")
            path = _approved_path(item.get("file"))
            raw = path.read_bytes()
            content_hash = hashlib.sha256(raw).hexdigest()
            doc_chunks: list[dict[str, str]] = []
            for page_text, page_location in _read_document(path):
                prefix = f"{page_location}, " if page_location else ""
                doc_chunks.extend(_paragraph_chunks(page_text, document_id, title.strip(), url,
                                                   provenance, content_hash,
                                                   document_id, prefix))
            if not doc_chunks:
                raise ValueError("document contains no extractable text")
            seen_ids.add(document_id)
            chunks.extend(doc_chunks)
            sources.append({"documentId": document_id, "title": title.strip(), "url": url,
                            "provenance": provenance, "approved": True,
                            "chunkCount": len(doc_chunks),
                            **({"publisher": item["publisher"]} if isinstance(item.get("publisher"), str) else {}),
                            **({"origin": item["origin"]} if isinstance(item.get("origin"), str) else {})})
        except (OSError, ValueError) as exc:
            errors.append(f"{document_id or f'document entry {index}'}: {exc}")

    # Once any document was marked approved, never replace its failed import with demo evidence.
    if approved_count or sources or SEED_MANIFEST_PATH.exists():
        return chunks, sources, errors, False
    if MANIFEST_PATH.exists():
        errors.append("No approved local documents are configured; using the existing demo library")
    return [], [], errors, True


def _load_demo() -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    try:
        data = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], []
    demo_title = "Existing demo library"
    document_id = "legacy-demo-library"
    chunks: list[dict[str, Any]] = []
    blocks = [b for b in data.get("blocks", []) if b.get("reviewStatus") == "approved"]
    for block in blocks:
        title = block.get("title", {})
        body = block.get("body", {})
        for lang in ("en", "kn"):
            text = body.get(lang)
            if not isinstance(text, str) or not text.strip():
                continue
            content_hash = _digest(f"{block.get('id')}\0{lang}\0{text}", 64)
            chunks.extend(_paragraph_chunks(text, document_id, demo_title, "",
                                            "legacy-demo-unverified", content_hash,
                                            f"{block.get('id')}:{lang}",
                                            f"demo block {block.get('id')} ({lang}), "))
    count = len(chunks)
    sources = [{"documentId": document_id, "title": demo_title, "url": "",
                "provenance": "legacy-demo-unverified", "approved": True,
                "chunkCount": count}]
    return chunks, sources


def _ensure_index() -> None:
    global _cache_signature, _cache_chunks, _cache_sources, _cache_errors, _cache_using_demo
    signature = _manifest_signature()
    with _cache_lock:
        if signature == _cache_signature:
            return
        chunks, sources, errors, using_demo = _load_external()
        if using_demo:
            demo_chunks, demo_sources = _load_demo()
            chunks, sources = demo_chunks, demo_sources
        _cache_signature = signature
        _cache_chunks = chunks
        _cache_sources = sources
        _cache_errors = errors
        _cache_using_demo = using_demo


def _tokens(text: str) -> list[str]:
    return [token.casefold() for token in _TOKEN_RE.findall(text)]


def search(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Return lexical matches in relevance order; no match returns no evidence."""
    if not isinstance(query, str) or not query.strip() or limit <= 0:
        return []
    _ensure_index()
    terms = _tokens(query)
    if not terms:
        return []
    with _cache_lock:
        chunks = list(_cache_chunks)
    if not chunks:
        return []
    tokenized = [_tokens(chunk["text"] + " " + chunk["title"]) for chunk in chunks]
    doc_freq = Counter(term for terms_in_doc in tokenized for term in set(terms_in_doc))
    avg_length = sum(map(len, tokenized)) / max(1, len(tokenized))
    scored: list[tuple[float, int]] = []
    unique_terms = set(terms)
    for index, tokens in enumerate(tokenized):
        frequencies = Counter(tokens)
        score = 0.0
        for term in unique_terms:
            frequency = frequencies[term]
            if not frequency:
                continue
            inverse = math.log(1 + (len(chunks) - doc_freq[term] + 0.5) / (doc_freq[term] + 0.5))
            denominator = frequency + 1.2 * (0.25 + 0.75 * len(tokens) / max(avg_length, 1))
            score += inverse * (frequency * 2.2 / denominator)
        if score > 0:
            scored.append((score, index))
    scored.sort(key=lambda pair: (-pair[0], chunks[pair[1]]["chunkId"]))
    return [dict(chunks[index]) for _, index in scored[:limit]]


def get_chunk(chunk_id: str) -> dict[str, Any] | None:
    _ensure_index()
    with _cache_lock:
        for chunk in _cache_chunks:
            if chunk["chunkId"] == chunk_id:
                return dict(chunk)
    return None


def list_sources() -> dict[str, Any]:
    _ensure_index()
    with _cache_lock:
        sources = [dict(source) for source in _cache_sources]
        return {"sources": sources,
                "chunkCount": sum(source["chunkCount"] for source in sources),
                "usingDemo": _cache_using_demo,
                "errors": list(_cache_errors)}
