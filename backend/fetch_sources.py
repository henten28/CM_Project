"""Download the official sources in knowledge/catalog.json into the local, git-ignored corpus.

Usage, from backend/:
    python fetch_sources.py --list               show the catalogue
    python fetch_sources.py --check              check each link without downloading it
    python fetch_sources.py                      download every entry marked fetch:true
    python fetch_sources.py --only ID [ID ...]   download just these entries
    python fetch_sources.py --scan               re-run the dose scan on files already downloaded

Each file goes to knowledge/documents/ and is registered in the local knowledge/sources.json with
approved:false, so nothing reaches retrieval until a person reviews it and sets approved:true. HTML
pages are saved as extracted text. After a download the script lists pages that mention medicine
amounts or drug names, which the README keeps out of the corpus.
"""

import argparse
import hashlib
import json
import logging
import re
import socket
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional

import knowledge

HERE = Path(__file__).resolve().parent
KNOWLEDGE_DIR = HERE / "knowledge"
DOCUMENTS_DIR = KNOWLEDGE_DIR / "documents"
CATALOG_PATH = KNOWLEDGE_DIR / "catalog.json"
MANIFEST_PATH = KNOWLEDGE_DIR / "sources.json"
USER_AGENT = "Mozilla/5.0 (AMR Jagruti corpus fetcher; academic project)"
TIMEOUT_S = 60

# phrases a reviewer must check: amounts with units, dosing schedules and common antibiotic names
_DOSE_PATTERNS = [
    r"\b\d+(\.\d+)?\s?(mg|ml|mcg|µg)\b",
    r"\b(once|twice|thrice|\d+ times) (a|per) day\b",
    r"\b(dose|dosage|doses)\b",
    r"\b(amoxicillin|amoxycillin|azithromycin|ciprofloxacin|cotrimoxazole|co-trimoxazole|metronidazole|"
    r"doxycycline|ceftriaxone|cefixime|gentamicin|norfloxacin|ofloxacin|erythromycin|chloroquine|"
    r"artesunate|paracetamol|albendazole)\b",
]
_DOSE_RE = re.compile("|".join(_DOSE_PATTERNS), re.IGNORECASE)


def _prefer_ipv4() -> None:
    # who.int lookups can time out over IPv6 on some networks; try IPv4 addresses first
    original = socket.getaddrinfo

    def getaddrinfo(*args: Any, **kwargs: Any):
        return sorted(original(*args, **kwargs), key=lambda info: info[0] != socket.AF_INET)

    socket.getaddrinfo = getaddrinfo


def load_catalog() -> List[Dict[str, Any]]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["sources"]


def _request(url: str, method: str = "GET", headers: Optional[Dict[str, str]] = None):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT, **(headers or {})})
    return urllib.request.urlopen(req, timeout=TIMEOUT_S)


def check(entry: Dict[str, Any]) -> str:
    """Status line for one link, using a 1 KB range request (some hosts reject HEAD)."""
    try:
        with _request(entry["url"], headers={"Range": "bytes=0-1023"}) as resp:
            head = resp.read(1024)
            kind = resp.headers.get("Content-Type", "")
            total = resp.headers.get("Content-Range", "").rpartition("/")[2] or resp.headers.get("Content-Length", "?")
            looks_ok = head.startswith(b"%PDF") if entry["kind"] == "pdf" else b"<html" in head.lower() or b"<!doctype" in head.lower()
            return f"{resp.status} {kind or '?'} {total} bytes {'ok' if looks_ok else 'UNEXPECTED CONTENT'}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return f"error: {exc}"


