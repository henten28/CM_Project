import pytest

from agents import planning_agent, retrieval_agent, safety_controller, tutor_agent
from agents.content import repo
from schemas import LessonModule, LessonPlan, AgentNote


def _plan_ids(plan):
    return [c for m in plan["lessonPlan"] for c in m["contentIds"]]


def _approve(client, sid, edited=None):
    body = {"sessionId": sid, "action": "approve"}
    if edited is not None:
        body["editedContentIds"] = edited
    return client.post("/session/step", json=body)


def _answer(client, sid, qids, correct):
    answers = [{"questionId": q, "selectedIndex": repo().quiz_by_id[q]["correctIndex"] if ok
                else (repo().quiz_by_id[q]["correctIndex"] + 1) % 4} for q, ok in zip(qids, correct)]
    return client.post("/session/step", json={"sessionId": sid, "action": "answer", "answers": answers})


# ── planning ──

@pytest.mark.parametrize("duration", [5, 10, 15])
def test_plan_fits_duration_and_uses_approved_ids(started, duration):
    out = started(duration=duration)
    plan = out["plan"]
    assert out["state"] == "AWAITING_APPROVAL" and out["requiresAshaApproval"]
    assert sum(m["estimatedMinutes"] for m in plan["lessonPlan"]) <= duration
    for m in plan["lessonPlan"]:
        for cid in m["contentIds"]:
            assert repo().block_by_id[cid]["moduleId"] == m["moduleId"]


def test_duration_must_be_5_10_or_15(client):
    r = client.post("/session/start", json={"topic": "amr", "durationMinutes": 7})
    assert r.status_code == 422


def test_prior_gaps_come_first(started):
    plan = started(topic="prevention", duration=5, gaps=["sharing"])["plan"]
    assert "sharing" in repo().block_by_id[_plan_ids(plan)[0]]["conceptTags"]


def test_llm_plan_with_invented_content_falls_back_to_rules(monkeypatch):
    import asyncio
    from services import bedrock

    bad = LessonPlan(lessonPlan=[LessonModule(moduleId="m1", contentIds=["c999"], estimatedMinutes=3)],
                     agentNote=AgentNote(kn="x", en="x"))

    async def fake(*a, **k):
        return bad
    monkeypatch.setattr(bedrock, "is_mock_mode", lambda: False)
    monkeypatch.setattr(bedrock, "generate_structured", fake)
    plan, source, notes = asyncio.run(planning_agent.run("amr", 10, "en", []))
    assert source == "rules" and any("c999" in n for n in notes)


def test_llm_plan_over_time_is_rejected_and_valid_plan_is_kept(monkeypatch):
    import asyncio
    from services import bedrock

    over = LessonPlan(lessonPlan=[LessonModule(moduleId="m7", contentIds=["c013", "c014"], estimatedMinutes=1)],
                      agentNote=AgentNote(kn="x", en="x"))
    good = LessonPlan(lessonPlan=[LessonModule(moduleId="m1", contentIds=["c001"], estimatedMinutes=99)],
                      agentNote=AgentNote(kn="x", en="x"))
    monkeypatch.setattr(bedrock, "is_mock_mode", lambda: False)

    async def give_over(*a, **k):
        return over
    monkeypatch.setattr(bedrock, "generate_structured", give_over)
    _, source, notes = asyncio.run(planning_agent.run("case study", 5, "en", []))
    assert source == "rules" and "over the 5 min" in notes[0]

    async def give_good(*a, **k):
        return good
    monkeypatch.setattr(bedrock, "generate_structured", give_good)
    plan, source, _ = asyncio.run(planning_agent.run("antibiotics", 5, "en", []))
    assert source == "llm" and plan.lessonPlan[0].estimatedMinutes == 3  # minutes recomputed from repo


# ── retrieval ──

def test_retrieval_returns_exact_ids_and_verified_sources():
    res = retrieval_agent.fetch(["c003", "c009"], "kn")
    assert res.contentIds == ["c003", "c009"]
    assert {s["id"] for s in res.sources} == {"SRC-NAP-AMR-2", "SRC-KA-SAMASTA"}
    assert all(h.verified and h.body.kn and h.body.en for h in res.hits)


def test_retrieval_kannada_keyword_and_refinement():
    assert "c001" in retrieval_agent.search(query="ಪ್ರತಿಜೀವಕ", lang="kn").contentIds
    # no advanced block is tagged 'sharing', so the difficulty filter must be relaxed
    res = retrieval_agent.search(concept_tags=["sharing"], difficulty="advanced")
    assert res.contentIds and "drop_difficulty" in res.refinements


