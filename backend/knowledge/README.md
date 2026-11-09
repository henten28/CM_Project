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
uses word matching, so it may miss evidence when a query and source use different
languages or vocabulary.

Restart the backend after adding or changing files. The service also checks the
manifest and referenced file modification times on requests and refreshes its
in-process index when they change. To use the bundled official demo source, leave
`sources.json` absent; local entries with the same ID override bundled entries,
and an override with `approved: false` disables that bundled source.
