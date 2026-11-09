"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBanner, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getAgentSources, type AgentSources, type AgentTrace } from "@/lib/agent-client";
import { useLang, type Lang } from "@/lib/prefs";
import {
  actOnQuizDraft, createQuizDraft, getQuizDraft, listQuizDrafts,
  type DraftActionInput, type DraftQuestion, type DraftSummary, type QuestionInput,
  type QuizDifficulty, type QuizDraft,
} from "@/lib/quiz-client";

function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}

function redacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
    [/api.?key|authorization|secret|password/i.test(key) ? "[redacted]" : key,
      /api.?key|authorization|secret|password/i.test(key) ? "[redacted]" : redacted(item)]));
  if (typeof value === "string") return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]");
  return value;
}

function CitationBlock({ citations }: { citations: DraftQuestion["citations"] }) {
  return <div className="qb-citations"><h4>Retrieved citations</h4>
    {citations.map((citation, index) => <div className="qb-citation" key={`${citation.chunkId}-${index}`}>
      <strong>{citation.title || citation.documentId}</strong>
      <span>{citation.location} · {citation.provenance}</span>
      <blockquote>“{citation.quote}”</blockquote>
      {safeHttpUrl(citation.url) && <a href={safeHttpUrl(citation.url) ?? undefined} target="_blank" rel="noreferrer">Open source</a>}
    </div>)}
  </div>;
}

function TracePanel({ trace, callsUsed, maxCalls }: { trace: AgentTrace[]; callsUsed: number; maxCalls: number }) {
  return <details className="card qb-panel">
    <summary>Generation trace · {callsUsed}/{maxCalls} model calls</summary>
    <p className="text-xs text-muted mt-2">Shows recorded API requests, tool calls/results, usage and review events. Provider credentials and private chain-of-thought are not shown. This is a local demo review surface without sign-in.</p>
    <div className="qb-traces">{trace.map((item, index) => <details className="qb-trace" key={`${item.at}-${index}`}>
      <summary>{item.event} · {item.agent} · {new Date(item.at).toLocaleString()}</summary>
      <pre>{JSON.stringify(redacted(item.detail), null, 2)}</pre>
    </details>)}</div>
  </details>;
}

interface EditorState {
  id: string;
  question: string;
  options: string;
  correctIndex: string;
  explanation: string;
  conceptTag: string;
  chunkIds: string[];
  quotes: string[];
}

function editorFor(question: DraftQuestion): EditorState {
  return {
    id: question.id, question: question.question, options: question.options.join("\n"),
    correctIndex: String(question.correctIndex), explanation: question.explanation,
    conceptTag: question.conceptTag, chunkIds: question.citations.map((citation) => citation.chunkId),
    quotes: question.citations.map((citation) => citation.quote),
  };
}

function BuilderContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [lang] = useLang();
  const draftId = params.get("draft") ?? "";
  const queryLang = params.get("lang");
  const queryCount = Number(params.get("questionCount"));
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [draftLang, setDraftLang] = useState<Lang>(queryLang === "kn" || queryLang === "hi" || queryLang === "en" ? queryLang : lang);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("basic");
  const [questionCount, setQuestionCount] = useState(() => Number.isInteger(queryCount) && queryCount >= 1 && queryCount <= 10 ? queryCount : 5);
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [sources, setSources] = useState<AgentSources | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [regenNotes, setRegenNotes] = useState<Record<string, string>>({});
  const [batchNote, setBatchNote] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const draftLoadSequence = useRef(0);
  const [loadedDraftId, setLoadedDraftId] = useState("");

  const refreshDraftList = useCallback(() => listQuizDrafts().then(setDrafts).catch(() => setDrafts([])), []);

  useEffect(() => {
    getAgentSources().then(setSources).catch(() => setSources(null));
    void refreshDraftList();
  }, [refreshDraftList]);

  useEffect(() => {
    const sequence = ++draftLoadSequence.current;
    if (!draftId) return () => { draftLoadSequence.current += 1; };
    Promise.resolve().then(() => {
      if (sequence === draftLoadSequence.current) { setLoadingDraft(true); setError(null); setEditor(null); }
      return getQuizDraft(draftId);
    }).then((loaded) => {
      if (sequence !== draftLoadSequence.current) return;
      setDraft(loaded); setLoadedDraftId(draftId); setTopic(loaded.topic); setDraftLang(loaded.lang); setDifficulty(loaded.difficulty); setQuestionCount(loaded.questionCount);
    }).catch((cause: unknown) => {
      if (sequence === draftLoadSequence.current) setError(cause instanceof Error ? cause.message : "Could not load this draft");
    }).finally(() => {
      if (sequence === draftLoadSequence.current) setLoadingDraft(false);
    });
    return () => { draftLoadSequence.current += 1; };
  }, [draftId]);

  const shareUrl = useMemo(() => {
    if (!draft?.publishedVersion) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/quiz?id=${encodeURIComponent(draft.id)}&version=${draft.publishedVersion}`;
  }, [draft?.id, draft?.publishedVersion]);

  async function generate() {
    setBusy(true); setError(null); setNotice("");
    try {
      const created = await createQuizDraft({ topic: topic.trim(), lang: draftLang, difficulty, questionCount });
      setDraft(created); setLoadedDraftId(created.id);
      await refreshDraftList();
      router.replace(`/quiz-builder?draft=${encodeURIComponent(created.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the quiz draft"); }
    finally { setBusy(false); }
  }

  async function mutate(input: DraftActionInput, success: string) {
    if (!draft || busy) return;
    setBusy(true); setError(null); setNotice("");
    try {
      const updated = await actOnQuizDraft(draft.id, input);
      setDraft(updated); setEditor(null); setNotice(success); await refreshDraftList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The draft update failed");
      try { const latest = await getQuizDraft(draft.id); setDraft(latest); await refreshDraftList(); }
      catch { /* keep the current draft and show the optimistic revision error */ }
    } finally { setBusy(false); }
  }

  function saveQuestion() {
    if (!draft || !editor) return;
    const options = editor.options.split("\n").map((item) => item.trim()).filter(Boolean);
    const correctIndex = Number(editor.correctIndex);
    const question: QuestionInput = {
      question: editor.question.trim(), options, correctIndex, explanation: editor.explanation.trim(),
      conceptTag: editor.conceptTag.trim(),
      citations: editor.chunkIds.map((chunkId, index) => ({ chunkId, quote: editor.quotes[index]?.trim() ?? "" })),
    };
    if (!question.question || options.length < 2 || options.length > 6 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length ||
        !question.explanation || !question.conceptTag || !question.citations.length || question.citations.some((citation) => !citation.quote)) {
      setError("Each question needs text, 2–6 options, a valid answer key, an explanation, a concept tag and exact source quotes.");
      return;
    }
    void mutate({ action: "edit_question", expectedRevision: draft.revision, questionId: editor.id, question }, "Question saved to the draft. Review the full batch before publication.");
  }

  function regenerateOne(question: DraftQuestion) {
    if (!draft) return;
    void mutate({ action: "regenerate_question", expectedRevision: draft.revision, questionId: question.id,
      feedback: regenNotes[question.id]?.trim() || undefined }, `Question regenerated. Review the full batch; draft revision is now ${draft.revision + 1}.`);
  }

  function regenerateAll() {
    if (!draft) return;
    void mutate({ action: "regenerate_quiz", expectedRevision: draft.revision, feedback: batchNote.trim() || undefined }, "New batch generated. Review every question before publishing.");
  }

  function publishAll() {
    if (!draft) return;
    void mutate({ action: "publish", expectedRevision: draft.revision }, "All questions approved and published as an immutable version.");
  }

  async function copyShareLink() {
    if (!shareUrl || !navigator.clipboard) return;
    try { await navigator.clipboard.writeText(shareUrl); setNotice("Learner link copied."); }
    catch { setNotice("Copy was blocked by this browser. You can select the learner link below."); }
  }

  return <div className="portal portal-page">
    <SiteHeader />
    <PageBanner img="/img/step1.svg" title="Batch quiz review"
      sub="Prepare a reusable quiz once. ASHA approves the full question batch before it is published." />
    <main className="page-body qb-page" style={{ maxWidth: 1100 }}>
      <div className="qb-top-links"><Link className="pill-btn" href="/quiz">Browse published quizzes</Link><span className="text-xs text-muted">Local reviewer surface · no separate sign-in</span></div>

      {!draftId && (!draft || loadedDraftId !== draftId) && <section className="card-elevated qb-form">
        <h2>Create quiz draft</h2>
        <p className="text-sm text-muted mt-2">Generation starts only when you press the button. Default: five basic questions.</p>
        <div className="qb-form-grid mt-3">
          <label className="field">Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="AMR awareness" maxLength={300} /></label>
          <label className="field">Language<select value={draftLang} onChange={(event) => setDraftLang(event.target.value as Lang)}><option value="en">English</option><option value="kn">Kannada</option><option value="hi">Hindi</option></select></label>
          <label className="field">Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizDifficulty)}><option value="basic">Basic</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
          <label className="field">Question count<select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count}</option>)}</select></label>
        </div>
        <button type="button" className="btn btn-primary mt-4" disabled={busy || !topic.trim()} onClick={() => void generate()}>{busy ? "Generating…" : "Generate quiz draft"}</button>
      </section>}

      {loadingDraft && <p role="status" className="card mt-3">Loading saved draft…</p>}
      {error && <div className="qb-error mt-3" role="alert">{error}</div>}
      {notice && <p className="qb-notice mt-3" role="status">{notice}</p>}

      {draft && loadedDraftId === draftId && !loadingDraft && <>
        <div className="qb-draft-heading card mt-4">
          <div><span className={`badge ${draft.state === "BLOCKED" ? "badge-red" : draft.state === "PUBLISHED" ? "badge-green" : "badge-amber"}`}>{draft.state.replaceAll("_", " ")}</span>
            <h2>{draft.title}</h2><p>{draft.topic} · {draft.lang.toUpperCase()} · {draft.difficulty} · {draft.questionCount} questions · Revision {draft.revision}</p></div>
          <span className="text-sm text-muted">Generation calls {draft.callsUsed}/{draft.maxCalls}</span>
        </div>
        {draft.usingDemo && <aside className="qb-note mt-3" role="note">Built-in demo evidence is labelled unverified; citations identify retrieved excerpts and do not establish clinical verification.</aside>}
        {draft.publishedVersion !== null && <section className="qb-published card mt-3">
          <strong>Published version {draft.publishedVersion} is immutable.</strong> Any saved edits below remain a draft until the full batch is approved and published again.
          <div className="qb-share mt-2"><label className="field">Learner link<input readOnly value={shareUrl} aria-label="Published learner link" /></label><button className="btn btn-outline" type="button" onClick={() => void copyShareLink()}>Copy link</button></div>
          <Link href={`/quiz?id=${encodeURIComponent(draft.id)}&version=${draft.publishedVersion}`} target="_blank" className="inline-link">Open learner quiz</Link>
        </section>}
        {draft.error && <div className="qb-error mt-3" role="alert">{draft.error}</div>}

        <section className="qb-review mt-4" aria-labelledby="qb-review-title">
          <div className="qb-section-head"><div><h2 id="qb-review-title">Review all {draft.questions.length} questions together</h2><p className="text-sm text-muted">Check question wording, the proposed answer, explanation and retrieved evidence. Nothing is published until the batch approval.</p></div>
            <button type="button" className="btn btn-primary" disabled={busy || Boolean(editor) || draft.state !== "AWAITING_REVIEW" || !draft.questions.length} onClick={publishAll}>{busy ? "Saving…" : draft.state === "PUBLISHED" ? `Published v${draft.publishedVersion} — edit to create a new version` : draft.state === "BLOCKED" ? "Draft blocked" : "Approve all and publish"}</button>
          </div>
          {draft.questions.map((question, index) => <article className="card-elevated qb-question" key={question.id}>
            <div className="qb-question-head"><span className="badge badge-amber">Question {index + 1}</span><span className="text-xs text-muted">{question.conceptTag}</span></div>
            {editor?.id === question.id ? <div className="qb-editor">
              <label className="field">Question<input value={editor.question} onChange={(event) => setEditor({ ...editor, question: event.target.value })} /></label>
              <label className="field">Options (one per line)<textarea rows={5} value={editor.options} onChange={(event) => setEditor({ ...editor, options: event.target.value })} /></label>
              <label className="field">Correct option number (1-based)<input type="number" min={1} max={6} value={Number(editor.correctIndex) + 1} onChange={(event) => setEditor({ ...editor, correctIndex: String(Number(event.target.value) - 1) })} /></label>
              <label className="field">Explanation<textarea rows={3} value={editor.explanation} onChange={(event) => setEditor({ ...editor, explanation: event.target.value })} /></label>
              <label className="field">Concept tag<input value={editor.conceptTag} onChange={(event) => setEditor({ ...editor, conceptTag: event.target.value })} /></label>
              <div className="qb-editor-cites">{editor.chunkIds.map((chunkId, citeIndex) => <label className="field" key={`${chunkId}-${citeIndex}`}>Exact retrieved quote · {chunkId}<textarea rows={3} value={editor.quotes[citeIndex] ?? ""} onChange={(event) => setEditor({ ...editor, quotes: editor.quotes.map((quote, idx) => idx === citeIndex ? event.target.value : quote) })} /></label>)}</div>
              <div className="qb-buttons"><button type="button" className="btn btn-primary" disabled={busy} onClick={saveQuestion}>Save question</button><button type="button" className="btn btn-outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div>
            </div> : <>
              <h3>{question.question}</h3>
              <ol className="qb-options">{question.options.map((option, optionIndex) => <li key={`${optionIndex}-${option}`}>{option}{optionIndex === question.correctIndex && <strong className="qb-answer-key"> · Proposed answer</strong>}</li>)}</ol>
              <p className="qb-explanation"><strong>Proposed explanation:</strong> {question.explanation}</p>
              <CitationBlock citations={question.citations} />
              <div className="qb-buttons mt-3"><button type="button" className="btn btn-outline" disabled={busy || Boolean(editor) || draft.state === "BLOCKED"} onClick={() => setEditor(editorFor(question))}>Edit question</button>
                <button type="button" className="btn btn-outline" disabled={busy || Boolean(editor) || draft.state === "BLOCKED"} onClick={() => regenerateOne(question)}>Regenerate question</button></div>
              <label className="field qb-feedback">Regeneration guidance (optional)<input value={regenNotes[question.id] ?? ""} onChange={(event) => setRegenNotes({ ...regenNotes, [question.id]: event.target.value })} placeholder="What should improve in this question?" /></label>
            </>}
          </article>)}
        </section>

        {draft.state !== "BLOCKED" && <section className="card qb-batch-tools mt-4">
          <h3>Regenerate the full batch</h3><p className="text-sm text-muted mt-1">All questions will be replaced and the entire new batch will need review.</p>
          <label className="field mt-2">Batch guidance (optional)<textarea rows={2} value={batchNote} onChange={(event) => setBatchNote(event.target.value)} /></label>
          <button type="button" className="btn btn-outline mt-2" disabled={busy || Boolean(editor)} onClick={regenerateAll}>Regenerate all {draft.questionCount} questions</button>
        </section>}
        <TracePanel trace={draft.trace ?? []} callsUsed={draft.callsUsed} maxCalls={draft.maxCalls} />
      </>}

      {!!drafts.length && <section className="card qb-saved mt-4"><h2>Saved drafts</h2><ul>{drafts.map((item) => <li key={item.id}><Link href={`/quiz-builder?draft=${encodeURIComponent(item.id)}`}>{item.title || item.topic}</Link> · {item.state.replaceAll("_", " ")} · revision {item.revision} · {item.questionCount} questions{item.publishedVersion ? ` · published v${item.publishedVersion}` : ""}</li>)}</ul></section>}

      <section className="card qb-sources mt-4">
        <h2>Knowledge source status</h2>
        {sources ? <><p className="text-sm text-muted">{sources.chunkCount} searchable chunks across {sources.sources.length} listed sources.</p>
          {sources.usingDemo && <p className="qb-note mt-2">The built-in library is unverified demo evidence. It does not establish clinical verification.</p>}
          {!!sources.errors?.length && <div className="qb-error mt-2" role="alert">{sources.errors.map((item) => <p key={item}>{item}</p>)}</div>}
          <ul>{sources.sources.map((source) => <li key={source.documentId}>{source.title} · {source.provenance}{source.publisher ? ` · ${source.publisher}` : ""}{source.origin ? ` · ${source.origin}` : ""}{safeHttpUrl(source.url) && <> · <a href={safeHttpUrl(source.url) ?? undefined} target="_blank" rel="noreferrer">Source</a></>}</li>)}</ul>
        </> : <p className="text-sm text-muted">Source status is unavailable.</p>}
        <p className="text-xs text-muted mt-2">Add reviewed PDF, TXT or Markdown files under <code>backend/knowledge/documents/</code> and update <code>backend/knowledge/sources.json</code>, then restart the backend. Sources eligible for retrieval still require ASHA review of every generated question.</p>
      </section>
    </main>
    <SiteFooter />
    <style jsx>{`
      .qb-page { display:grid; gap:14px; }
      .qb-top-links, .qb-draft-heading, .qb-section-head, .qb-question-head, .qb-share { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
      .qb-form, .qb-panel, .qb-saved, .qb-sources, .qb-published, .qb-batch-tools { padding:18px; }
      .qb-form h2, .qb-saved h2, .qb-sources h2 { color:var(--primary); font-size:1.1rem; }
      .qb-form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
      .qb-draft-heading { padding:16px 18px; }
      .qb-draft-heading h2 { font-size:1.15rem; margin-top:8px; }
      .qb-draft-heading p { color:var(--text-muted); font-size:.85rem; margin-top:4px; }
      .qb-section-head { align-items:flex-end; margin-bottom:14px; }
      .qb-section-head h2 { color:var(--primary); font-size:1.14rem; }
      .qb-question { padding:18px; margin:12px 0; }
      .qb-question h3 { font-size:1rem; margin:12px 0; line-height:1.5; }
      .qb-options { padding-left:23px; line-height:1.8; }
      .qb-answer-key { color:var(--primary); }
      .qb-explanation { margin-top:12px; line-height:1.65; }
      .qb-citations { border-top:1px solid var(--border); margin-top:14px; padding-top:10px; }
      .qb-citations h4 { color:var(--primary); font-size:.85rem; }
      .qb-citation { border-left:3px solid var(--green-600); padding:5px 10px; margin:9px 0; display:grid; gap:5px; font-size:.83rem; }
      .qb-citation span { color:var(--text-muted); }
      .qb-citation blockquote { line-height:1.55; }
      .qb-citation a, .qb-sources a, .qb-saved a, .inline-link { color:var(--primary); }
      .qb-buttons { display:flex; gap:9px; flex-wrap:wrap; }
      .qb-feedback { max-width:600px; margin-top:12px; }
      .qb-editor { display:grid; gap:12px; margin-top:12px; }
      .qb-editor textarea, .qb-published input, .qb-share input { width:100%; }
      .qb-editor-cites { display:grid; gap:10px; }
      .qb-published { line-height:1.65; border:1px solid var(--green-600); }
      .qb-share { align-items:flex-end; }
      .qb-share .field { flex:1; min-width:250px; }
      .qb-note, .qb-notice, .qb-error { padding:12px 14px; border-radius:9px; line-height:1.55; }
      .qb-note { background:var(--amber-100); border:1px solid var(--amber-300); }
      .qb-notice { background:var(--green-50); border:1px solid var(--green-600); }
      .qb-error { background:var(--red-100); border:1px solid var(--red-600); color:#7d1018; }
      .qb-saved ul, .qb-sources ul { padding-left:20px; line-height:1.8; margin-top:8px; }
      .qb-traces { display:grid; gap:8px; margin-top:12px; }
      .qb-trace { border:1px solid var(--border); border-radius:8px; padding:10px; }
      .qb-trace summary, .qb-panel summary { cursor:pointer; font-weight:700; }
      .qb-trace pre { max-height:400px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.75rem; margin-top:8px; }
      @media(max-width:640px) { .qb-share { align-items:stretch; } .qb-share .field { min-width:0; } }
    `}</style>
  </div>;
}

export default function QuizBuilderPage() {
  return <Suspense fallback={<div className="portal portal-page"><SiteHeader /><main className="page-body">Loading quiz builder…</main><SiteFooter /></div>}><BuilderContent /></Suspense>;
}