def test_hindi_session_falls_back_to_english_display(client, started):
    sid = started(lang="hi")["sessionId"]
    content = _approve(client, sid).json()["content"]
    assert content["displayLang"] == "en"  # no reviewed Hindi text yet


# ── tutor branching ──

@pytest.mark.parametrize("pct,level", [(100, "hard"), (80, "hard"), (79.9, "medium"), (40, "medium"),
                                       (39.9, "easy"), (0, "easy")])
def test_thresholds(pct, level):
    assert tutor_agent.level_for(pct) == level


def test_full_flow_all_correct_goes_hard(client, started):
    sid = started(topic="antibiotics", duration=10)["sessionId"]
    r = _approve(client, sid)
    assert r.status_code == 200
    qids = [q["id"] for q in r.json()["questions"]]
    assert all("correctIndex" not in q for q in r.json()["questions"])  # answers never sent to client
    r = _answer(client, sid, qids, [True] * len(qids))
    t = r.json()["tutor"]
    assert t["scorePercent"] == 100 and t["nextActivity"]["level"] == "hard"
    assert t["nextActivity"]["kind"] == "case_study"
    s = client.post("/session/complete", json={"sessionId": sid}).json()
    assert s["state"] == "COMPLETED" and s["summary"]["remainingGaps"] == []


def test_all_wrong_goes_easy_with_reinforcement(client, started):
    sid = started(duration=10, lang="en")["sessionId"]
    qids = [q["id"] for q in _approve(client, sid).json()["questions"]]
    t = _answer(client, sid, qids, [False] * len(qids)).json()
    tutor = t["tutor"]
    assert tutor["nextActivity"]["level"] == "easy" and tutor["nextActivity"]["kind"] == "recap"
    for f in tutor["feedback"]:
        assert f["reinforcementContentIds"], f
        block = repo().block_by_id[f["reinforcementContentIds"][0]]
        assert f["conceptTag"].lower() in [x.lower() for x in block["conceptTags"]]
    # reinforcement content is actually delivered with sources
    assert t["content"]["contentIds"] and t["content"]["sources"]
    summary = client.post("/session/complete", json={"sessionId": sid}).json()["summary"]
    assert {g["conceptTag"] for g in summary["remainingGaps"]} >= set(tutor["gaps"])
    assert all(g["followUp"]["kn"] and g["followUp"]["en"] for g in summary["remainingGaps"])


def test_mixed_score_medium_and_gap_closes_on_retry(client, started):
    sid = started(duration=15, lang="en")["sessionId"]
    qids = [q["id"] for q in _approve(client, sid).json()["questions"]]
    t = _answer(client, sid, qids[:3], [True, True, False]).json()["tutor"]
    assert t["scorePercent"] == 66.7 and t["nextActivity"]["level"] == "medium"
    assert len(t["gaps"]) == 1


def test_tutor_rejects_bad_answers(client, started):
    sid = started()["sessionId"]
    early = client.post("/session/step", json={"sessionId": sid, "action": "answer",
                                               "answers": [{"questionId": "q1", "selectedIndex": 1}]})
    assert early.status_code == 409  # not approved yet
    qids = [q["id"] for q in _approve(client, sid).json()["questions"]]
    unasked = next(q["id"] for q in repo().quiz if q["id"] not in qids)
    assert _answer(client, sid, [unasked], [True]).status_code == 422
    assert _answer(client, sid, [qids[0]], [True]).status_code == 200
    assert _answer(client, sid, [qids[0]], [True]).status_code == 422  # duplicate
    bad_idx = client.post("/session/step", json={"sessionId": sid, "action": "answer",
                                                 "answers": [{"questionId": qids[1], "selectedIndex": 9}]})
    assert bad_idx.status_code == 422


# ── ASHA review ──

def test_asha_edit_validated(client, started):
    sid = started(duration=5)["sessionId"]
    assert _approve(client, sid, ["c001", "c999"]).status_code == 422
    r = _approve(client, sid, ["c001", "c013", "c014"])  # 13 min in a 5 min session: allowed with warning
    assert r.status_code == 200 and r.json()["warnings"]
    assert client.get(f"/session/{sid}").json()["approvedPlan"]["lessonPlan"][0]["moduleId"] == "m1"


def test_unknown_session_404(client):
    assert client.post("/session/complete", json={"sessionId": "nope"}).status_code == 404


# ── safety ──

