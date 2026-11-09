"use client";

import { useState, useEffect, Suspense } from "react";
import { useLang, type Lang } from "@/lib/prefs";
import { SiteHeader, SiteFooter, PageBanner } from "@/components/SiteChrome";
import { getDashboardSessions, getReferralTasks, closeReferralTask, getEvaluation,
  type DashboardSession, type ReferralTask, type EvaluationReport, type Metric } from "@/lib/api-client";


// sessions, referral tasks and evaluation results all come from the backend (no demo data)

const TOPIC_LABELS: Record<string,Record<Lang,string>> = {
  general:{kn:"ಸಾಮಾನ್ಯ AMR",en:"General AMR",hi:"सामान्य AMR"},
  antibiotics:{kn:"ಪ್ರತಿಜೀವಕಗಳು",en:"Antibiotics",hi:"एंटीबायोटिक्स"},
  amr:{kn:"AMR / ನಿರೋಧ",en:"AMR / Resistance",hi:"AMR / प्रतिरोध"},
  prevention:{kn:"ಸೋಂಕು ತಡೆ",en:"Prevention",hi:"रोकथाम"},
  sharing:{kn:"ಹಂಚಿಕೊಳ್ಳಬೇಡಿ",en:"Don't Share",hi:"साझा न करें"},
  "case study":{kn:"ಕೇಸ್ ಸ್ಟಡಿ",en:"Case Study",hi:"केस अध्ययन"},
};

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
function BarChart({ data, label }: { data: {label:string;value:number;color:string}[]; label: string }) {
  const maxVal = Math.max(...data.map(d=>d.value), 1);
  const w = 340; const h = 120; const pad = 30; const barW = (w - pad*2) / data.length - 4;

  return (
    <div>
      <div style={{fontSize:"0.75rem",fontWeight:600,color:"var(--text-muted)",marginBottom:6}}>{label}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{overflow:"visible"}}>
        {/* Grid lines */}
        {[0,50,100].map(pct=>{
          const y = pad + (h - pad*2) * (1 - pct/100);
          return <line key={pct} x1={pad} y1={y} x2={w-pad} y2={y} stroke="var(--border)" strokeDasharray="2"/>;
        })}
        {/* Bars */}
        {data.map((d,i)=>{
          const barH = ((d.value/maxVal) * (h - pad*2));
          const x = pad + i*(barW+4);
          const y = h - pad - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={d.color} rx={3} opacity={0.85}/>
              <text x={x+barW/2} y={y-4} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{d.value}</text>
              <text x={x+barW/2} y={h-pad+12} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{d.label.slice(0,5)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Karnataka District Coverage Grid ─────────────────────────────────────────
const DISTRICTS = [
  "Bagalkot","Ballari","Belagavi","Bengaluru R.","Bengaluru U.",
  "Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga",
  "Dakshina K.","Davanagere","Dharwad","Gadag","Hassan",
  "Haveri","Kalaburagi","Kodagu","Kolar","Koppal",
  "Mandya","Mysuru","Raichur","Ramanagara","Shivamogga",
  "Tumakuru","Udupi","Uttara K.","Vijayapura","Yadgir",
];
const COVERAGE_KEY = "amr_district_coverage";

function useCoverage() {
  const [coverage, setCoverage] = useState<Record<string,string>>({});
  useEffect(()=>{
    try{ const raw=localStorage.getItem(COVERAGE_KEY); if(raw) setCoverage(JSON.parse(raw)); }catch{}
  },[]);
  function toggle(d:string){
    const states = ["","partial","covered"];
    const idx = states.indexOf(coverage[d]??"");
    const next = states[(idx+1)%states.length];
    const updated = {...coverage,[d]:next};
    setCoverage(updated);
    localStorage.setItem(COVERAGE_KEY,JSON.stringify(updated));
  }
  return{coverage,toggle};
}

type DashTab = "overview"|"chart"|"map"|"safety"|"history";

function DashboardContent() {
  const [lang] = useLang();  // shared, saved preference; changed from the site header
  const [tab, setTab] = useState<DashTab>("overview");
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [tasks, setTasks] = useState<ReferralTask[]>([]);
  const [taskFilter, setTaskFilter] = useState<"open"|"all">("open");
  const [evaluation, setEvaluation] = useState<EvaluationReport|null>(null);
  const [loadError, setLoadError] = useState<string|null>(null);
  const {coverage,toggle} = useCoverage();

  // state is only set inside promise callbacks (react-hooks lint rule)
  function refresh(filter: "open"|"all" = taskFilter){
    return Promise.all([getDashboardSessions(),getReferralTasks(filter),getEvaluation()])
      .then(([s,t,e])=>{ setSessions(s); setTasks(t); setEvaluation(e); setLoadError(null); })
      .catch((e)=>setLoadError(e instanceof Error?e.message:"backend unreachable"));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ refresh(); },[]);

  function closeTask(id:string){ closeReferralTask(id).then(()=>refresh()).catch((e)=>setLoadError(String(e))); }
  function changeFilter(f:"open"|"all"){ setTaskFilter(f); refresh(f); }

  function fk(){ return lang==="kn"?"kn":""; }
  function L(kn:string,en:string,hi:string=""){ return lang==="kn"?kn:lang==="hi"?(hi||en):en; }

  const total = sessions.length;
  const completed = sessions.filter(s=>s.sessionCompleted).length;
  const safetyRoutedCount = sessions.filter(s=>s.safetyRouted).length;
  const planned = sessions.filter(s=>s.lessonPlanValid!==null).length;  // safety-held sessions have no plan
  const planValidCount = sessions.filter(s=>s.lessonPlanValid).length;
  const avgScore = completed ? Math.round(sessions.filter(s=>s.sessionCompleted).reduce((sum,s)=>sum+s.quizScore,0)/completed) : 0;
  const openTaskCount = sessions.reduce((n,s)=>n+s.openTasks,0);

  function pct(n:number,d:number){ return d===0?0:Math.round((n/d)*100); }

  // CSV export
  function exportCSV(){
    const headers = ["ID","Topic","Language","Date","Duration","Score","Correct","Total Q","Gaps","Safety","PlanValid","Completed","OpenTasks"];
    const rows = sessions.map(s=>[
      s.id,s.topic,s.lang,s.date,s.durationMin,s.quizScore,s.correctQ,s.totalQ,
      `"${s.gaps.join(";")}"`,s.safetyRouted,s.lessonPlanValid??"",s.sessionCompleted,s.openTasks
    ]);
    const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`amr-sessions-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Chart data
  const scoreByTopic = Object.entries(TOPIC_LABELS).map(([key,labels])=>{
    const inTopic = sessions.filter(s=>s.topic===key&&s.sessionCompleted);
    const avg = inTopic.length ? Math.round(inTopic.reduce((sum,s)=>sum+s.quizScore,0)/inTopic.length) : 0;
    return {label:labels.en,value:avg,color:"var(--green-600)"};
  });

  const scoreByDate = sessions.filter(s=>s.sessionCompleted)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .slice(-10)
    .map(s=>({label:s.date.slice(5),value:s.quizScore,color:s.quizScore>=80?"var(--green-600)":s.quizScore>=60?"var(--amber-500)":"var(--red-600)"}));

  const tabs: {id:DashTab;icon:string;label:Record<Lang,string>}[] = [
    {id:"overview",icon:"📊",label:{kn:"ಸಿಂಹಾವಲೋಕನ",en:"Overview",hi:"अवलोकन"}},
    {id:"chart",icon:"📈",label:{kn:"ಚಾರ್ಟ್",en:"Charts",hi:"चार्ट"}},
    {id:"map",icon:"🗺️",label:{kn:"ನಕ್ಷೆ",en:"Coverage Map",hi:"कवरेज मैप"}},
    {id:"safety",icon:"🛡️",label:{kn:"ಸಂರಕ್ಷಣೆ",en:"Safety Log",hi:"सुरक्षा लॉग"}},
    {id:"history",icon:"🗂️",label:{kn:"ಇತಿಹಾಸ",en:"History",hi:"इतिहास"}},
  ];

  return (
    <div className="portal portal-page">
      <SiteHeader />
      <PageBanner img="/img/step4.svg" title={L("ಮೇಲ್ವಿಚಾರಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್","Supervisor Dashboard","पर्यवेक्षक डैशबोर्ड")}
        sub={L("ಬ್ಯಾಕೆಂಡ್‌ನಿಂದ ನೇರ ಅಧಿವೇಶನಗಳು, ರೆಫರಲ್ ಕಾರ್ಯಗಳು ಮತ್ತು ಮೌಲ್ಯಮಾಪನ ಫಲಿತಾಂಶಗಳು.",
               "Live sessions, referral tasks and evaluation results from the backend.",
               "बैकएंड से लाइव सत्र, रेफरल कार्य और मूल्यांकन परिणाम।")}>
        <button id="export-sessions-btn" className="btn btn-outline" onClick={exportCSV}>📥 {L("CSV ಡೌನ್‌ಲೋಡ್","Download CSV","CSV डाउनलोड")}</button>
      </PageBanner>

      {/* Tab bar */}
      <div className="dash-tabs">
        <div className="dash-tabs-inner">
          {tabs.map(t=>(
            <button key={t.id} id={`tab-${t.id}`} onClick={()=>setTab(t.id)} className={`dash-tab ${tab===t.id?"on":""}`} aria-pressed={tab===t.id}>
              <span>{t.icon}</span>
              <span className={fk()}>{t.label[lang]}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="page-body">

        {/* Tab: Overview */}
        {tab==="overview"&&(
          <div>
            <h2 className={`card-title ${fk()}`}>{L("📊 ಪ್ರೋಟೋಟೈಪ್ ಮೌಲ್ಯಮಾಪನ","📊 Prototype Evaluation","📊 प्रोटोटाइप मूल्यांकन")}</h2>
            <p className={`text-sm text-muted mb-4 ${fk()}`}>{L("ಬ್ಯಾಕೆಂಡ್‌ನಿಂದ ನೇರ ಅಧಿವೇಶನಗಳು","Live sessions from the backend","बैकएंड से लाइव सत्र")}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:28}}>
              {[
                {label:{kn:"ಒಟ್ಟು ಅಧಿವೇಶನ",en:"Total Sessions",hi:"कुल सत्र"},value:`${total}`,sub:{kn:"ಅಧಿವೇಶನ",en:"sessions",hi:"सत्र"},icon:"🎯",color:"var(--primary)"},
                {label:{kn:"ಪೂರ್ಣ",en:"Completion",hi:"पूर्णता"},value:`${pct(completed,total)}%`,sub:{kn:`${completed}/${total}`,en:`${completed}/${total}`,hi:`${completed}/${total}`},icon:"✅",color:"var(--green-700)"},
                {label:{kn:"ಸುರಕ್ಷಾ ಮಾರ್ಗ",en:"Safety Routing",hi:"सुरक्षा मार्ग"},value:`${pct(safetyRoutedCount,total)}%`,sub:{kn:`${openTaskCount} ತೆರೆದ ರೆಫರಲ್`,en:`${openTaskCount} open referral(s)`,hi:`${openTaskCount} खुले रेफरल`},icon:"🛡️",color:"var(--sky-600)"},
                {label:{kn:"ಯೋಜನೆ ಮಾನ್ಯ",en:"Plan Valid",hi:"योजना मान्य"},value:`${pct(planValidCount,planned)}%`,sub:{kn:`${planValidCount}/${planned}`,en:`${planValidCount}/${planned}`,hi:`${planValidCount}/${planned}`},icon:"📋",color:"var(--amber-700)"},
                {label:{kn:"ಸರಾಸರಿ ಅಂಕ",en:"Avg Score",hi:"औसत स्कोर"},value:`${avgScore}%`,sub:{kn:"ಪೂರ್ಣ ಅಧಿವೇಶನ",en:"completed",hi:"पूर्ण"},icon:"🧠",color:"var(--green-700)"},
              ].map(k=>(
                <div key={k.label.en} className="card" style={{textAlign:"center",padding:"20px 14px"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:8}}>{k.icon}</div>
                  <div style={{fontSize:"1.8rem",fontWeight:700,color:k.color,lineHeight:1}}>{k.value}</div>
                  <div className={`text-sm font-medium mt-1 ${fk()}`} style={{color:k.color}}>{k.label[lang]}</div>
                  <div className={`text-xs text-muted mt-1 ${fk()}`}>{k.sub[lang]}</div>
                </div>
              ))}
            </div>

            {loadError&&(
              <div className="card mb-4" style={{background:"var(--red-100)",borderColor:"var(--red-600)",fontSize:"0.85rem"}}>
                ⚠️ {L("ಬ್ಯಾಕೆಂಡ್ ತಲುಪಲಾಗಲಿಲ್ಲ","Could not reach the backend","बैकएंड तक नहीं पहुंच सके")}: {loadError}
              </div>
            )}

            {/* Evaluation report from `python -m eval.run_eval` (proposal section 6) */}
            <div id="evaluation-card" className="card mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className={`font-bold text-sm text-primary ${fk()}`}>🧪 {L("ಮೌಲ್ಯಮಾಪನ ಫಲಿತಾಂಶ","Evaluation run","मूल्यांकन परिणाम")}</h3>
                {evaluation&&<span className="text-xs text-muted">{new Date(evaluation.generatedAt).toLocaleString("en-IN")} · {evaluation.mode}{evaluation.model?` · ${evaluation.model}`:""}</span>}
              </div>
              {evaluation?(
                <div>
                  {([
                    ["Test pass rate",evaluation.metrics.testPassRate],
                    ["Medical questions routed correctly",evaluation.metrics.safetyRoutingAccuracy],
                    ["Safe questions wrongly blocked",evaluation.metrics.safetyFalsePositives],
                    ["AI lesson plans passing validation",evaluation.metrics.aiPlansPassingValidation],
                    ["Full sessions completed",evaluation.metrics.fullSessionsCompleted],
                  ] as [string,Metric][]).map(([label,m])=>(
                    <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:"0.85rem"}}>
                      <span className="text-muted">{label}</span>
                      <strong>{m.percent===null?"not measured (mock mode)":`${m.percent}% (${m.numerator}/${m.denominator})`}</strong>
                    </div>
                  ))}
                  <div className="text-xs text-muted mt-2">{evaluation.scenarios.filter(x=>!x.passed).length===0
                    ? `${evaluation.scenarios.length} scenarios, all passed`
                    : `Failed: ${evaluation.scenarios.filter(x=>!x.passed).map(x=>x.id).join(", ")}`}</div>
                </div>
              ):(
                <p className="text-sm text-muted">{L("ಇನ್ನೂ ನಡೆಸಿಲ್ಲ","Not run yet.","अभी तक नहीं चलाया गया।")} <code>cd backend && python -m eval.run_eval</code></p>
              )}
            </div>
          </div>
        )}

        {/* Tab: Charts */}
        {tab==="chart"&&(
          <div>
            <h2 className={`text-lg font-bold text-primary mb-4 ${fk()}`}>{L("📈 ಅಂಕ ಚಾರ್ಟ್","📈 Score Charts","📈 स्कोर चार्ट")}</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <div className="card">
                <BarChart data={scoreByTopic} label={L("ವಿಷಯದ ಪ್ರಕಾರ ಸರಾಸರಿ ಅಂಕ (%)","Avg score by topic (%)","विषय के अनुसार औसत स्कोर (%)")}/>
              </div>
              <div className="card">
                <BarChart data={scoreByDate} label={L("ಕೊನೆಯ 10 ಅಧಿವೇಶನ ಅಂಕ","Last 10 session scores","अंतिम 10 सत्र स्कोर")}/>
              </div>
            </div>

            {/* Score distribution */}
            <div className="card mt-4">
              <div className={`font-bold text-sm mb-3 text-primary ${fk()}`}>{L("ಅಂಕ ವಿತರಣೆ","Score Distribution","स्कोर वितरण")}</div>
              <div className="flex gap-2" style={{alignItems:"flex-end",height:80}}>
                {[
                  {range:"0–33",count:sessions.filter(s=>s.quizScore<=33&&s.sessionCompleted).length,color:"var(--red-600)"},
                  {range:"34–66",count:sessions.filter(s=>s.quizScore>33&&s.quizScore<=66&&s.sessionCompleted).length,color:"var(--amber-500)"},
                  {range:"67–79",count:sessions.filter(s=>s.quizScore>66&&s.quizScore<80&&s.sessionCompleted).length,color:"var(--green-600)"},
                  {range:"80–100",count:sessions.filter(s=>s.quizScore>=80&&s.sessionCompleted).length,color:"var(--green-800)"},
                ].map(b=>{
                  const maxH = 60;
                  const maxCount = Math.max(sessions.filter(s=>s.sessionCompleted).length,1);
                  return(
                    <div key={b.range} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{width:"100%",height:Math.max(4,(b.count/maxCount)*maxH),background:b.color,borderRadius:"4px 4px 0 0",transition:"height 0.5s"}}/>
                      <div style={{fontSize:"0.7rem",color:"var(--text-muted)",fontWeight:600}}>{b.range}%</div>
                      <div style={{fontSize:"0.75rem",fontWeight:700,color:b.color}}>{b.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Language breakdown */}
            <div className="card mt-4">
              <div className={`font-bold text-sm mb-3 text-primary ${fk()}`}>{L("ಭಾಷೆ ಅನ್ವಯ","By Language","भाषा के अनुसार")}</div>
              <div className="flex gap-3" style={{flexWrap:"wrap"}}>
                {([["kn","ಕನ್ನಡ","#2d6a4f"],["en","English","#0077b6"],["hi","हिंदी","#bc6c25"]] as const).map(([l,label,color])=>{
                  const count = sessions.filter(s=>s.lang===l).length;
                  return(
                    <div key={l} style={{flex:1,minWidth:80,background:`${color}15`,border:`1.5px solid ${color}`,borderRadius:10,padding:"12px 10px",textAlign:"center"}}>
                      <div style={{fontSize:"1.4rem",fontWeight:700,color}}>{count}</div>
                      <div style={{fontSize:"0.75rem",color,fontWeight:600}}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Coverage Map */}
        {tab==="map"&&(
          <div>
            <h2 className={`text-lg font-bold text-primary mb-2 ${fk()}`}>{L("🗺️ ಜಿಲ್ಲೆ ವ್ಯಾಪ್ತಿ","🗺️ District Coverage","🗺️ जिला कवरेज")}</h2>
            <p className={`text-sm text-muted mb-4 ${fk()}`}>{L("ಜಿಲ್ಲೆ ಕ್ಲಿಕ್ ಮಾಡಿ: ಖಾಲಿ → ಭಾಗ → ಪೂರ್ಣ","Click district to cycle: uncovered → partial → covered","जिले पर क्लिक करें: अनकवर → आंशिक → पूर्ण")}</p>

            {/* Legend */}
            <div className="flex gap-3 mb-4" style={{flexWrap:"wrap"}}>
              {[["","⬜","Uncovered","ಆವರಿಸಿಲ್ಲ","कवर नहीं"],["partial","🟨","Partial","ಭಾಗ","आंशिक"],["covered","🟩","Covered","ಪೂರ್ಣ","पूर्ण"]].map(([val,icon,en,kn,hi])=>(
                <div key={val} className="flex items-center gap-1" style={{fontSize:"0.78rem",fontWeight:600,color:"var(--text-muted)"}}>
                  <span>{icon}</span><span>{lang==="kn"?kn:lang==="hi"?hi:en}</span>
                </div>
              ))}
              <div className="ml-auto text-xs text-muted">
                {L("ಪೂರ್ಣ","Covered","पूर्ण")}: {Object.values(coverage).filter(v=>v==="covered").length}/30
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
              {DISTRICTS.map(d=>{
                const state = coverage[d]??"";
                const bg = state==="covered"?"var(--green-600)":state==="partial"?"var(--amber-500)":"var(--border)";
                const textColor = state?"white":"var(--text-muted)";
                return(
                  <button key={d} onClick={()=>toggle(d)}
                    style={{background:bg,color:textColor,border:"2px solid transparent",borderRadius:8,padding:"8px 4px",fontSize:"0.62rem",fontWeight:600,cursor:"pointer",transition:"var(--transition)",lineHeight:1.2,textAlign:"center"}}>
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Coverage stats */}
            <div className="stat-grid mt-4">
              <div className="stat-card">
                <div className="stat-val" style={{color:"var(--green-700)"}}>{Object.values(coverage).filter(v=>v==="covered").length}</div>
                <div className={`stat-label ${fk()}`}>{L("ಪೂರ್ಣ ಆವರಿಸಿದ","Fully Covered","पूरी तरह कवर")}</div>
              </div>
              <div className="stat-card">
                <div className="stat-val" style={{color:"var(--amber-700)"}}>{Object.values(coverage).filter(v=>v==="partial").length}</div>
                <div className={`stat-label ${fk()}`}>{L("ಭಾಗ ಆವರಿಸಿದ","Partially Covered","आंशिक रूप से")}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Safety Log (referral tasks recorded by the backend safety controller) */}
        {tab==="safety"&&(
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-bold text-primary ${fk()}`}>{L("🛡️ ರೆಫರಲ್ ಕಾರ್ಯಗಳು","🛡️ Referral Tasks","🛡️ रेफरल कार्य")}</h2>
              <div className="flex gap-2">
                {(["open","all"] as const).map(f=><button key={f} id={`task-filter-${f}`} className={`btn btn-sm ${taskFilter===f?"btn-primary":"btn-outline"}`} onClick={()=>changeFilter(f)}>{f==="open"?L("ತೆರೆದ","Open","खुले"):L("ಎಲ್ಲಾ","All","सभी")}</button>)}
              </div>
            </div>

            {/* Category summary */}
            <div className="flex gap-3 mb-4" style={{flexWrap:"wrap"}}>
              {(["URGENT","DOSAGE","SELF_MEDICATION","PERSONAL_MEDICAL"] as const).map(cat=>{
                const count = tasks.filter(e=>e.category===cat).length;
                return(
                  <div key={cat} style={{flex:1,minWidth:100,background:cat==="URGENT"?"var(--red-100)":"var(--neutral-100)",border:`1.5px solid ${cat==="URGENT"?"var(--red-600)":"var(--border)"}`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                    <div style={{fontSize:"1.4rem",fontWeight:700,color:cat==="URGENT"?"var(--red-600)":"var(--text)"}}>{count}</div>
                    <div style={{fontSize:"0.7rem",fontWeight:600,color:"var(--text-muted)",marginTop:2}}>{cat}</div>
                  </div>
                );
              })}
            </div>

            {tasks.length===0?(
              <div className="card text-center" style={{padding:"40px 20px"}}>
                <div style={{fontSize:"2rem",marginBottom:8}}>🛡️</div>
                <p className={`text-muted ${fk()}`}>{taskFilter==="open"?L("ತೆರೆದ ರೆಫರಲ್ ಕಾರ್ಯಗಳಿಲ್ಲ","No open referral tasks","कोई खुला रेफरल कार्य नहीं"):L("ಯಾವ ರೆಫರಲ್ ದಾಖಲಾಗಿಲ್ಲ","No referral tasks recorded yet","अभी तक कोई रेफरल दर्ज नहीं")}</p>
                <p className="text-xs text-muted mt-2">{L("ಅಧಿವೇಶನ ಸಮಯ ವೈದ್ಯಕೀಯ ಪ್ರಶ್ನೆ ಬಂದರೆ ಇಲ್ಲಿ ದಾಖಲಾಗುತ್ತದೆ","Medical questions caught during sessions appear here","सत्र के दौरान पकड़े गए चिकित्सा प्रश्न यहाँ दिखेंगे")}</p>
              </div>
            ):(
              <div>
                {tasks.map(e=>(
                  <div key={e.id} className="referral-task" style={{background:"var(--surface)",border:`1px solid ${e.category==="URGENT"?"var(--red-600)":"var(--border)"}`,borderRadius:10,padding:"12px 16px",marginBottom:10,opacity:e.status==="closed"?0.6:1}}>
                    <div className="flex justify-between items-start">
                      <span className={`badge ${e.category==="URGENT"?"badge-red":e.category==="PERSONAL_MEDICAL"?"badge-sky":"badge-amber"}`}>{e.category}</span>
                      <span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>{new Date(e.createdAt).toLocaleString("en-IN")}</span>
                    </div>
                    <div style={{fontSize:"0.88rem",marginTop:8}}>{e.action}</div>
                    <div style={{fontSize:"0.72rem",color:"var(--text-muted)",marginTop:4}}>
                      {TOPIC_LABELS[e.topic]?.[lang]??e.topic} · {e.lang.toUpperCase()} · {L("ನಿಯಮ","Rule","नियम")} {e.ruleId}{e.simulated?` · ${L("ಅನುಕರಣೆ","simulated","सिम्युलेटेड")}`:""}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>{e.sessionId}</span>
                      {e.status==="open"
                        ? <button className="btn btn-outline btn-sm" onClick={()=>closeTask(e.id)}>✓ {L("ಮುಗಿದಿದೆ","Mark done","पूर्ण करें")}</button>
                        : <span className="badge badge-green">✓ {L("ಮುಗಿದಿದೆ","Closed","बंद")}{e.closedAt?` ${new Date(e.closedAt).toLocaleDateString("en-IN")}`:""}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: History */}
        {tab==="history"&&(
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-bold text-primary ${fk()}`}>{L("🗂️ ಅಧಿವೇಶನ ಇತಿಹಾಸ","🗂️ Session History","🗂️ सत्र इतिहास")}</h2>
              <button className="btn btn-outline btn-sm" onClick={exportCSV}>📥 CSV</button>
            </div>
            {sessions.map(s=>(
              <div key={s.id} className="session-history-item">
                <div className="shi-icon">{s.sessionCompleted?"✅":s.state==="SAFETY_HOLD"?"🛡️":"⏳"}</div>
                <div className="shi-info">
                  <div className={`shi-title ${s.lang==="kn"?"kn":""}`}>
                    {TOPIC_LABELS[s.topic]?.[lang]??s.topic}
                    {s.safetyRouted&&<span className="badge badge-red" style={{marginLeft:8,fontSize:"0.68rem"}}>🛡️ {L("ಸುರಕ್ಷಾ","Safety","सुरक्षा")}</span>}
                  </div>
                  <div className="shi-meta">{s.date} · {s.durationMin} min · {s.lang.toUpperCase()} · {L("ಅಂಕ","Score","स्कोर")}: {s.quizScore}%
                    {s.gaps.length>0&&<span style={{marginLeft:6,color:"var(--amber-700)"}}>⚠️ {s.gaps.length} gap(s)</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:"0.9rem",fontWeight:700,color:s.quizScore>=80?"var(--green-700)":s.quizScore>=60?"var(--amber-700)":"var(--red-600)"}}>{s.quizScore}%</div>
                  <div style={{fontSize:"0.7rem",color:"var(--text-muted)"}}>{s.lessonPlanValid===null?"no plan":s.lessonPlanValid?"✓ plan":"✗ plan"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function DashboardPage(){
  return(
    <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>Loading…</div>}>
      <DashboardContent/>
    </Suspense>
  );
}
