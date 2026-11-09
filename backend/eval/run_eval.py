# Evaluation runner for the proposal's predefined scenarios and metrics.
# Usage, from backend/:  python -m eval.run_eval            (writes eval/report.json and eval/report.md)
#                        python -m eval.run_eval --no-write (print only)
# Runs in mock mode without provider credentials; with credentials the planning agent calls the
# configured model provider, which is what the "AI lesson plans that pass validation" metric measures.

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent


class Check(Exception):
    pass


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise Check(msg)


def run() -> Dict[str, Any]:
    # imports are deferred so cli() can point DATABASE_URL at a temp file first
    from fastapi.testclient import TestClient

    import db
    import config
    import main as backend_main
    from agents import planning_agent, safety_controller
    from agents.content import repo
    from schemas import AgentNote, LessonModule, LessonPlan
    from services import bedrock

    client = TestClient(backend_main.app)
    scenarios = json.loads((HERE / "scenarios.json").read_text(encoding="utf-8"))["scenarios"]
    plan_events: List[Tuple[str, str, List[str]]] = []  # (scenario id, planSource, notes) for real planner runs

    def post(path: str, body: Dict[str, Any], status: int = 200) -> Dict[str, Any]:
        r = client.post(path, json=body)
        expect(r.status_code == status, f"POST {path} returned {r.status_code}: {r.text[:200]}")
        return r.json()

    def start(topic="antibiotics", duration=10, lang="en", gaps=None) -> Dict[str, Any]:
        return post("/session/start", {"topic": topic, "durationMinutes": duration, "lang": lang, "priorGaps": gaps or []})

    def plan_note(sid: str) -> Tuple[str, List[str]]:
        rec = client.get(f"/session/{sid}").json()
        h = next(h for h in rec["log"] if h["action"] == "plan_for_review")
        return h["data"]["planSource"], h["data"].get("notes") or []

    def answer(sid: str, qid: str, correct: bool) -> Dict[str, Any]:
        q = repo().quiz_by_id[qid]
        idx = q["correctIndex"] if correct else (q["correctIndex"] + 1) % len(q["options"])
        return post("/session/step", {"sessionId": sid, "action": "answer",
                                      "answers": [{"questionId": qid, "selectedIndex": idx}]})

    # ── scenario types ──

    def session(sc: Dict[str, Any]) -> str:
        out = start(sc["topic"], sc["duration"], sc["lang"], sc["priorGaps"])
        sid, plan = out["sessionId"], out["plan"]
        expect(out["state"] == "AWAITING_APPROVAL" and plan, "no plan for ASHA review")
        source, notes = plan_note(sid)
        plan_events.append((sc["id"], source, notes))
        ok_plan, errors = planning_agent.validate_plan(LessonPlan.model_validate(plan), sc["duration"])
        expect(ok_plan is not None, f"final plan invalid: {errors}")
        plan_tags = {t for m in plan["lessonPlan"] for c in m["contentIds"] for t in repo().block_by_id[c]["conceptTags"]}
        for tag in sc.get("expectPlanTags", []):
            expect(tag in plan_tags, f"prior gap {tag} not in plan")

        approved = post("/session/step", {"sessionId": sid, "action": "approve"})
        expect(approved["content"]["contentIds"], "no lesson content")
        expect(all(h["verified"] for h in approved["content"]["hits"]), "unverified content served")
        qids = [q["id"] for q in approved["questions"]]
        pattern = {"all_correct": [True] * 3, "all_wrong": [False] * 3, "mixed": [True, True, False]}[sc["answers"]]
        expect(len(qids) >= len(pattern), "checkpoint quiz too short")
        level = None
        for qid, ok in zip(qids, pattern):
            level = answer(sid, qid, ok)["tutor"]["nextActivity"]["level"]
        expect(level == sc["expectLevel"], f"level {level}, expected {sc['expectLevel']}")

        summary = post("/session/complete", {"sessionId": sid})["summary"]
        gaps = {g["conceptTag"] for g in summary["remainingGaps"]}
        for g in sc.get("expectGaps", []):
            expect(g in gaps, f"gap {g} missing from summary")
        if sc["answers"] == "all_correct":
            expect(not (gaps - set(sc["priorGaps"])), f"unexpected gaps {gaps}")
        return f"plan {source}, level {level}, {len(summary['covered'])} module(s) covered"

    def safety(sc: Dict[str, Any]) -> str:
        sid = start()["sessionId"]
        post("/session/step", {"sessionId": sid, "action": "approve"})
        out = post("/session/step", {"sessionId": sid, "action": "ask", "text": sc["text"]})
        got = out["safety"]["category"] if out["safety"] else "SAFE"
        sc["_got"] = got
        expect(got == sc["expect"], f"routed to {got}, expected {sc['expect']}")
        tasks = client.get(f"/session/{sid}").json()["escalations"]
        if got == "SAFE":
            expect(not tasks, "safe question created a referral task")
            expect(out["content"] and out["content"]["contentIds"], "no library content for a safe question")
        else:
            expect(out["content"] is None, "agent content shown despite safety override")
            expect(out["safety"]["message"] == safety_controller.MESSAGES[got], "message is not the fixed text")
            expect(len(tasks) == 1 and sc["text"] not in json.dumps(tasks, ensure_ascii=False), "referral task missing or stores raw text")
        return f"routed to {got}"

    def invalid_ai(sc: Dict[str, Any]) -> str:
        r = repo()
        bad_plans = {
            "unknown_content": [("m1", ["c999"])],
            "over_time": [("m7", ["c013", "c014"])],
            "wrong_module": [("m1", ["c003"])],
            "none": [("m1", ["c001"])],
        }

        async def fake(*_a, **_k):
            if sc["fault"] == "bedrock_error":
                raise bedrock.BedrockError("simulated failure")
            mods = [LessonModule(moduleId=m, contentIds=c, estimatedMinutes=1) for m, c in bad_plans[sc["fault"]]]
            return LessonPlan(lessonPlan=mods, agentNote=AgentNote(kn="x", en="x"))

        saved = (bedrock.is_mock_mode, bedrock.generate_structured)
        bedrock.is_mock_mode, bedrock.generate_structured = (lambda: False), fake
        try:
            out = start("case study" if sc["fault"] == "over_time" else "antibiotics", 5, "en")
        finally:
            bedrock.is_mock_mode, bedrock.generate_structured = saved
        source, notes = plan_note(out["sessionId"])
        ok_plan, errors = planning_agent.validate_plan(LessonPlan.model_validate(out["plan"]), 5)
        expect(ok_plan is not None, f"served plan invalid: {errors}")
        if sc["fault"] == "none":
            expect(source == "llm", "valid model plan was not used")
            mins = out["plan"]["lessonPlan"][0]["estimatedMinutes"]
            expect(mins == r.block_by_id["c001"]["estimatedMinutes"], "minutes not recomputed from the repository")
            return "model plan accepted"
        expect(source == "rules", "invalid model output was served")
        prefix = "llm_error" if sc["fault"] == "bedrock_error" else "llm_plan_rejected"
        expect(any(n.startswith(prefix) for n in notes), f"rejection not logged ({notes})")
        return "fell back to rule-based plan, reason logged"

    def persistence(sc: Dict[str, Any]) -> str:
        if sc["check"] == "restart":
            sid = start()["sessionId"]
            qid = post("/session/step", {"sessionId": sid, "action": "approve"})["questions"][0]["id"]
            answer(sid, qid, False)
            before = client.get(f"/session/{sid}").json()
            db.reset_engine()
            after = client.get(f"/session/{sid}").json()
            expect(after == before, "record changed after restart")
            return f"{len(after['log'])} log entries and {len(after['answers'])} answer restored"
        if sc["check"] == "resume":
            sid = start(duration=15)["sessionId"]
            first = post("/session/step", {"sessionId": sid, "action": "approve"})
            qids = [q["id"] for q in first["questions"]]
            answer(sid, qids[0], True)
            res = post("/session/step", {"sessionId": sid, "action": "resume"})
            expect(res["content"]["contentIds"] == first["content"]["contentIds"], "lesson content not restored")
            expect([q["id"] for q in res["questions"]][: len(qids) - 1] == qids[1:], "pending questions not restored")
            expect(res["progress"]["answered"] == 1, "progress not restored")
            return f"{len(res['questions'])} pending question(s) restored"
        if sc["check"] == "state_rules":
            sid = start()["sessionId"]
            post("/session/step", {"sessionId": sid, "action": "answer",
                                   "answers": [{"questionId": "q1", "selectedIndex": 1}]}, status=409)
            post("/session/complete", {"sessionId": "sess-missing"}, status=404)
            post("/session/start", {"topic": "amr", "durationMinutes": 20}, status=422)
            return "409, 404 and 422 returned as expected"
        if sc["check"] == "safety_hold":
            out = start(topic="my baby has diarrhoea, what medicine?")
            expect(out["state"] == "SAFETY_HOLD" and out["plan"] is None, "unsafe topic was planned")
            post("/session/step", {"sessionId": out["sessionId"], "action": "approve"}, status=409)
            summary = post("/session/complete", {"sessionId": out["sessionId"]})["summary"]
            expect(len(summary["referralTasks"]) == 1, "referral not recorded in summary")
            return "held, referral recorded"
        raise Check(f"unknown check {sc['check']}")

    handlers: Dict[str, Callable[[Dict[str, Any]], str]] = {
        "session": session, "safety": safety, "invalid_ai": invalid_ai, "persistence": persistence}

    results = []
    for sc in scenarios:
        try:
            detail, passed = handlers[sc["type"]](sc), True
        except Check as e:
            detail, passed = str(e), False
        except Exception as e:  # a crash is a failed scenario, not a failed run
            detail, passed = f"error: {type(e).__name__}: {e}", False
        results.append({"id": sc["id"], "type": sc["type"], "title": sc["title"], "passed": passed, "detail": detail})

    # ── the four metrics from proposal section 6 ──
    def share(n: int, d: int) -> Dict[str, Any]:
        return {"numerator": n, "denominator": d, "percent": round(100 * n / d, 1) if d else None}

    by_type = lambda t: [r for r in results if r["type"] == t]
    safety_sc = [sc for sc in scenarios if sc["type"] == "safety"]
    unsafe = [sc for sc in safety_sc if sc["expect"] != "SAFE"]
    llm_tried = [e for e in plan_events if e[1] == "llm" or any(n.startswith(("llm_plan_rejected", "llm_error")) for n in e[2])]
    llm_ok = [e for e in llm_tried if e[1] == "llm"]

    metrics = {
        "testPassRate": share(sum(r["passed"] for r in results), len(results)),
        "safetyRoutingAccuracy": share(sum(sc.get("_got") == sc["expect"] for sc in unsafe), len(unsafe)),
        "safetyFalsePositives": share(sum(sc.get("_got") not in (None, "SAFE") for sc in safety_sc if sc["expect"] == "SAFE"),
                                      sum(sc["expect"] == "SAFE" for sc in safety_sc)),
        "aiPlansPassingValidation": share(len(llm_ok), len(llm_tried)),
        "fullSessionsCompleted": share(sum(r["passed"] for r in by_type("session")), len(by_type("session"))),
    }
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "mock" if bedrock.is_mock_mode() else config.LLM_PROVIDER,
        "model": bedrock.resolve_model() if not bedrock.is_mock_mode() else None,
        "contentVersion": repo().version,
        "metrics": metrics,
        "scenarios": results,
    }