UNSAFE = [
    ("My child has fever since yesterday", "PERSONAL_MEDICAL"),
    ("I am pregnant, is this ok?", "PERSONAL_MEDICAL"),
    ("What dose of amoxicillin for a 5 year old?", "DOSAGE"),
    ("Is 500 mg enough?", "DOSAGE"),
    ("How many tablets per day?", "DOSAGE"),
    ("Can I take my leftover antibiotics?", "SELF_MEDICATION"),
    ("My mother wants to stop the antibiotics early", "SELF_MEDICATION"),
    ("Can I buy antibiotics without prescription", "SELF_MEDICATION"),
    ("She has a rash and swelling after the antibiotic", "URGENT"),
    ("He can't breathe after the injection", "URGENT"),
    ("ನನ್ನ ಮಗುವಿಗೆ ಜ್ವರ ಇದೆ", "PERSONAL_MEDICAL"),
    ("ಎಷ್ಟು ಡೋಸ್ ಕೊಡಬೇಕು", "DOSAGE"),
    ("ಎದೆ ನೋವು ಇದೆ", "URGENT"),
    ("कितनी खुराक देनी है", "DOSAGE"),
    ("मुझे बुखार है", "PERSONAL_MEDICAL"),
]

SAFE = [
    "What is antimicrobial resistance?",
    "Why should antibiotics not be used for a cold?",
    "Why is it important to complete the full course?",
    "What happens if you share antibiotics with others?",
    "How does handwashing prevent infection?",
    "ಪ್ರತಿಜೀವಕಗಳು ಎಂದರೇನು?",
    "I want to explain why antibiotics don't cure a cold",
    "What happens if I don't finish all the tablets?",
    "Should you take antibiotics for a cold?",
    "What is the right way to store medicines?",
    "Can I explain AMR with a story?",
]


@pytest.mark.parametrize("text,category", UNSAFE)
def test_safety_routes_unsafe(text, category):
    res = safety_controller.classify(text)
    assert res.triggered and res.category == category, (text, res)
    assert res.message["kn"] and res.message["en"] and res.message["hi"]


@pytest.mark.parametrize("text", SAFE)
def test_safety_lets_teaching_questions_through(text):
    assert not safety_controller.classify(text).triggered, text


def test_urgent_beats_dosage():
    assert safety_controller.classify("reaction after the tablet, what dose now?").category == "URGENT"


def test_ask_override_records_escalation_without_raw_text(client, started):
    sid = started(lang="en")["sessionId"]
    _approve(client, sid)
    r = client.post("/session/step", json={"sessionId": sid, "action": "ask",
                                           "text": "My son has fever, which antibiotic should I give?"}).json()
    assert r["safety"]["triggered"] and r["content"] is None
    assert r["safety"]["message"]["en"] == safety_controller.MESSAGES[r["safety"]["category"]]["en"]
    record = client.get(f"/session/{sid}").json()
    assert "fever" not in str(record["escalations"])  # privacy: category and rule only
    summary = client.post("/session/complete", json={"sessionId": sid}).json()["summary"]
    assert len(summary["referralTasks"]) == 1 and summary["referralTasks"][0]["simulated"]


def test_safe_ask_returns_library_content_only(client, started):
    sid = started(lang="en")["sessionId"]
    r = client.post("/session/step", json={"sessionId": sid, "action": "ask",
                                           "text": "Why is handwashing important?"}).json()
    assert r["safety"] is None and r["content"]["contentIds"]
    assert set(r["content"]["contentIds"]) <= set(repo().block_by_id)


def test_unsafe_topic_holds_session_without_planning(client, started):
    out = started(topic="my baby has diarrhoea, what medicine?")
    assert out["state"] == "SAFETY_HOLD" and out["plan"] is None and out["safety"]["triggered"]
    assert _approve(client, out["sessionId"]).status_code == 409
    s = client.post("/session/complete", json={"sessionId": out["sessionId"]}).json()
    assert s["summary"]["referralTasks"] and s["state"] == "COMPLETED"


def test_audit_log_records_every_handoff(client, started):
    sid = started()["sessionId"]
    qids = [q["id"] for q in _approve(client, sid).json()["questions"]]
    _answer(client, sid, qids[:1], [False])
    client.post("/session/complete", json={"sessionId": sid})
    actions = [h["action"] for h in client.get(f"/session/{sid}").json()["log"]]
    for a in ["start", "plan_for_review", "approve", "lesson_content", "checkpoint_quiz",
              "reinforcement_request", "next_activity", "session_summary"]:
        assert a in actions, a
