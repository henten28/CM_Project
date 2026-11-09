"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteFooter, SiteHeader, PageBanner } from "@/components/SiteChrome";
import { useLang } from "@/lib/prefs";
import {
  actOnAgentSession, getAgentSession, getAgentSessions, getAgentSources, startAgentSession,
  type Activity, type AgentAction, type AgentSession, type AgentSessionSummary, type AgentSources, type AgentTrace, type AgentView,
} from "@/lib/agent-client";

const DURATION_OPTIONS = [5, 10, 15] as const;

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function redactTrace(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTrace);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
      [/api.?key|authorization|secret|password/i.test(key) ? "[redacted]" : key,
        /api.?key|authorization|secret|password/i.test(key) ? "[redacted]" : redactTrace(item)]));
  }
  if (typeof value === "string") return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]");
  return value;
}

function CitationList({ activity }: { activity: Activity }) {
  if (!activity.citations?.length) return <p className="text-xs text-muted mt-2">No citations attached.</p>;
  return <div className="agent-citations" aria-label="Sources">
    <h4>Sources and retrieved quotes</h4>
    {activity.citations.map((citation, index) => {
      const href = safeHttpUrl(citation.url);
      return <article className="agent-citation" key={`${citation.chunkId}-${index}`}>
        <strong>{citation.title || citation.documentId}</strong>
        <span>{citation.location}{citation.provenance ? ` · ${citation.provenance}` : ""}</span>
        {citation.quote && <blockquote>“{citation.quote}”</blockquote>}
        {href && <a href={href} target="_blank" rel="noreferrer">Open source</a>}
        {!href && citation.url && <span>{citation.url}</span>}
      </article>;
    })}
  </div>;
}

function ActivityCard({ activity, review = false, learner = false }: { activity: Activity; review?: boolean; learner?: boolean }) {
  return <article className="card-elevated agent-activity">
    <div className="agent-activity-kicker">{activity.kind}</div>
    <h2>{activity.title}</h2>
    {activity.body && <p className="agent-body">{activity.body}</p>}
    {activity.quiz && <section className="agent-quiz" aria-label="Quiz">
      <h3>{activity.quiz.question}</h3>
      <ol>{activity.quiz.options.map((option, index) => <li key={`${index}-${option}`}>
        {option}{review && activity.quiz?.correctIndex === index && <strong className="agent-key"> · Answer key</strong>}
      </li>)}</ol>
      {review && activity.quiz.correctIndex !== undefined && <p><strong>Proposed answer key:</strong> {activity.quiz.options[activity.quiz.correctIndex] ?? "Unavailable"}</p>}
      {review && activity.quiz.explanation && <p><strong>Answer explanation:</strong> {activity.quiz.explanation}</p>}
      {learner && activity.quiz.explanation && <p className="agent-feedback"><strong>Feedback:</strong> {activity.quiz.explanation}</p>}
    </section>}
    <CitationList activity={activity} />
  </article>;
}

function TracePanel({ trace, callsUsed, maxCalls }: { trace: AgentTrace[]; callsUsed: number; maxCalls: number }) {
  return <details className="card agent-panel">
    <summary>Agent trace · {callsUsed}/{maxCalls} model calls</summary>
    <p className="text-xs text-muted mt-2">Shows recorded requests, tool use, results, review decisions, usage and citations. Provider credentials are omitted. This local demo has no separate sign-in; ASHA and learner views are presentation modes in this browser.</p>
    <div className="agent-trace-list">
      {trace.map((item, index) => <details key={`${item.at}-${index}`} className="agent-trace-item">
        <summary>{item.event} · {item.agent} · {new Date(item.at).toLocaleString()}</summary>
        <pre>{JSON.stringify(redactTrace(item.detail), null, 2)}</pre>
      </details>)}
      {!trace.length && <p className="text-sm text-muted">No trace entries yet.</p>}
    </div>
  </details>;
}

function AgentSessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("id") ?? "";
  const [lang] = useLang();
  const [view, setView] = useState<AgentView>("asha");
  const viewRef = useRef<AgentView>("asha");
  const requestSequence = useRef(0);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [sources, setSources] = useState<AgentSources | null>(null);
  const [recentSessions, setRecentSessions] = useState<AgentSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState<5 | 10 | 15>(10);
  const [reviseNote, setReviseNote] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loadedView, setLoadedView] = useState<AgentView | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState("");

  const load = useCallback(() => {
    if (!sessionId) return Promise.resolve();
    const sequence = ++requestSequence.current;
    const requestedView = view;
    return Promise.resolve().then(() => {
      if (sequence === requestSequence.current && viewRef.current === requestedView) {
        setLoading(true);
        setError(null);
      }
      return getAgentSession(sessionId, requestedView);
    })
      .then((loaded) => {
        if (sequence !== requestSequence.current || viewRef.current !== requestedView) return;
        setSession(loaded); setLoadedView(requestedView); setLoadedSessionId(sessionId);
      })
      .catch((cause: unknown) => {
        if (sequence === requestSequence.current && viewRef.current === requestedView)
          setError(cause instanceof Error ? cause.message : "Could not load the session");
      })
      .finally(() => setLoading(false));
  }, [sessionId, view]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    getAgentSources().then(setSources).catch(() => setSources(null));
    getAgentSessions().then(setRecentSessions).catch(() => setRecentSessions([]));
  }, []);

  const sessionReady = loadedView === view && loadedSessionId === sessionId;
  const visibleSession = sessionReady ? session : null;
  const current = visibleSession?.current ?? null;
  const pending = view === "asha" ? visibleSession?.pending ?? null : null;
  const answerCount = visibleSession?.answers.length ?? 0;
  const correctCount = visibleSession?.answers.filter((answer) => answer.correct).length ?? 0;
  const statusLabel = useMemo(() => session?.state.replaceAll("_", " ") ?? "", [session?.state]);

  function switchView(next: AgentView) {
    if (next === viewRef.current) return;
    viewRef.current = next;
    requestSequence.current += 1;
    setView(next);
  }

  async function createSession() {
    setBusy(true); setError(null);
    try {
      const created = await startAgentSession({ topic: topic.trim() || "AMR awareness", durationMinutes: minutes, lang });
      router.push(`/agent-session?id=${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the session");
    } finally { setBusy(false); }
  }

  async function perform(action: AgentAction, extra: { proposalId?: string; feedback?: string; selectedIndex?: number; text?: string } = {}) {
    if (!session) return;
    const sequence = ++requestSequence.current;
    const requestedView = view;
    setBusy(true); setError(null);
    try {
      const updated = await actOnAgentSession(session.id, { action, view, ...extra });
      if (sequence !== requestSequence.current || viewRef.current !== requestedView) return;
      setSession(updated);
      setLoadedView(requestedView); setLoadedSessionId(session.id);
      setReviseNote(""); setSelectedIndex(null);
    } catch (cause) {
      if (sequence !== requestSequence.current || viewRef.current !== requestedView) return;
      setError(cause instanceof Error ? cause.message : "The action could not be completed");
      await load();
    } finally { setBusy(false); }
  }

  const languageClass = lang === "kn" ? "kn" : "";

  return <div className="portal portal-page">
    <SiteHeader />
    <PageBanner img="/img/step3.svg" title="Agent-led AMR learning session"
      sub="Review each proposed activity before it appears in learner view." />
    <main className={`page-body ${languageClass}`} style={{ maxWidth: 980 }}>
      {!sessionId ? <section className="card-elevated agent-start">
        <h2>Start an agent session</h2>
        <p className="text-sm text-muted mt-2">The planner responds in your selected language. Every learner-facing draft requires ASHA review first.</p>
        <div className="field mt-3">
          <label htmlFor="agent-topic">Session topic</label>
          <input id="agent-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="For example, infection prevention" />
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-bold mb-2">Available minutes</legend>
          <div className="flex gap-2">{DURATION_OPTIONS.map((option) => <button type="button" key={option} className={`time-btn ${minutes === option ? "on" : ""}`} aria-pressed={minutes === option} onClick={() => setMinutes(option)}>{option}</button>)}</div>
        </fieldset>
        <p className="text-xs text-muted mt-3">Language: {lang === "kn" ? "Kannada" : lang === "hi" ? "Hindi" : "English"} (change in the header)</p>
        <button type="button" className="btn btn-primary mt-4" disabled={busy} onClick={createSession}>{busy ? "Starting…" : "Start session"}</button>
        {error && <p role="alert" className="agent-error mt-3">{error}</p>}
      </section> : <>
        <div className="agent-toolbar card">
          <div><strong>Session {sessionId}</strong>{session && <span> · {session.topic} · {session.durationMinutes} min · {session.lang.toUpperCase()}</span>}</div>
          <div className="agent-role-switch" role="group" aria-label="Session view">
            <button type="button" aria-pressed={view === "asha"} className={view === "asha" ? "on" : ""} onClick={() => switchView("asha")}>ASHA review</button>
            <button type="button" aria-pressed={view === "learner"} className={view === "learner" ? "on" : ""} onClick={() => switchView("learner")}>Learner view</button>
          </div>
        </div>

        {loading && <p role="status" className="card mt-3">Loading saved session…</p>}
        {error && <div role="alert" className="agent-error mt-3">{error}<button type="button" className="pill-btn" onClick={() => void load()}>Retry</button></div>}

        {!sessionReady && !error && <p role="status" className="card mt-3">Loading saved session…</p>}
        {session && sessionReady && !loading && <>
          <div className="agent-status-row mt-3">
            <span className={`badge ${session.state === "BLOCKED" ? "badge-red" : session.state === "COMPLETED" ? "badge-green" : "badge-amber"}`}>{statusLabel}</span>
            <span className="text-sm text-muted">Model calls {session.callsUsed} / {session.maxCalls}{view === "asha" ? ` · Recorded score ${correctCount}/${answerCount}` : ""}</span>
          </div>

          {session.safetyMessage && <aside className="agent-error mt-3" role="alert"><strong>Safety referral:</strong> {session.safetyMessage}</aside>}

          {(session.usingDemo || sources?.usingDemo) && <aside className="agent-demo-note mt-3" role="note">
            Demo corpus is active. Its legacy library chunks are labelled unverified; citations identify retrieved text and do not establish clinical verification.
          </aside>}
          {session.error && <aside className="agent-error mt-3" role="alert">{session.error}</aside>}

          {view === "learner" && <section aria-label="Approved session activities" className="agent-approved-list mt-4">
            <h2 className="agent-section-title">Approved learner material</h2>
            {session.history.map((activity, index) => <ActivityCard key={`${activity.id}-${index}`} activity={activity} learner />)}
            {current && <ActivityCard activity={current} learner />}
            {!session.history.length && !current && <p className="card mt-3">No approved activity is available yet. Ask the ASHA worker to review the proposed activity.</p>}
            {session.feedback && session.state === "READY" && current && (current.kind === "answer" || session.answers.some((answer) => answer.activityId === current.id)) && <p className="agent-feedback mt-3">{session.feedback}</p>}

            {session.state === "AWAITING_ANSWER" && current?.kind === "quiz" && current.quiz && <section className="card-elevated mt-3">
              <fieldset disabled={busy}>
                <legend className="font-bold mb-3">{current.quiz.question}</legend>
                {current.quiz.options.map((option, index) => <label className="agent-option" key={`${index}-${option}`}>
                  <input type="radio" name="agent-answer" value={index} checked={selectedIndex === index} onChange={() => setSelectedIndex(index)} />
                  <span>{option}</span>
                </label>)}
              </fieldset>
              <button className="btn btn-primary mt-3" type="button" disabled={busy || selectedIndex === null} onClick={() => void perform("answer", { proposalId: current.id, selectedIndex: selectedIndex ?? undefined })}>{busy ? "Submitting…" : "Submit answer"}</button>
            </section>}

            {session.state === "READY" && <div className="agent-actions mt-3">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void perform("continue")}>{busy ? "Working…" : "Continue session"}</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { const text = window.prompt("Ask a question about this topic"); if (text?.trim()) void perform("ask", { text: text.trim() }); }}>Ask a question</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void perform("finish")}>Request session summary</button>
            </div>}
          </section>}

          {view === "asha" && <section className="mt-4" aria-label="ASHA review workspace">
            <div className="agent-review-heading">
              <h2 className="agent-section-title">ASHA review workspace</h2>
              <button type="button" className="pill-btn" onClick={() => switchView("learner")}>Preview learner view</button>
            </div>
            {pending && <div className="agent-pending mt-3">
              <div className="agent-review-banner">Proposed {pending.kind} · review before showing learner</div>
              <ActivityCard activity={pending} review />
              <div className="agent-review-controls card-elevated">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void perform("approve", { proposalId: pending.id })}>{busy ? "Saving…" : "Approve for learner"}</button>
                <label className="field mt-3" htmlFor="revision-note">What should change?</label>
                <textarea id="revision-note" value={reviseNote} onChange={(event) => setReviseNote(event.target.value)} rows={3} placeholder="Describe a correction or request a clearer, shorter explanation." />
                <button type="button" className="btn btn-outline mt-2" disabled={busy || !reviseNote.trim()} onClick={() => void perform("revise", { proposalId: pending.id, feedback: reviseNote.trim() })}>{busy ? "Revising…" : "Request revision"}</button>
              </div>
            </div>}

            {current && <div className="mt-3"><h3 className="text-sm font-bold mb-2">Current approved activity</h3><ActivityCard activity={current} review /></div>}
            {!pending && !current && session.state !== "BLOCKED" && <p className="card mt-3">No activity yet. Start or reload this session to continue.</p>}
            {session.feedback && <p className="agent-feedback mt-3">{session.feedback}</p>}

            {!pending && session.state === "READY" && <div className="agent-actions card mt-3">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void perform("continue")}>{busy ? "Working…" : "Ask agent for next activity"}</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { const text = window.prompt("Ask a question about this topic"); if (text?.trim()) void perform("ask", { text: text.trim() }); }}>Ask a question</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void perform("finish")}>Request summary</button>
            </div>}
            {!pending && session.state === "AWAITING_ANSWER" && current?.kind === "quiz" && current.quiz && <div className="card mt-3">
              <p className="text-sm">Learner answer is ready to record.</p>
              <button type="button" className="btn btn-primary mt-2" disabled={busy} onClick={() => switchView("learner")}>Switch to learner view to answer</button>
            </div>}
          </section>}

          {view === "asha" && <TracePanel trace={session.trace ?? []} callsUsed={session.callsUsed} maxCalls={session.maxCalls} />}
        </>}
      </>}

      {!!recentSessions.length && <section className="card agent-recent mt-4" aria-labelledby="agent-recent-heading">
        <h2 id="agent-recent-heading">Recent agent sessions</h2>
        <ul className="agent-source-list">{recentSessions.map((item) => <li key={item.id}>
          <Link href={`/agent-session?id=${encodeURIComponent(item.id)}`}>{item.topic}</Link> · {item.state.replaceAll("_", " ")} · {item.answered} answers ({item.correct} correct) · {new Date(item.createdAt).toLocaleString()}
        </li>)}</ul>
      </section>}

      <section className="agent-sources card mt-4" aria-labelledby="agent-sources-heading">
        <h2 id="agent-sources-heading">Knowledge sources</h2>
        {sources ? <>
          <p className="text-sm text-muted">{sources.chunkCount} searchable chunks · {sources.sources.length} listed sources</p>
          {sources.usingDemo && <p className="agent-demo-note mt-2">Using the built-in demo library. These chunks are marked unverified and are not external clinical validation.</p>}
          <p className="text-xs text-muted mt-2">A source listed as approved is eligible for retrieval. ASHA review is still required for every generated activity before learner display.</p>
          {!!sources.errors?.length && <aside className="agent-error mt-2" role="alert">
            <strong>Some knowledge files could not be imported:</strong>
            <ul>{sources.errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>
          </aside>}
          <details className="mt-2"><summary>Source list</summary>
            <ul className="agent-source-list">{sources.sources.map((source) => <li key={source.documentId}>
              <strong>{source.title}</strong> · {source.approved ? "available to retrieval" : "not approved"} · {source.chunkCount} chunks · {source.provenance}{source.publisher ? ` · ${source.publisher}` : ""}{source.origin ? ` · ${source.origin}` : ""}
              {safeHttpUrl(source.url) && <> · <a href={safeHttpUrl(source.url) ?? undefined} target="_blank" rel="noreferrer">Open source</a></>}
            </li>)}</ul>
          </details>
        </> : <p className="text-sm text-muted">Source status is unavailable while the backend is offline.</p>}
        <p className="text-xs text-muted mt-2">To add local material, put approved PDF, TXT or Markdown files in <code>backend/knowledge/documents/</code>, update <code>backend/knowledge/sources.json</code>, then restart the backend. Remote URLs are not fetched.</p>
      </section>
      <p className="text-xs text-muted mt-3"><Link href="/">Back to home</Link> · Session updates are saved by the backend and can be reloaded using this URL.</p>
    </main>
    <SiteFooter />
    <style jsx>{`
      .agent-start, .agent-review-controls, .agent-sources, .agent-panel { padding: 20px; }
      .agent-start { max-width: 680px; margin: 0 auto; }
      .agent-start h2, .agent-sources h2 { color: var(--primary); font-size: 1.15rem; }
      .agent-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:14px 18px; }
      .agent-role-switch { display:flex; gap:4px; padding:4px; border-radius:999px; background:var(--surface-2); }
      .agent-role-switch button { border:0; border-radius:999px; background:transparent; padding:8px 13px; font-weight:700; cursor:pointer; color:var(--text-muted); }
      .agent-role-switch button.on { color:#fff; background:var(--primary); }
      .agent-status-row, .agent-review-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
      .agent-section-title { font-size:1.08rem; color:var(--primary); }
      .agent-activity { padding:20px; margin-bottom:14px; }
      .agent-activity h2 { color:var(--primary); font-size:1.2rem; margin:3px 0 10px; }
      .agent-activity-kicker { color:var(--amber-700); font-size:.76rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
      .agent-body { white-space:pre-wrap; line-height:1.75; }
      .agent-quiz { padding:14px; background:var(--surface-2); border-radius:10px; margin-top:14px; }
      .agent-quiz h3 { font-size:1rem; margin-bottom:8px; }
      .agent-quiz ol { padding-left:22px; line-height:1.75; }
      .agent-key { color:var(--primary); }
      .agent-citations { border-top:1px solid var(--border); margin-top:16px; padding-top:12px; }
      .agent-citations h4 { font-size:.84rem; color:var(--primary); margin-bottom:8px; }
      .agent-citation { border-left:3px solid var(--green-600); padding:4px 10px; margin:9px 0; display:grid; gap:4px; font-size:.82rem; }
      .agent-citation span { color:var(--text-muted); overflow-wrap:anywhere; }
      .agent-citation blockquote { line-height:1.6; }
      .agent-citation a, .agent-sources a { color:var(--primary); }
      .agent-review-banner { padding:10px 14px; color:#634208; background:var(--amber-100); border:1px solid var(--amber-300); border-radius:10px 10px 0 0; font-weight:700; }
      .agent-review-controls { background:var(--white); border:1px solid var(--border); border-top:0; border-radius:0 0 14px 14px; }
      .agent-review-controls textarea { width:100%; padding:11px; border:1px solid var(--border); border-radius:8px; font:inherit; resize:vertical; }
      .agent-actions { display:flex; flex-wrap:wrap; gap:10px; padding:14px; }
      .agent-option { display:flex; align-items:flex-start; gap:10px; padding:9px 0; cursor:pointer; }
      .agent-option input { margin-top:5px; }
      .agent-feedback { padding:12px 14px; background:var(--green-50); border-left:4px solid var(--green-700); border-radius:6px; line-height:1.6; }
      .agent-error { padding:12px 14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:var(--red-100); border:1px solid var(--red-600); border-radius:9px; color:#7d1018; }
      .agent-demo-note { padding:12px 14px; background:var(--amber-100); border:1px solid var(--amber-300); border-radius:9px; font-size:.86rem; line-height:1.6; }
      .agent-panel { margin-top:18px; }
      .agent-panel summary, .agent-sources summary { cursor:pointer; font-weight:700; }
      .agent-trace-list { display:grid; gap:8px; margin-top:12px; }
      .agent-trace-item { padding:10px; border:1px solid var(--border); border-radius:8px; }
      .agent-trace-item pre { overflow:auto; max-height:420px; margin-top:8px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.75rem; }
      .agent-source-list { padding-left:20px; line-height:1.65; margin-top:8px; }
      .agent-recent { padding:16px 20px; }
      .agent-recent h2 { color:var(--primary); font-size:1rem; }
      @media (max-width:640px) { .agent-toolbar { align-items:flex-start; } .agent-role-switch { width:100%; } .agent-role-switch button { flex:1; } }
    `}</style>
  </div>;
}

export default function AgentSessionPage() {
  return <Suspense fallback={<div className="portal portal-page"><SiteHeader /><main className="page-body">Loading session…</main><SiteFooter /></div>}>
    <AgentSessionContent />
  </Suspense>;
}
