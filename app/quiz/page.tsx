"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBanner, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {
  createQuizAttempt, getPublicQuiz, getQuizAttempt, listPublishedQuizzes, submitQuizAttempt,
  type PublicQuiz, type PublishedQuizSummary, type QuizAttempt,
} from "@/lib/quiz-client";

function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}

function LearnerQuizContent() {
  const params = useSearchParams();
  const router = useRouter();
  const quizId = params.get("id") ?? "";
  const attemptId = params.get("attempt") ?? "";
  const versionParam = params.get("version");
  const versions = params.getAll("version");
  const version = versions.length === 1 && /^\d+$/.test(versionParam ?? "") && Number(versionParam) >= 1 ? Number(versionParam) : undefined;
  const [catalog, setCatalog] = useState<PublishedQuizSummary[]>([]);
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const currentSequence = ++sequence.current;
    Promise.resolve().then(() => {
      if (currentSequence !== sequence.current) return;
      setLoading(true); setError(null); setQuiz(null); setAttempt(null); setAnswers({});
      if (!quizId) return listPublishedQuizzes().then((items) => { if (currentSequence === sequence.current) setCatalog(items); });
      if (versions.length > 1 || (versionParam !== null && version === undefined)) throw new Error("Invalid quiz version in link");
      if (!attemptId) return getPublicQuiz(quizId, version).then((loaded) => { if (currentSequence === sequence.current) setQuiz(loaded); });
      return getQuizAttempt(attemptId).then((saved) => {
        if (saved.quizId !== quizId || (version !== undefined && saved.version !== version)) throw new Error("This attempt belongs to a different published quiz version");
        if (currentSequence === sequence.current) { setAttempt(saved); setQuiz(saved.quiz); }
      });
    }).catch((cause: unknown) => {
      if (currentSequence === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load quiz");
    }).finally(() => {
      if (currentSequence === sequence.current) setLoading(false);
    });
    return () => { sequence.current += 1; };
  }, [quizId, attemptId, version, versionParam, versions.length]);

  async function startAttempt() {
    if (!quiz) return;
    const currentSequence = sequence.current;
    setBusy(true); setError(null);
    try {
      const started = await createQuizAttempt(quiz.id, quiz.version);
      if (currentSequence !== sequence.current) return;
      setAttempt(started); setAnswers({});
      router.replace(`/quiz?id=${encodeURIComponent(started.quizId)}&version=${started.version}&attempt=${encodeURIComponent(started.id)}`);
    } catch (cause) { if (currentSequence === sequence.current) setError(cause instanceof Error ? cause.message : "Could not start an attempt"); }
    finally { setBusy(false); }
  }

  async function submitAll() {
    if (!attempt || !quiz || Object.keys(answers).length !== quiz.questions.length) return;
    const currentSequence = sequence.current;
    setBusy(true); setError(null);
    try {
      const result = await submitQuizAttempt(attempt.id, quiz.questions.map((question) => ({
        questionId: question.id, selectedIndex: answers[question.id],
      })));
      if (currentSequence !== sequence.current) return;
      setAttempt(result);
    } catch (cause) {
      if (currentSequence === sequence.current) {
        setError(cause instanceof Error ? cause.message : "Could not submit answers");
        try { const saved = await getQuizAttempt(attempt.id); if (currentSequence === sequence.current) setAttempt(saved); }
        catch { /* keep selections so the learner can retry */ }
      }
    }
    finally { setBusy(false); }
  }

  return <div className="portal portal-page">
    <SiteHeader />
    <PageBanner img="/img/step3.svg" title={quiz ? quiz.title : "Published quizzes"}
      sub={quiz ? `${quiz.topic} · ${quiz.difficulty} · version ${quiz.version}` : "Choose a reviewed quiz and attempt the full question set."} />
    <main className="page-body ql-page" style={{ maxWidth: 900 }}>
      <div className="ql-nav"><Link className="pill-btn" href="/">Home</Link><Link className="pill-btn" href="/quiz-builder">ASHA quiz builder</Link></div>
      {loading && <p role="status" className="card mt-3">Loading…</p>}
      {error && <div role="alert" className="ql-error mt-3">{error}{quizId && !quiz && <p className="text-sm mt-2">Only published quizzes can be opened here. If this is a draft, ask the ASHA worker to publish it first.</p>}</div>}

      {!quizId && !loading && !error && <section className="ql-catalog mt-3" aria-labelledby="ql-catalog-title">
        <h2 id="ql-catalog-title">Quiz catalog</h2>
        {catalog.length ? catalog.map((item) => <article className="card-elevated ql-item" key={`${item.id}-${item.version}`}>
          <div><h3>{item.title}</h3><p>{item.topic} · {item.lang.toUpperCase()} · {item.difficulty} · {item.questionCount} questions · version {item.version}</p></div>
          <Link className="btn btn-primary" href={`/quiz?id=${encodeURIComponent(item.id)}&version=${item.version}`}>Open quiz</Link>
        </article>) : <p className="card mt-3">No quizzes have been published yet.</p>}
      </section>}

      {quiz && !loading && <>
        <div className="ql-meta card mt-3"><strong>{quiz.topic}</strong><span>{quiz.lang.toUpperCase()} · {quiz.difficulty} · {quiz.questionCount} questions · immutable version {quiz.version}</span></div>

        {attempt?.status === "COMPLETED" && attempt.result && <section className="mt-4" aria-label="Quiz results">
          <div className="ql-result card-elevated"><strong>Your score: {attempt.result.scorePercent}%</strong><span>{attempt.result.correct} correct out of {attempt.result.total}</span></div>
          {attempt.result.items.map((item, index) => <article className="card-elevated ql-result-item" key={item.questionId}>
            <span className={`badge ${item.correct ? "badge-green" : "badge-red"}`}>{item.correct ? "Correct" : "Review this answer"}</span>
            <h3>{index + 1}. {item.question}</h3>
            <ol>{item.options.map((option, optionIndex) => <li key={`${optionIndex}-${option}`}>
              {option}{optionIndex === item.correctIndex && <strong className="ql-correct"> · Correct answer</strong>}{optionIndex === item.selectedIndex && <span> · Your answer</span>}
            </li>)}</ol>
            <p className="mt-2"><strong>Explanation:</strong> {item.explanation}</p>
            {!!item.citations.length && <div className="ql-citations"><strong>Sources</strong>{item.citations.map((citation, index) => <div className="ql-citation" key={`${citation.chunkId}-${index}`}>
              <b>{citation.title || citation.documentId}</b><span>{citation.location} · {citation.provenance}</span><blockquote>“{citation.quote}”</blockquote>
              {safeHttpUrl(citation.url) && <a href={safeHttpUrl(citation.url) ?? undefined} target="_blank" rel="noreferrer">Open source</a>}
            </div>)}</div>}
          </article>)}
          <button className="btn btn-primary mt-3" type="button" disabled={busy} onClick={startAttempt}>{busy ? "Starting…" : "Start an independent new attempt"}</button>
        </section>}

        {(!attempt || attempt.status === "IN_PROGRESS") && <section className="mt-4" aria-labelledby="ql-attempt-title">
          {!attempt ? <div className="card-elevated ql-start"><h2 id="ql-attempt-title">Ready to begin?</h2><p>This attempt uses the published version shown above. Your answers are graded by the server after you submit the entire set.</p>
            <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={startAttempt}>{busy ? "Starting…" : "Start this quiz"}</button></div> : <>
            <h2 id="ql-attempt-title">Answer all {quiz.questions.length} questions</h2>
            <p className="text-sm text-muted mt-1">Your attempt is saved as {attempt.id}. Answers are not saved until you submit; if you reload first, reopen this attempt and select them again.</p>
            {quiz.questions.map((question, index) => <fieldset className="card-elevated ql-question" key={question.id}>
              <legend>{index + 1}. {question.question}</legend>
              {question.options.map((option, optionIndex) => <label className="ql-option" key={`${optionIndex}-${option}`}>
                <input type="radio" name={`answer-${question.id}`} checked={answers[question.id] === optionIndex} disabled={busy} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))} />
                <span>{option}</span>
              </label>)}
            </fieldset>)}
            <button type="button" className="btn btn-primary mt-2" disabled={busy || Object.keys(answers).length !== quiz.questions.length} onClick={submitAll}>{busy ? "Submitting…" : "Submit all answers"}</button>
          </>}
        </section>}
      </>}
    </main>
    <SiteFooter />
    <style jsx>{`
      .ql-page { display:grid; gap:12px; }
      .ql-nav { display:flex; gap:8px; flex-wrap:wrap; }
      .ql-catalog h2 { color:var(--primary); font-size:1.15rem; margin-bottom:12px; }
      .ql-item { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; padding:16px; margin:10px 0; }
      .ql-item h3 { color:var(--primary); font-size:1rem; }
      .ql-item p, .ql-meta span { color:var(--text-muted); font-size:.84rem; margin-top:5px; }
      .ql-meta { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:14px 16px; }
      .ql-start { padding:18px; }
      .ql-start h2 { color:var(--primary); }
      .ql-start p { margin-top:8px; line-height:1.6; }
      .ql-question { width:100%; padding:16px 18px; margin:12px 0; border:0; }
      .ql-question legend { font-weight:700; padding:0 4px; line-height:1.55; }
      .ql-option { display:flex; gap:10px; align-items:flex-start; padding:9px 4px; cursor:pointer; }
      .ql-option input { margin-top:5px; }
      .ql-result { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:18px; color:var(--primary); font-size:1.15rem; }
      .ql-result-item { padding:18px; margin:12px 0; }
      .ql-result-item h3 { margin:12px 0; font-size:1rem; }
      .ql-result-item ol { padding-left:22px; line-height:1.8; }
      .ql-correct { color:var(--primary); }
      .ql-citations { border-top:1px solid var(--border); margin-top:14px; padding-top:10px; }
      .ql-citation { border-left:3px solid var(--green-600); padding:5px 10px; display:grid; gap:5px; margin-top:8px; font-size:.84rem; }
      .ql-citation span { color:var(--text-muted); }
      .ql-citation blockquote { line-height:1.6; }
      .ql-citation a { color:var(--primary); }
      .ql-error { padding:12px 14px; background:var(--red-100); border:1px solid var(--red-600); border-radius:9px; color:#7d1018; }
    `}</style>
  </div>;
}

export default function QuizPage() {
  return <Suspense fallback={<div className="portal portal-page"><SiteHeader /><main className="page-body">Loading quiz…</main><SiteFooter /></div>}><LearnerQuizContent /></Suspense>;
}
