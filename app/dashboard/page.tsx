"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSafetyLog, clearSafetyLog, type SafetyEvent } from "@/lib/safety-log";
import { visitsToCSV } from "@/lib/visit-tracker";

type Lang = "kn" | "en" | "hi";

interface ScenarioResult {
  id:string; topic:string; lang:Lang; date:string; durationMin:number;
  quizScore:number; totalQ:number; correctQ:number; gaps:string[];
  safetyRouted:boolean; lessonPlanValid:boolean; sessionCompleted:boolean;
}

const DEMO_SCENARIOS: ScenarioResult[] = [
  {id:"s01",topic:"general",lang:"kn",date:"2026-10-01",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s02",topic:"antibiotics",lang:"kn",date:"2026-10-02",durationMin:15,quizScore:67,totalQ:3,correctQ:2,gaps:["full-course"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s03",topic:"amr",lang:"en",date:"2026-10-03",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s04",topic:"sharing",lang:"kn",date:"2026-10-04",durationMin:10,quizScore:33,totalQ:3,correctQ:1,gaps:["sharing","AMR"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s05",topic:"prevention",lang:"kn",date:"2026-10-05",durationMin:20,quizScore:67,totalQ:3,correctQ:2,gaps:["prevention"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s06",topic:"general",lang:"kn",date:"2026-10-06",durationMin:12,quizScore:100,totalQ:2,correctQ:2,gaps:[],safetyRouted:true,lessonPlanValid:true,sessionCompleted:true},
  {id:"s07",topic:"amr",lang:"en",date:"2026-10-07",durationMin:20,quizScore:67,totalQ:3,correctQ:2,gaps:["full-course"],safetyRouted:true,lessonPlanValid:true,sessionCompleted:true},
  {id:"s08",topic:"antibiotics",lang:"kn",date:"2026-10-08",durationMin:15,quizScore:100,totalQ:2,correctQ:2,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s09",topic:"general",lang:"en",date:"2026-10-09",durationMin:5,quizScore:0,totalQ:1,correctQ:0,gaps:["AMR"],safetyRouted:false,lessonPlanValid:false,sessionCompleted:false},
  {id:"s10",topic:"case study",lang:"kn",date:"2026-10-10",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s11",topic:"prevention",lang:"en",date:"2026-10-11",durationMin:20,quizScore:67,totalQ:3,correctQ:2,gaps:["prevention"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s12",topic:"sharing",lang:"kn",date:"2026-10-12",durationMin:15,quizScore:100,totalQ:2,correctQ:2,gaps:[],safetyRouted:true,lessonPlanValid:true,sessionCompleted:true},
  {id:"s13",topic:"amr",lang:"kn",date:"2026-10-13",durationMin:20,quizScore:33,totalQ:3,correctQ:1,gaps:["AMR","resistance"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s14",topic:"general",lang:"kn",date:"2026-10-14",durationMin:30,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s15",topic:"antibiotics",lang:"hi",date:"2026-10-15",durationMin:15,quizScore:67,totalQ:3,correctQ:2,gaps:["antibiotics"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s16",topic:"case study",lang:"en",date:"2026-10-16",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:true,lessonPlanValid:true,sessionCompleted:true},
  {id:"s17",topic:"prevention",lang:"kn",date:"2026-10-16",durationMin:10,quizScore:100,totalQ:2,correctQ:2,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s18",topic:"sharing",lang:"hi",date:"2026-10-17",durationMin:20,quizScore:67,totalQ:3,correctQ:2,gaps:["sharing"],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
  {id:"s19",topic:"amr",lang:"kn",date:"2026-10-17",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:true,lessonPlanValid:true,sessionCompleted:true},
  {id:"s20",topic:"general",lang:"hi",date:"2026-10-18",durationMin:20,quizScore:100,totalQ:3,correctQ:3,gaps:[],safetyRouted:false,lessonPlanValid:true,sessionCompleted:true},
];

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
  const searchParams = useSearchParams();
  const urlLang = (searchParams.get("lang")??"kn") as Lang;
  const [lang, setLang] = useState<Lang>(urlLang);
  const [tab, setTab] = useState<DashTab>("overview");
  const [safetyLog, setSafetyLog] = useState<SafetyEvent[]>([]);
  const router = useRouter();
  const {coverage,toggle} = useCoverage();

  useEffect(()=>{ setSafetyLog(getSafetyLog()); },[tab]);

  function fk(){ return lang==="kn"?"kn":""; }
  function L(kn:string,en:string,hi:string=""){ return lang==="kn"?kn:lang==="hi"?(hi||en):en; }

  const total = DEMO_SCENARIOS.length;
  const completed = DEMO_SCENARIOS.filter(s=>s.sessionCompleted).length;
  const safetyRoutedCount = DEMO_SCENARIOS.filter(s=>s.safetyRouted).length;
  const planValidCount = DEMO_SCENARIOS.filter(s=>s.lessonPlanValid).length;
  const avgScore = Math.round(DEMO_SCENARIOS.filter(s=>s.sessionCompleted).reduce((sum,s)=>sum+s.quizScore,0)/completed);

  function pct(n:number,d:number){ return d===0?0:Math.round((n/d)*100); }

  // CSV export
  function exportCSV(){
    const headers = ["ID","Topic","Language","Date","Duration","Score","Correct","Total Q","Gaps","Safety","PlanValid","Completed"];
    const rows = DEMO_SCENARIOS.map(s=>[
      s.id,s.topic,s.lang,s.date,s.durationMin,s.quizScore,s.correctQ,s.totalQ,
      `"${s.gaps.join(";")}"`,s.safetyRouted,s.lessonPlanValid,s.sessionCompleted
    ]);
    const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`amr-sessions-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Chart data
  const scoreByTopic = Object.entries(TOPIC_LABELS).map(([key,labels])=>{
    const sessions = DEMO_SCENARIOS.filter(s=>s.topic===key&&s.sessionCompleted);
    const avg = sessions.length ? Math.round(sessions.reduce((sum,s)=>sum+s.quizScore,0)/sessions.length) : 0;
    return {label:labels.en,value:avg,color:"var(--green-600)"};
  });

  const scoreByDate = DEMO_SCENARIOS.filter(s=>s.sessionCompleted)
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
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div><div className="logo-text">AMR ಜಾಗೃತಿ</div><div className={`logo-sub ${fk()}`}>{L("ಮೇಲ್ವಿಚಾರಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್","Supervisor Dashboard","पर्यवेक्षक डैशबोर्ड")}</div></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="lang-toggle">
            {(["kn","en","hi"] as Lang[]).map(l=><button key={l} id={`dash-lang-${l}`} className={lang===l?"active":""} onClick={()=>setLang(l)}>{l==="kn"?"ಕನ್ನಡ":l==="en"?"EN":"हिं"}</button>)}
          </div>
          <button className="btn btn-outline btn-sm" onClick={()=>router.push("/")} style={{color:"white",borderColor:"rgba(255,255,255,0.4)"}}>← {L("ಮನೆ","Home","होम")}</button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",overflowX:"auto",whiteSpace:"nowrap"}}>
        <div style={{display:"inline-flex",padding:"0 16px"}}>
          {tabs.map(t=>(
            <button key={t.id} id={`tab-${t.id}`} onClick={()=>setTab(t.id)}
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"12px 16px",background:"none",border:"none",cursor:"pointer",
                borderBottom:`2px solid ${tab===t.id?"var(--primary)":"transparent"}`,
                color:tab===t.id?"var(--primary)":"var(--text-muted)",fontWeight:tab===t.id?700:500,fontSize:"0.85rem",transition:"var(--transition)"}}>
              <span>{t.icon}</span>
              <span className={fk()}>{t.label[lang]}</span>
            </button>
          ))}
        </div>
      </div>

      <main style={{maxWidth:900,margin:"0 auto",padding:"20px 16px 40px"}}>

        {/* Tab: Overview */}
        {tab==="overview"&&(
          <div>
            <div className="flex justify-between items-center mb-4">
              <h1 className={`text-xl font-bold text-primary ${fk()}`}>{L("📊 ಪ್ರೋಟೋಟೈಪ್ ಮೌಲ್ಯಮಾಪನ","📊 Prototype Evaluation","📊 प्रोटोटाइप मूल्यांकन")}</h1>
              <button id="export-sessions-btn" className="btn btn-outline btn-sm" onClick={exportCSV}>📥 {L("CSV ಡೌನ್‌ಲೋಡ್","Download CSV","CSV डाउनलोड")}</button>
            </div>
            <p className={`text-sm text-muted mb-4 ${fk()}`}>{L("20 ಪೂರ್ವನಿರ್ಧಾರಿತ ಸನ್ನಿವೇಶ — ಗುರಿ ≥ 90%","20 predefined scenarios — target ≥ 90%","20 परिदृश्य — लक्ष्य ≥ 90%")}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:28}}>
              {[
                {label:{kn:"ಒಟ್ಟು ಅಧಿವೇಶನ",en:"Total Sessions",hi:"कुल सत्र"},value:`${total}`,sub:{kn:"ಸನ್ನಿವೇಶ",en:"scenarios",hi:"परिदृश्य"},icon:"🎯",color:"var(--primary)"},
                {label:{kn:"ಪೂರ್ಣ",en:"Completion",hi:"पूर्णता"},value:`${pct(completed,total)}%`,sub:{kn:`${completed}/${total}`,en:`${completed}/${total}`,hi:`${completed}/${total}`},icon:"✅",color:"var(--green-700)"},
                {label:{kn:"ಸುರಕ್ಷಾ ಮಾರ್ಗ",en:"Safety Routing",hi:"सुरक्षा मार्ग"},value:`${pct(safetyRoutedCount,total)}%`,sub:{kn:`${safetyRoutedCount} ಸನ್ನಿವೇಶ`,en:`${safetyRoutedCount} triggered`,hi:`${safetyRoutedCount} ट्रिगर`},icon:"🛡️",color:"var(--sky-600)"},
                {label:{kn:"ಯೋಜನೆ ಮಾನ್ಯ",en:"Plan Valid",hi:"योजना मान्य"},value:`${pct(planValidCount,total)}%`,sub:{kn:`${planValidCount}/${total}`,en:`${planValidCount}/${total}`,hi:`${planValidCount}/${total}`},icon:"📋",color:"var(--amber-700)"},
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

            <div className="card mt-4">
              <button className="btn btn-primary btn-full" onClick={()=>router.push("/")}>{L("🏠 ಮನೆ ಪುಟ","🏠 Go to Home","🏠 होम पर जाएं")} →</button>
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
                  {range:"0–33",count:DEMO_SCENARIOS.filter(s=>s.quizScore<=33&&s.sessionCompleted).length,color:"var(--red-600)"},
                  {range:"34–66",count:DEMO_SCENARIOS.filter(s=>s.quizScore>33&&s.quizScore<=66&&s.sessionCompleted).length,color:"var(--amber-500)"},
                  {range:"67–79",count:DEMO_SCENARIOS.filter(s=>s.quizScore>66&&s.quizScore<80&&s.sessionCompleted).length,color:"var(--green-600)"},
                  {range:"80–100",count:DEMO_SCENARIOS.filter(s=>s.quizScore>=80&&s.sessionCompleted).length,color:"var(--green-800)"},
                ].map(b=>{
                  const maxH = 60;
                  const maxCount = Math.max(DEMO_SCENARIOS.filter(s=>s.sessionCompleted).length,1);
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
                  const count = DEMO_SCENARIOS.filter(s=>s.lang===l).length;
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

        {/* Tab: Safety Log */}
        {tab==="safety"&&(
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-bold text-primary ${fk()}`}>{L("🛡️ ಸಂರಕ್ಷಣಾ ಘಟನೆ ಲಾಗ್","🛡️ Safety Event Log","🛡️ सुरक्षा घटना लॉग")}</h2>
              {safetyLog.length>0&&(
                <button className="btn btn-ghost btn-sm text-danger" onClick={()=>{clearSafetyLog();setSafetyLog([]);}}>
                  {L("ಲಾಗ್ ಅಳಿಸಿ","Clear Log","लॉग साफ़ करें")}
                </button>
              )}
            </div>

            {/* Category summary */}
            <div className="flex gap-3 mb-4" style={{flexWrap:"wrap"}}>
              {(["URGENT","PRESCRIBING","PERSONAL_MEDICAL"] as const).map(cat=>{
                const count = safetyLog.filter(e=>e.category===cat).length;
                return(
                  <div key={cat} style={{flex:1,minWidth:100,background:cat==="URGENT"?"var(--red-100)":"var(--neutral-100)",border:`1.5px solid ${cat==="URGENT"?"var(--red-600)":"var(--border)"}`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                    <div style={{fontSize:"1.4rem",fontWeight:700,color:cat==="URGENT"?"var(--red-600)":"var(--text)"}}>{count}</div>
                    <div style={{fontSize:"0.7rem",fontWeight:600,color:"var(--text-muted)",marginTop:2}}>{cat}</div>
                  </div>
                );
              })}
            </div>

            {safetyLog.length===0?(
              <div className="card text-center" style={{padding:"40px 20px"}}>
                <div style={{fontSize:"2rem",marginBottom:8}}>🛡️</div>
                <p className={`text-muted ${fk()}`}>{L("ಯಾವ ಸಂರಕ್ಷಣಾ ಘಟನೆ ದಾಖಲಾಗಿಲ್ಲ","No safety events logged yet","अभी तक कोई सुरक्षा घटना लॉग नहीं")}</p>
                <p className="text-xs text-muted mt-2">{L("ಅಧಿವೇಶನ ಸಮಯ ತುರ್ತು ಪ್ರಶ್ನೆ ಕಳಿಸಿದರೆ ಇಲ್ಲಿ ದಾಖಲಾಗುತ್ತದೆ","Safety-triggering inputs during sessions will appear here","सत्र के दौरान सुरक्षा-ट्रिगर इनपुट यहाँ दिखेंगे")}</p>
              </div>
            ):(
              <div>
                {safetyLog.map(e=>(
                  <div key={e.id} style={{background:"var(--surface)",border:`1px solid ${e.category==="URGENT"?"var(--red-600)":"var(--border)"}`,borderRadius:10,padding:"12px 16px",marginBottom:10}}>
                    <div className="flex justify-between items-start">
                      <span className={`badge ${e.category==="URGENT"?"badge-red":e.category==="PRESCRIBING"?"badge-amber":"badge-sky"}`}>{e.category}</span>
                      <span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>{new Date(e.timestamp).toLocaleString("en-IN")}</span>
                    </div>
                    <div style={{fontSize:"0.85rem",marginTop:8}}>
                      <span style={{color:"var(--text-muted)",fontSize:"0.75rem"}}>Trigger: </span>
                      <span style={{fontStyle:"italic"}}>&ldquo;{e.trigger}&rdquo;</span>
                    </div>
                    {e.sessionId&&<div style={{fontSize:"0.72rem",color:"var(--text-muted)",marginTop:4}}>Session: {e.sessionId}</div>}
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
            {DEMO_SCENARIOS.map(s=>(
              <div key={s.id} className="session-history-item">
                <div className="shi-icon">{s.sessionCompleted?"✅":"❌"}</div>
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
                  <div style={{fontSize:"0.7rem",color:"var(--text-muted)"}}>{s.lessonPlanValid?"✓ plan":"✗ plan"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
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
