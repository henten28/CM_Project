"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, approvePlan, submitAnswers, askQuestion, completeSession, pick, voiceLang,
  type SessionRecord, type ContentHit, type QuizItem, type SessionSummary, type SafetyResult, type Level } from "@/lib/api-client";
import { logSafetyEvent } from "@/lib/safety-log";
import { recordGap, getDueReviews } from "@/lib/spaced-repetition";
import { getProfile, incrementSessions } from "@/lib/profile-store";

// hold: safety hold at start, or a reloaded session that can only be finished
type Phase = "loading" | "planning" | "approval" | "teaching" | "quiz" | "summary" | "hold";
type Lang = "kn" | "en" | "hi";

interface Message { role: "agent"|"user"|"system"; text: string; agentName?: string; }

const STEPS: Record<Lang, string[]> = {
  kn: ["ಯೋಜನೆ","ಅನುಮೋದನೆ","ಶಿಕ್ಷಣ","ರಸಪ್ರಶ್ನೆ","ಸಾರಾಂಶ"],
  en: ["Plan","Approval","Learn","Quiz","Summary"],
  hi: ["योजना","अनुमोदन","सीखना","प्रश्नोत्तरी","सारांश"],
};

const PHASE_STEP: Record<Phase,number> = { loading:0,planning:0,approval:1,teaching:2,quiz:3,summary:4,hold:0 };

// ── Voice helpers ─────────────────────────────────────────────────────────────

function speak(text: string, lang: Lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = voiceLang(lang);
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

function stopSpeak() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}

// difficulty level now comes from the backend tutor agent (fixed thresholds there)

// local safety log only knows the old three categories
function logCategory(c: SafetyResult["category"]): "URGENT"|"PRESCRIBING"|"PERSONAL_MEDICAL" {
  return c === "URGENT" ? "URGENT" : c === "PERSONAL_MEDICAL" ? "PERSONAL_MEDICAL" : "PRESCRIBING";
}

function SessionContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") ?? "";
  const urlLang = (searchParams.get("lang") ?? "kn") as Lang;
  const router = useRouter();

  const [lang] = useState(urlLang);
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [blocks, setBlocks] = useState<ContentHit[]>([]);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [questions, setQuestions] = useState<QuizItem[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<{correct:boolean;explanation:{kn:string;en:string};reinforcement:ContentHit[]}|null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [userInput, setUserInput] = useState("");
  const [safetyAlert, setSafetyAlert] = useState<{kn:string;en:string;hi:string;type:string}|null>(null);
  const [level, setLevel] = useState<Level|null>(null);
  const [agentStatus, setAgentStatus] = useState<string|null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  const [dueReviews, setDueReviews] = useState<{tag:string;label:Record<string,string>}[]>([]);
  const [profile] = useState(getProfile());
  const bottomRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const fk = lang === "kn" ? "kn" : "";
  // reviewed content is kn/en only, so Hindi sessions read (and speak) English content
  const contentLang: Lang = lang === "kn" ? "kn" : "en";

  function L(kn:string,en:string,hi:string="") { return lang==="kn"?kn:lang==="hi"?(hi||en):en; }

  const pushMsg = useCallback((msg: Message) => setMessages(prev=>[...prev,msg]), []);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages,blocks,questions]);

  // Load due reviews
  useEffect(() => { setDueReviews(getDueReviews()); }, []);

  // TTS control
  function handleSpeak(text: string, voice: Lang = contentLang) {
    if (isSpeaking) { stopSpeak(); setIsSpeaking(false); return; }
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = voiceLang(voice);
    utter.rate = 0.9;
    utter.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
    setIsSpeaking(true);
  }

  // Voice input
  function handleVoiceInput() {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser"); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = voiceLang(lang);
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setIsListening(false);
      sendText(transcript);  // spoken questions go through the backend safety controller like typed ones
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  }

  // errors from the backend show up as a system line instead of failing silently
  function showError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    pushMsg({role:"system",text:L(`⚠️ ಸರ್ವರ್ ದೋಷ: ${msg}`,`⚠️ Server error: ${msg}`,`⚠️ सर्वर त्रुटि: ${msg}`)});
    setAgentStatus(null);
  }

  // fixed referral banner from the backend safety controller; shown before anything else
  function showSafety(res: SafetyResult) {
    if (!res.triggered || !res.message) return;
    setSafetyAlert({...res.message, type: res.category});
    logSafetyEvent({sessionId, category: logCategory(res.category), trigger: res.ruleId ?? "", lang});
  }

  // Init
  useEffect(() => {
    async function init() {
      setAgentStatus(L("ಯೋಜನಾ ಏಜೆಂಟ್ ಕೆಲಸ ಮಾಡುತ್ತಿದೆ…","Planning Agent working…","योजना एजेंट काम कर रहा है…"));
      setPhase("planning");
      let s: SessionRecord;
      try { s = await getSession(sessionId); }
      catch { router.push("/"); return; }
      setSession(s);
      setAgentStatus(null);
      if (s.state === "SAFETY_HOLD") {
        if (s.startSafety) showSafety(s.startSafety);
        setPhase("hold");
        return;
      }
      if (s.state === "COMPLETED" && s.summary) { setSummary(s.summary); setPhase("summary"); return; }
      if (s.state === "IN_PROGRESS") {
        // content and quiz state live in the page, so a reloaded session can only be finished
        pushMsg({role:"system",text:L("ಈ ಅಧಿವೇಶನ ಈಗಾಗಲೇ ನಡೆಯುತ್ತಿದೆ.","This session is already in progress.","यह सत्र पहले से चल रहा है।")});
        setPhase("hold");
        return;
      }
      pushMsg({role:"agent",agentName:L("ಯೋಜನಾ ಏಜೆಂಟ್","Planning Agent","योजना एजेंट"),
        text:L(`ನಮಸ್ಕಾರ ${profile?.name??""}! "${s.topic}" ವಿಷಯಕ್ಕಾಗಿ ${s.durationMinutes} ನಿಮಿಷದ ಪಾಠ ಯೋಜನೆ ಸಿದ್ಧ.`,
               `Hello ${profile?.name??""}! ${s.durationMinutes}-min lesson plan for "${s.topic}" ready. Please review.`,
               `नमस्ते ${profile?.name??""}! "${s.topic}" के लिए ${s.durationMinutes} मिनट की पाठ योजना तैयार है।`)});
      setPhase("approval");
    }
    if (sessionId) init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleApprove() {
    setAgentStatus(L("ಹುಡುಕಾಟ ಏಜೆಂಟ್ ವಿಷಯ ತರುತ್ತಿದೆ…","Retrieval Agent fetching content…","पुनर्प्राप्ति एजेंट सामग्री ला रहा है…"));
    try {
      const data = await approvePlan(sessionId);
      setBlocks(data.content.hits);
      setQuestions(data.questions);  // checkpoint quiz chosen by the tutor agent
      pushMsg({role:"system",text:L(`✅ ಪಾಠ ಯೋಜನೆ ಅನುಮೋದಿಸಲಾಗಿದೆ. ${data.content.hits.length} ವಿಷಯ ಬ್ಲಾಕ್‌ಗಳು ಲೋಡ್.`,`✅ Lesson plan approved. ${data.content.hits.length} content block(s) loaded.`,`✅ पाठ योजना अनुमोदित। ${data.content.hits.length} सामग्री ब्लॉक लोड।`)});
      setAgentStatus(null);
      setPhase("teaching");
    } catch (e) { showError(e); }
  }

  function handleReject() {
    pushMsg({role:"system",text:L("ಯೋಜನೆ ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಮರಳಿ ಹೋಗುತ್ತೆ.","Plan rejected. Returning home.","योजना अस्वीकृत। वापस जा रहे हैं।")});
    setTimeout(()=>router.push("/"),1500);
  }

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text) return;
    setUserInput("");
    pushMsg({role:"user",text});
    try {
      const data = await askQuestion(sessionId, text);
      if (data.safety?.triggered) { showSafety(data.safety); return; }  // hard override: no agent answer
      setSafetyAlert(null);
      const hit = data.content?.hits[0];
      pushMsg({role:"agent",agentName:L("ಹುಡುಕಾಟ ಏಜೆಂಟ್","Retrieval Agent","पुनर्प्राप्ति एजेंट"),
        text: hit
          ? `${pick(hit.title,contentLang)}\n${pick(hit.body,contentLang)}\n📚 ${hit.source}`
          : L("ಅನುಮೋದಿತ ವಿಷಯದಲ್ಲಿ ಉತ್ತರ ಸಿಗಲಿಲ್ಲ. ANM ಅವರನ್ನು ಕೇಳಿ.","No approved content matches this question. Please ask the ANM.","स्वीकृत सामग्री में उत्तर नहीं मिला। कृपया ANM से पूछें।")});
    } catch (e) { showError(e); }
  }

  function handleSendMessage() { sendText(userInput); }

  function handleStartQuiz() {
    // questions already came back with the approved plan
    setCurrentQIdx(0);setSelectedOption(null);setAnswerResult(null);
    setPhase("quiz");
    pushMsg({role:"agent",agentName:L("ಶಿಕ್ಷಕ ಏಜೆಂಟ್","Tutor Agent","ट्यूटर एजेंट"),
      text:L(`ರಸಪ್ರಶ್ನೆ ಪ್ರಾರಂಭ! ${questions.length} ಪ್ರಶ್ನೆ. ಕಷ್ಟ ನಿಮ್ಮ ಅಂಕಕ್ಕೆ ಹೊಂದಿಕೊಳ್ಳುತ್ತದೆ.`,
              `Quiz time! ${questions.length} question(s). Difficulty adapts to your score.`,
              `प्रश्नोत्तरी! ${questions.length} प्रश्न। कठिनाई आपके स्कोर के अनुसार बदलेगी।`)});
  }

  async function handleAnswer(idx: number) {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    const q = questions[currentQIdx];
    try {
      const data = await submitAnswers(sessionId, [{questionId:q.id, selectedIndex:idx}]);
      const t = data.tutor;
      const fb = t.feedback[0];
      const reinforcement = data.content.hits.filter(h => fb.reinforcementContentIds.includes(h.id));
      setAnswerResult({correct:fb.correct, explanation:fb.explanation, reinforcement});
      setQuizTotal(t.answered);
      setQuizCorrect(t.correct);
      setLevel(t.nextActivity.level);
      // adaptive loop: append the tutor's next questions, gaps first
      setQuestions(prev => [...prev, ...t.nextQuestions.filter(n => !prev.some(p => p.id === n.id))]);
      if (!fb.correct) recordGap(q.conceptTag);
      speak(fb.correct ? L("ಸರಿಯಾಗಿದೆ!","Correct!","सही!") : L("ತಪ್ಪಾಗಿದೆ.","Incorrect.","गलत।"), lang);
    } catch (e) { setSelectedOption(null); showError(e); }
  }

  async function finishSession() {
    setAgentStatus(L("ಸಾರಾಂಶ ಏಜೆಂಟ್ ವರದಿ ತಯಾರಿಸುತ್ತಿದೆ…","Summary Agent generating report…","सारांश एजेंट रिपोर्ट तैयार कर रहा है…"));
    try {
      const data = await completeSession(sessionId);
      setSummary(data.summary);setAgentStatus(null);setPhase("summary");
      incrementSessions();
    } catch (e) { showError(e); }
  }

  async function handleNext() {
    stopSpeak(); setIsSpeaking(false);
    if (currentQIdx+1 < questions.length){
      setCurrentQIdx(i=>i+1);setSelectedOption(null);setAnswerResult(null);
    } else {
      await finishSession();
    }
  }

  const stepIndex = PHASE_STEP[phase];
  const steps = STEPS[lang];
  const currentBlock = blocks[currentBlockIdx] ?? null;
  const currentQ = questions[currentQIdx] ?? null;
  const lvl: Level = level ?? "medium";  // tutor agent level; medium until the first answer

  const MODULES_MAP: Record<string,{title:Record<Lang,string>;icon:string}> = {
    m1:{title:{kn:"ಪ್ರತಿಜೀವಕಗಳು ಏನು?",en:"What are antibiotics?",hi:"एंटीबायोटिक्स क्या हैं?"},icon:"💊"},
    m2:{title:{kn:"AMR ಎಂದರೇನು?",en:"What is AMR?",hi:"AMR क्या है?"},icon:"🦠"},
    m3:{title:{kn:"ಸರಿಯಾದ ಬಳಕೆ",en:"Correct use",hi:"सही उपयोग"},icon:"✅"},
    m4:{title:{kn:"ಹಂಚಿಕೊಳ್ಳಬೇಡಿ",en:"Don't share",hi:"साझा न करें"},icon:"🚫"},
    m5:{title:{kn:"ಯಾವಾಗ ವೈದ್ಯರ ಬಳಿ?",en:"When to seek care",hi:"डॉक्टर के पास कब?"},icon:"🏥"},
    m6:{title:{kn:"ಸೋಂಕು ತಡೆ",en:"Infection prevention",hi:"संक्रमण रोकथाम"},icon:"🧼"},
    m7:{title:{kn:"ಕೇಸ್ ಸ್ಟಡಿ",en:"Case studies",hi:"केस अध्ययन"},icon:"📖"},
  };

  return (
    <div className="session-layout">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div><div className="logo-text">AMR ಜಾಗೃತಿ</div><div className="logo-sub">{session?.topic??""}</div></div>
        </div>
        <div className="flex items-center gap-2">
          {agentStatus && <div className="agent-status"><div className="dot"/><span style={{fontSize:"0.72rem"}}>{agentStatus}</span></div>}
        </div>
      </header>

      {/* Progress */}
      <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",padding:"0 16px"}}>
        <div className="progress-steps">
          {steps.map((s,i)=>(
            <div key={s} className={`step-item ${i<stepIndex?"done":i===stepIndex?"active":""}`}>
              <div className="step-circle">{i<stepIndex?"✓":i+1}</div>
              <div className="step-label" style={{fontFamily:lang==="kn"?"var(--font-kannada)":"inherit"}}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Adaptive difficulty indicator */}
      {quizTotal > 0 && (
        <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",padding:"6px 16px",display:"flex",alignItems:"center",gap:8,fontSize:"0.75rem",color:"var(--text-muted)"}}>
          <span>🎯 {L("ಹೊಂದಾಣಿಕೆ ತೊಂದರೆ","Adaptive difficulty","अनुकूली कठिनाई")}:</span>
          <span className={`badge ${lvl==="hard"?"badge-red":lvl==="easy"?"badge-green":"badge-amber"}`}>
            {lvl}{" "}({quizCorrect}/{quizTotal})
          </span>
          {dueReviews.length > 0 && <span className="badge badge-amber ml-2">📚 {dueReviews.length} {L("ಪುನರಾವಲೋಕನ","review(s) due","समीक्षा")}</span>}
        </div>
      )}

      <div className="session-body">
        {/* Safety banner */}
        {safetyAlert && (
          // sticky so auto-scroll to the newest message never hides the referral
          <div className="safety-banner mb-3" style={{position:"sticky",top:0,zIndex:10}}>
            <div className="sb-icon">{safetyAlert.type==="URGENT"?"🚨":"⚠️"}</div>
            <div>
              <div className="sb-title">{safetyAlert.type==="URGENT"?L("ತುರ್ತು","URGENT","आपातकाल"):L("ಗಮನಿಸಿ","Notice","ध्यान दें")}</div>
              <div className={`sb-body ${fk}`}>{lang==="kn"?safetyAlert.kn:lang==="hi"?safetyAlert.hi:safetyAlert.en}</div>
              <button className="btn btn-ghost btn-sm mt-1" onClick={()=>handleSpeak((lang==="kn"?safetyAlert.kn:lang==="hi"?safetyAlert.hi:safetyAlert.en).replace(/\*/g,""),lang)}>🔊 {L("ಕೇಳಿ","Listen","सुनें")}</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div>
          {messages.map((m,i)=>(
            <div key={i} className={`message ${m.role==="user"?"user":m.role==="system"?"":"agent"}`}>
              {m.role==="agent"&&<div className="msg-avatar" title={m.agentName}>{m.agentName?.[0]??"A"}</div>}
              {m.role==="user"&&<div className="msg-avatar user-av">👩</div>}
              <div className={`${m.role==="system"?"card w-full":"msg-bubble"} ${fk}`}
                style={{...(m.role==="system"?{background:"var(--green-50)",borderColor:"var(--green-200)",fontSize:"0.85rem"}:{}),whiteSpace:"pre-wrap"}}>
                {m.agentName&&<div style={{fontSize:"0.72rem",opacity:0.7,marginBottom:4,fontFamily:"var(--font-sans)"}}>🤖 {m.agentName}</div>}
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Approval panel */}
        {phase==="approval"&&session?.plan&&(
          <div className="approval-panel animate-slide">
            <h4 className={fk}>{L("📋 ಪಾಠ ಯೋಜನೆ — ASHA ಅನುಮೋದನೆ","📋 Lesson Plan — ASHA Approval","📋 पाठ योजना — ASHA अनुमोदन")}</h4>
            {session.plan.lessonPlan.map(lm=>{
              const mod=MODULES_MAP[lm.moduleId]??{title:{kn:lm.moduleId,en:lm.moduleId,hi:lm.moduleId},icon:"📚"};
              return(
                <div key={lm.moduleId} className="module-item">
                  <span className="mi-icon">{mod.icon}</span>
                  <span className={`text-sm font-medium ${fk}`}>{mod.title[lang]}</span>
                  <span className="module-duration">{lm.estimatedMinutes} {L("ನಿ.","min","मिनट")}</span>
                </div>);
            })}
            <div className="flex gap-2 mt-3">
              <button id="approve-btn" className="btn btn-primary flex-1" onClick={handleApprove}>✅ {L("ಅನುಮೋದಿಸಿ","Approve","अनुमोदित")}</button>
              <button id="reject-btn" className="btn btn-outline flex-1" onClick={handleReject}>✗ {L("ತಿರಸ್ಕರಿಸಿ","Reject","अस्वीकार")}</button>
            </div>
          </div>
        )}

        {/* Teaching */}
        {phase==="teaching"&&blocks.length>0&&(
          <div className="animate-slide">
            <div className="flex items-center justify-between mb-3">
              <span className={`badge badge-green ${fk}`}>🔍 {L("ಹುಡುಕಾಟ ಏಜೆಂಟ್","Retrieval Agent","पुनर्प्राप्ति एजेंट")}</span>
              <span className="text-xs text-muted">{currentBlockIdx+1} / {blocks.length}</span>
            </div>
            {currentBlock&&(
              <div className="content-block animate-fade">
                <div className="flex justify-between items-start mb-2">
                  <h3 className={`font-bold ${fk}`} style={{fontSize:"1rem",color:"var(--primary)",flex:1}}>{pick(currentBlock.title,contentLang)}</h3>
                  {/* TTS button */}
                  <button onClick={()=>handleSpeak(pick(currentBlock.title,contentLang)+". "+pick(currentBlock.body,contentLang))}
                    title={isSpeaking?"Stop":"Listen"}
                    style={{background:"none",border:"2px solid var(--primary)",borderRadius:20,padding:"4px 10px",cursor:"pointer",color:"var(--primary)",fontSize:"0.8rem",fontWeight:600,marginLeft:8,flexShrink:0}}>
                    {isSpeaking?"⏹ Stop":"🔊 Listen"}
                  </button>
                </div>
                <p className={fk} style={{fontSize:"0.9rem",lineHeight:1.7,whiteSpace:"pre-wrap"}}>
                  {pick(currentBlock.body,contentLang)}
                </p>
                <div className="flex gap-1 mt-3" style={{flexWrap:"wrap"}}>
                  {currentBlock.conceptTags.map(t=><span key={t} className="tag">{t}</span>)}
                </div>
                <div className="cb-source">📚 {currentBlock.source} ({currentBlock.sourceId} · v{currentBlock.version})</div>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {currentBlockIdx>0&&<button className="btn btn-ghost btn-sm" onClick={()=>setCurrentBlockIdx(i=>i-1)}>← {L("ಹಿಂದೆ","Back","वापस")}</button>}
              {currentBlockIdx+1<blocks.length
                ?<button id="next-block-btn" className="btn btn-accent flex-1" onClick={()=>setCurrentBlockIdx(i=>i+1)}>{L("ಮುಂದೆ →","Next →","आगे →")}</button>
                :<button id="start-quiz-btn" className="btn btn-primary flex-1" onClick={handleStartQuiz}>🎯 {L("ರಸಪ್ರಶ್ನೆ ಪ್ರಾರಂಭ →","Start Quiz →","प्रश्नोत्तरी शुरू →")}</button>
              }
            </div>
          </div>
        )}

        {/* Quiz */}
        {phase==="quiz"&&currentQ&&(
          <div className="animate-slide">
            <div className="flex items-center justify-between mb-3">
              <span className={`badge badge-sky ${fk}`}>📚 {L("ಶಿಕ್ಷಕ ಏಜೆಂಟ್","Tutor Agent","ट्यूटर एजेंट")}</span>
              <div className="flex items-center gap-2">
                <span className={`badge ${lvl==="hard"?"badge-red":lvl==="easy"?"badge-green":"badge-amber"}`}>
                  {lvl}
                </span>
                <span className="text-xs text-muted">{currentQIdx+1}/{questions.length}</span>
              </div>
            </div>
            <div className="card-elevated mb-3">
              <div className="flex justify-between items-start mb-4">
                <p className={`font-bold ${fk}`} style={{fontSize:"1rem",lineHeight:1.5,flex:1}}>{pick(currentQ.question,contentLang)}</p>
                <button onClick={()=>handleSpeak(pick(currentQ.question,contentLang)+". "+currentQ.options.map((o,j)=>`${String.fromCharCode(65+j)}. ${pick(o,contentLang)}`).join(". "))}
                  style={{background:"none",border:"2px solid var(--sky-600)",borderRadius:20,padding:"4px 10px",cursor:"pointer",color:"var(--sky-600)",fontSize:"0.78rem",fontWeight:600,marginLeft:8,flexShrink:0}}>
                  🔊
                </button>
              </div>
              {currentQ.options.map((opt,i)=>(
                <button id={`quiz-opt-${i}`} key={i}
                  className={`quiz-option ${fk} ${selectedOption===i&&answerResult?(answerResult.correct?"correct":"incorrect"):""}`}
                  onClick={()=>handleAnswer(i)} disabled={selectedOption!==null}>
                  <span style={{marginRight:8,fontWeight:700}}>{String.fromCharCode(65+i)}.</span>
                  {pick(opt,contentLang)}
                </button>
              ))}
              {answerResult&&(
                <div className={`card mt-3 animate-slide ${fk}`} style={{background:answerResult.correct?"var(--green-50)":"var(--red-100)",borderColor:answerResult.correct?"var(--green-600)":"var(--red-600)",borderWidth:1}}>
                  <div className="font-bold mb-2" style={{color:answerResult.correct?"var(--green-800)":"var(--red-600)"}}>
                    {answerResult.correct?L("✅ ಸರಿಯಾಗಿದೆ!","✅ Correct!","✅ सही!"):L("❌ ತಪ್ಪಾಗಿದೆ","❌ Incorrect","❌ गलत")}
                  </div>
                  <p style={{fontSize:"0.88rem",lineHeight:1.5}}>{pick(answerResult.explanation,contentLang)}</p>
                  {answerResult.reinforcement.map(b=>(
                    <div key={b.id} className="content-block mt-2" style={{fontSize:"0.85rem"}}>
                      <div className="flex justify-between items-start">
                        <strong className={fk}>📖 {pick(b.title,contentLang)}</strong>
                        <button className="btn btn-ghost btn-sm" onClick={()=>handleSpeak(pick(b.title,contentLang)+". "+pick(b.body,contentLang))}>🔊</button>
                      </div>
                      <p className={fk} style={{lineHeight:1.6,whiteSpace:"pre-wrap"}}>{pick(b.body,contentLang)}</p>
                      <div className="cb-source">📚 {b.source}</div>
                    </div>
                  ))}
                  <button id="next-question-btn" className="btn btn-primary btn-sm mt-3" onClick={handleNext}>
                    {currentQIdx+1<questions.length?L("ಮುಂದಿನ ಪ್ರಶ್ನೆ →","Next Question →","अगला प्रश्न →"):L("ಸಾರಾಂಶ ನೋಡಿ →","View Summary →","सारांश देखें →")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {phase==="summary"&&summary&&(
          <div className="animate-slide">
            <div className="card-elevated mb-4">
              <div className="text-center mb-4">
                <div style={{fontSize:"3rem",marginBottom:8}}>{summary.scorePercent>=80?"🌟":summary.scorePercent>=60?"👍":"📚"}</div>
                <h2 className={`text-xl font-bold text-primary ${fk}`}>{L("ಅಧಿವೇಶನ ಪೂರ್ಣ!","Session Complete!","सत्र पूर्ण!")}</h2>
              </div>
              <div className="stat-grid mb-4">
                <div className="stat-card"><div className="stat-val">{summary.scorePercent}%</div><div className={`stat-label ${fk}`}>{L("ರಸಪ್ರಶ್ನೆ ಅಂಕ","Quiz Score","प्रश्न स्कोर")}</div></div>
                <div className="stat-card"><div className="stat-val">{Math.round(summary.scorePercent*summary.answered/100)}/{summary.answered}</div><div className={`stat-label ${fk}`}>{L("ಸರಿ ಉತ್ತರ","Correct","सही उत्तर")}</div></div>
                <div className="stat-card"><div className="stat-val">{summary.covered.length}</div><div className={`stat-label ${fk}`}>{L("ವಿಷಯ","Topics","विषय")}</div></div>
                <div className="stat-card"><div className="stat-val">{summary.covered.reduce((n,c)=>n+c.contentIds.length,0)}</div><div className={`stat-label ${fk}`}>{L("ಬ್ಲಾಕ್","Blocks","ब्लॉक")}</div></div>
              </div>
              {summary.remainingGaps.length>0&&(
                <div className="mb-4">
                  <h4 className={`font-bold mb-2 text-sm ${fk}`} style={{color:"var(--amber-900)"}}>⚠️ {L("ಹೆಚ್ಚು ಗಮನ ಬೇಕಾದ ವಿಷಯ","Areas needing attention","ध्यान देने योग्य क्षेत्र")}</h4>
                  <div className="flex gap-1" style={{flexWrap:"wrap"}}>
                    {summary.remainingGaps.map(g=><span key={g.conceptTag} className={`badge badge-amber ${fk}`}>{pick(g.label,contentLang)}</span>)}
                  </div>
                </div>
              )}
              {summary.remainingGaps.length>0&&(
                <div className="mb-4">
                  <h4 className={`font-bold mb-2 text-sm text-primary ${fk}`}>📋 {L("ಮುಂದಿನ ಹೆಜ್ಜೆ","Follow-up tasks","अनुवर्ती कदम")}</h4>
                  <ul style={{paddingLeft:18,fontSize:"0.88rem",lineHeight:1.7}}>
                    {summary.remainingGaps.map(g=><li key={g.conceptTag} className={fk}>{pick(g.followUp,contentLang)}</li>)}
                  </ul>
                </div>
              )}
              {summary.referralTasks.length>0&&(
                <div className="mb-4">
                  <h4 className={`font-bold mb-2 text-sm ${fk}`} style={{color:"var(--red-600)"}}>🏥 {L("ರೆಫರಲ್ ಕಾರ್ಯಗಳು","Referral tasks","रेफरल कार्य")}</h4>
                  <ul style={{paddingLeft:18,fontSize:"0.88rem",lineHeight:1.7}}>
                    {summary.referralTasks.map(r=><li key={r.id}>{r.action} <span className="tag">{r.category}</span></li>)}
                  </ul>
                </div>
              )}
              <div style={{background:"var(--neutral-100)",borderRadius:8,padding:"10px 14px",fontSize:"0.75rem",color:"var(--text-muted)"}}>
                🤖 {pick(summary.note,contentLang)}
                {summary.sourcesCited.length>0&&<div className="mt-1">📚 {summary.sourcesCited.map(x=>x.name).join(" · ")}</div>}
              </div>
            </div>
            {/* Action buttons */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <button className="btn btn-primary" onClick={()=>router.push("/")}>{L("🏠 ಮನೆ","🏠 Home","🏠 होम")}</button>
              <button className="btn btn-outline" onClick={()=>router.push("/dashboard")}>{L("📊 ಡ್ಯಾಶ್‌ಬೋರ್ಡ್","📊 Dashboard","📊 डैशबोर्ड")}</button>
            </div>
            {/* Certificate & Visit log */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button className="btn btn-accent"
                onClick={()=>{
                  const name=profile?.name??"ASHA Worker";
                  const t=session?.topic??"AMR";
                  const mods=summary.covered.length.toString();
                  const date=new Date().toISOString().split("T")[0];
                  router.push(`/certificate?asha=${encodeURIComponent(name)}&topic=${encodeURIComponent(t)}&score=${summary.scorePercent}&modules=${mods}&date=${date}&lang=${lang}`);
                }}>
                🏅 {L("ಪ್ರಮಾಣಪತ್ರ","Certificate","प्रमाणपत्र")}
              </button>
              <button className="btn btn-outline" onClick={()=>router.push("/visits")}>{L("🏘️ ಭೇಟಿ ದಾಖಲಿಸಿ","🏘️ Log Visit","🏘️ दौरा लॉग करें")}</button>
            </div>
          </div>
        )}
        {phase==="hold"&&(
          <div className="card-elevated animate-slide">
            <button id="finish-session-btn" className="btn btn-primary btn-full" onClick={finishSession}>{L("ಅಧಿವೇಶನ ಮುಗಿಸಿ →","Finish session →","सत्र समाप्त करें →")}</button>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Footer input (teaching phase only) */}
      {phase==="teaching"&&(
        <div className="session-footer">
          <div className="input-row">
            <textarea id="user-message-input" className="chat-input" rows={1}
              placeholder={L("ಪ್ರಶ್ನೆ ಕೇಳಿ…","Ask a question…","प्रश्न पूछें…")}
              value={userInput} onChange={e=>setUserInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSendMessage();}}}
              style={{fontFamily:lang==="kn"?"var(--font-kannada)":"var(--font-sans)"}}/>
            {/* Voice input button */}
            <button id="voice-input-btn" onClick={handleVoiceInput}
              style={{background:isListening?"var(--red-600)":"var(--primary)",color:"white",border:"none",borderRadius:8,padding:"10px 14px",cursor:"pointer",flexShrink:0,fontSize:"1.1rem"}}
              title={isListening?"Stop listening":"Voice input"}>
              {isListening?"⏹":"🎙️"}
            </button>
            <button id="send-btn" className="btn btn-primary" onClick={handleSendMessage}>{L("ಕಳಿಸಿ","Send","भेजें")}</button>
          </div>
          <div className="text-xs text-muted mt-1 text-center" style={{fontFamily:lang==="kn"?"var(--font-kannada)":"inherit"}}>
            {L("⚕️ ವ್ಯಕ್ತಿಗತ ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಗಳು: ANM/ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ","⚕️ Personal health questions: consult ANM or doctor","⚕️ व्यक्तिगत स्वास्थ्य प्रश्न: ANM या डॉक्टर से मिलें")}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:"1.2rem"}}>Loading…</div>}>
      <SessionContent/>
    </Suspense>
  );
}