class _TextExtractor(HTMLParser):
    """Paragraph text from an HTML page, preferring its <main> or <article> element."""

    SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button"}
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "div", "section", "br"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.main_depth = 0
        self.parts: List[str] = []
        self.main_parts: List[str] = []

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self.SKIP:
            self.skip_depth += 1
        elif tag in ("main", "article"):
            self.main_depth += 1
        if tag in self.BLOCK:
            self._emit("\n\n")
        if tag in ("h1", "h2", "h3", "h4"):
            self._emit("## ")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif tag in ("main", "article") and self.main_depth:
            self.main_depth -= 1
        if tag in self.BLOCK:
            self._emit("\n\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self._emit(data)

    def _emit(self, text: str) -> None:
        self.parts.append(text)
        if self.main_depth:
            self.main_parts.append(text)

    def text(self) -> str:
        raw = "".join(self.main_parts) if "".join(self.main_parts).strip() else "".join(self.parts)
        paragraphs = [re.sub(r"[ \t\r\f\v\n]+", " ", p).strip() for p in re.split(r"\n\s*\n", raw)]
        return "\n\n".join(p for p in paragraphs if p and p != "##")


def _download(entry: Dict[str, Any], max_bytes: int) -> bytes:
    with _request(entry["url"]) as resp:
        data = resp.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError(f"larger than the {max_bytes // 1_000_000} MB limit; use --max-mb to allow it")
    if entry["kind"] == "pdf" and not data.startswith(b"%PDF"):
        raise ValueError("the server did not return a PDF (it may be a bot-check page)")
    return data


def _save(entry: Dict[str, Any], data: bytes) -> Path:
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    if entry["kind"] == "pdf":
        path = DOCUMENTS_DIR / f"{entry['id']}.pdf"
        content = data
    else:
        parser = _TextExtractor()
        parser.feed(data.decode("utf-8", errors="replace"))
        body = parser.text()
        if len(body) < 200:
            raise ValueError("the page had almost no extractable text")
        header = (f"# {entry['title']}\n\nSource: {entry['publisher']}.\nOfficial page: {entry['url']}\n"
                  f"Retrieved: {date.today().isoformat()} by fetch_sources.py (automatic text extraction; "
                  f"menus and page furniture may remain).\nLicence: {entry.get('license', 'not stated')}\n")
        path = DOCUMENTS_DIR / f"{entry['id']}.txt"
        content = (header + "\n" + body + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=DOCUMENTS_DIR, delete=False) as tmp:
        tmp.write(content)
    Path(tmp.name).chmod(0o644)  # temporary files start private; match the other corpus files
    Path(tmp.name).replace(path)
    return path


def _register(entry: Dict[str, Any], path: Path) -> str:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {"documents": []}
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    existing = next((d for d in manifest["documents"] if d.get("id") == entry["id"]), None)
    # a changed file needs a fresh review, so approval only survives an identical re-download
    approved = bool(existing and existing.get("approved") is True and existing.get("sha256") == digest)
    record = {
        "id": entry["id"],
        "title": entry["title"],
        "publisher": entry["publisher"],
        "url": entry.get("pageUrl") or entry["url"],
        "file": path.name,
        "approved": approved,
        "provenance": "official-download",
        "origin": f"Downloaded from {entry['url']} on {date.today().isoformat()} by fetch_sources.py. "
                  f"Licence: {entry.get('license', 'not stated')}",
        "sha256": digest,
    }
    if existing:
        manifest["documents"][manifest["documents"].index(existing)] = record
    else:
        manifest["documents"].append(record)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return "approved (unchanged file)" if approved else "registered, approved:false"


def dose_scan(path: Path) -> List[str]:
    """Locations that mention medicine amounts, schedules or drug names, for the reviewer."""
    flagged = []
    for text, location in knowledge._read_document(path):
        found = sorted({m.group(0).lower() for m in _DOSE_RE.finditer(text)})
        if found:
            flagged.append(f"{location or 'text'}: {', '.join(found[:6])}")
    return flagged


def _report_scan(path: Path) -> None:
    try:
        flagged = dose_scan(path)
    except ValueError as exc:
        print(f"    scan: {exc}")
        return
    if flagged:
        print(f"    review before approving: {len(flagged)} location(s) mention doses or drug names")
        for line in flagged[:8]:
            print(f"      {line}")
        if len(flagged) > 8:
            print(f"      ... and {len(flagged) - 8} more")
    else:
        print("    dose scan: nothing flagged")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list", action="store_true", help="show the catalogue and exit")
    parser.add_argument("--check", action="store_true", help="check each link (1 KB range request) without saving")
    parser.add_argument("--scan", action="store_true", help="re-run the dose scan on downloaded files")
    parser.add_argument("--only", nargs="+", metavar="ID", help="limit to these catalogue ids (also allows fetch:false ones)")
    parser.add_argument("--max-mb", type=int, default=40, help="refuse files larger than this (default 40)")
    args = parser.parse_args(argv)

    _prefer_ipv4()
    logging.getLogger("pypdf").setLevel(logging.ERROR)  # font-encoding notices do not affect text extraction
    catalog = load_catalog()
    if args.only:
        unknown = set(args.only) - {e["id"] for e in catalog}
        if unknown:
            print(f"unknown ids: {', '.join(sorted(unknown))}", file=sys.stderr)
            return 2
        selected = [e for e in catalog if e["id"] in args.only]
    else:
        selected = [e for e in catalog if e.get("fetch")]

    if args.list:
        for e in catalog:
            size = f"{e.get('sizeBytes', 0) / 1_000_000:.1f} MB"
            print(f"{'*' if e.get('fetch') else ' '} {e['id']:42} {e['kind']:4} {size:>8}  {e['title']}")
        print("\n* = downloaded by default")
        return 0
    if args.check:
        for e in selected:
            print(f"{e['id']}: {check(e)}")
        return 0
    if args.scan:
        for e in selected:
            path = next((p for p in (DOCUMENTS_DIR / f"{e['id']}.pdf", DOCUMENTS_DIR / f"{e['id']}.txt") if p.exists()), None)
            if path:
                print(f"{e['id']}: {path.name}")
                _report_scan(path)
        return 0

    total = sum(e.get("sizeBytes", 0) for e in selected) / 1_000_000
    print(f"Downloading {len(selected)} source(s), about {total:.0f} MB, into {DOCUMENTS_DIR}")
    failures = 0
    for e in selected:
        print(f"- {e['id']}")
        try:
            path = _save(e, _download(e, args.max_mb * 1_000_000))
            print(f"    saved {path.name}; {_register(e, path)}")
            _report_scan(path)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            failures += 1
            print(f"    failed: {exc}")
    print("\nNext: review each file, then set approved:true for it in knowledge/sources.json and restart the backend.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
