# Local knowledge documents

Put source files in `backend/knowledge/documents/`. Supported files are PDF,
Markdown, and plain text. Copy `sources.example.json` to `sources.json`, then add
one manifest entry per document. Keep `approved` set to `false` until a human has
reviewed the source and its local text. `approved` means the source is permitted
in retrieval; it does not mean generated lessons have been clinically reviewed.

```json
{
  "documents": [
    {
      "id": "ncdc-amr-guide",
      "title": "AMR guide",
      "url": "https://example.org/amr-guide",
      "file": "amr-guide.pdf",
      "approved": true,
      "provenance": "approved-local-document",
      "publisher": "Publisher name",
      "origin": "Local copy from the publisher's website"
    }
  ]
}
```

The `file` path is relative to the documents folder. Only files inside that
folder are accepted, and source URLs are displayed as metadata only: the service
never fetches them. PDF text is extracted page by page. Scanned PDFs without
selectable text are reported as import errors; OCR is not performed. Retrieval
uses word matching. Queries are expanded with the Kannada-English glossary in
`content/glossary.json`, so a Kannada-script or romanised Kannada question can
find an English passage when it uses glossary terms. Words outside the glossary
still only match sources in the same language.

## Downloading the catalogued official sources

`catalog.json` lists official public-awareness sources: NAP-AMR 2.0 and 2017 (NCDC), NHSRC ASHA training modules, the WHO AMR fact sheet and public awareness survey, and open-access Indian studies on community antibiotic use. Each entry records the publisher, licence or reuse terms, and why it is relevant. From `backend/`:

```bash
python fetch_sources.py --list     # what is in the catalogue (* = downloaded by default)
python fetch_sources.py --check    # check every link without downloading
python fetch_sources.py            # download the default set, about 31 MB
python fetch_sources.py --only ncdc-nap-amr-2-0 who-amr-fact-sheet
```

The script saves each file here under its catalogue id, and saves HTML pages as extracted `.txt`. It adds an entry to the local `sources.json` with `approved: false` and the file's SHA-256 hash. It then lists the pages that mention medicine amounts, dosing schedules or drug names. To review a source:

1. Open the file and check that it is public-awareness material and that its text extracted cleanly.
2. Check the pages the dose scan flagged. If a document mixes awareness text with treatment content, don't approve the whole file. Copy the suitable passages into a Markdown excerpt instead, in the style of `cdc-amr-basics.md`, and approve that.
3. Set `approved: true` for the entry in `sources.json` and restart the backend.

Re-downloading an identical file keeps its approval; a changed file goes back to `approved: false`. Entries marked `fetch: false` are off by default, with the reason in `notes`: scanned poster PDFs, which need OCR, and ASHA Module 7, which is likely to contain doses. No official Kannada text source has been found yet. Downloaded files are git-ignored, so each teammate fetches their own copy from the publisher.

Restart the backend after adding or changing files. The service also checks the
manifest and referenced file modification times on requests and refreshes its
in-process index when they change. To use the bundled official sources, leave
`sources.json` absent; local entries with the same ID override bundled entries,
and an override with `approved: false` disables that bundled source.