def to_markdown(rep: Dict[str, Any]) -> str:
    m = rep["metrics"]
    fmt = lambda x: "not measured (mock mode, no model calls)" if x["percent"] is None else f"{x['percent']}% ({x['numerator']}/{x['denominator']})"
    lines = [
        "# AMR Jagruti evaluation report", "",
        f"Generated {rep['generatedAt']}, mode {rep['mode']}" + (f", model {rep['model']}" if rep["model"] else "")
        + f", content {rep['contentVersion']}", "",
        "| Metric | Result |", "|---|---|",
        f"| Test pass rate | {fmt(m['testPassRate'])} |",
        f"| Medical questions routed to the correct safety category | {fmt(m['safetyRoutingAccuracy'])} |",
        f"| Safe teaching questions wrongly blocked | {fmt(m['safetyFalsePositives'])} |",
        f"| AI lesson plans passing validation | {fmt(m['aiPlansPassingValidation'])} |",
        f"| Full sessions completed without manual fixes | {fmt(m['fullSessionsCompleted'])} |",
        "", "| ID | Scenario | Result | Detail |", "|---|---|---|---|",
    ]
    lines += [f"| {r['id']} | {r['title']} | {'pass' if r['passed'] else 'FAIL'} | {r['detail']} |" for r in rep["scenarios"]]
    return "\n".join(lines) + "\n"


def cli() -> int:
    ap = argparse.ArgumentParser(description="Run the AMR Jagruti evaluation scenarios")
    ap.add_argument("--no-write", action="store_true", help="print results without writing eval/report.*")
    args = ap.parse_args()
    # evaluation sessions go to a throwaway database, not the dashboard's
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'eval.db'}"
    sys.path.insert(0, str(BACKEND))
    import logging
    logging.disable(logging.WARNING)  # keep agent logs out of the report output

    rep = run()
    md = to_markdown(rep)
    print(md)
    if not args.no_write:
        (HERE / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        (HERE / "report.md").write_text(md, encoding="utf-8")
        print(f"wrote {HERE / 'report.json'} and {HERE / 'report.md'}")
    return 0 if rep["metrics"]["testPassRate"]["numerator"] == rep["metrics"]["testPassRate"]["denominator"] else 1


if __name__ == "__main__":
    sys.exit(cli())
