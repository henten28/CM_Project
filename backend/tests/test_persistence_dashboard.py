import db
from agents.content import repo


def _approve(client, sid):
    r = client.post("/session/step", json={"sessionId": sid, "action": "approve"})
    assert r.status_code == 200, r.text
    return r.json()


def _answer(client, sid, qid, correct):
    q = repo().quiz_by_id[qid]
    idx = q["correctIndex"] if correct else (q["correctIndex"] + 1) % len(q["options"])
    return client.post("/session/step", json={"sessionId": sid, "action": "answer",
                                              "answers": [{"questionId": qid, "selectedIndex": idx}]})


# ── persistence ──

def test_session_survives_engine_restart(client, started):
    sid = started(lang="en")["sessionId"]
    qid = _approve(client, sid)["questions"][0]["id"]
    _answer(client, sid, qid, False)
    client.post("/session/step", json={"sessionId": sid, "action": "ask", "text": "What dose should I give?"})
    before = client.get(f"/session/{sid}").json()

    db.reset_engine()  # same as restarting the backend: nothing cached in memory
    after = client.get(f"/session/{sid}").json()
    assert after == before
    assert after["state"] == "IN_PROGRESS" and len(after["answers"]) == 1
    assert len(after["escalations"]) == 1 and len(after["log"]) == len(before["log"])


def test_audit_log_is_append_only(client, started):
    sid = started()["sessionId"]
    n1 = len(client.get(f"/session/{sid}").json()["log"])
    _approve(client, sid)
    log = client.get(f"/session/{sid}").json()["log"]
    assert len(log) > n1 and [h["action"] for h in log][:2] == ["start", "plan_for_review"]


# ── resume after a page reload ──

def test_resume_restores_content_and_pending_questions(client, started):
    sid = started(lang="en", duration=15)["sessionId"]
    first = _approve(client, sid)
    qids = [q["id"] for q in first["questions"]]
    _answer(client, sid, qids[0], True)

    r = client.post("/session/step", json={"sessionId": sid, "action": "resume"}).json()
    assert r["content"]["contentIds"] == first["content"]["contentIds"]
    pending = [q["id"] for q in r["questions"]]
    assert qids[0] not in pending and set(qids[1:]) <= set(pending)
    assert all("correctIndex" not in q for q in r["questions"])
    assert r["progress"] == {"scorePercent": 100.0, "answered": 1, "correct": 1, "level": "hard"}


def test_resume_only_while_in_progress(client, started):
    sid = started()["sessionId"]
    assert client.post("/session/step", json={"sessionId": sid, "action": "resume"}).status_code == 409


# ── dashboard ──

def test_dashboard_sessions_and_task_lifecycle(client, started):
    sid = started(topic="prevention", lang="en")["sessionId"]
    qid = _approve(client, sid)["questions"][0]["id"]
    _answer(client, sid, qid, False)
    client.post("/session/step", json={"sessionId": sid, "action": "ask",
                                       "text": "She has swelling on her face after the tablet"})
    client.post("/session/complete", json={"sessionId": sid})

    row = next(r for r in client.get("/dashboard/sessions").json() if r["id"] == sid)
    assert row["sessionCompleted"] and row["safetyRouted"] and row["openTasks"] == 1
    assert row["lessonPlanValid"] is True and row["totalQ"] == 1 and row["quizScore"] == 0 and row["gaps"]

    task = next(t for t in client.get("/dashboard/tasks").json() if t["sessionId"] == sid)
    assert task["category"] == "URGENT" and task["status"] == "open" and task["topic"] == "prevention"

    closed = client.post(f"/dashboard/tasks/{task['id']}/close").json()
    assert closed["status"] == "closed" and closed["closedAt"]
    assert task["id"] not in {t["id"] for t in client.get("/dashboard/tasks").json()}
    assert task["id"] in {t["id"] for t in client.get("/dashboard/tasks?status=closed").json()}
    assert client.post("/dashboard/tasks/nope/close").status_code == 404


def test_dashboard_safety_hold_session_has_no_plan(client, started):
    sid = started(topic="my baby has diarrhoea, what medicine?")["sessionId"]
    row = next(r for r in client.get("/dashboard/sessions").json() if r["id"] == sid)
    assert row["state"] == "SAFETY_HOLD" and row["lessonPlanValid"] is None and row["openTasks"] == 1


# ── content library ──

def test_content_library_serves_only_approved_content(client):
    data = client.get("/content").json()
    served = {b["id"] for m in data["modules"] for b in m["blocks"]}
    assert served == {b["id"] for b in repo().blocks}  # repo() already excludes unapproved items
    assert all(b["source"] and b["title"]["kn"] and b["body"]["en"] for m in data["modules"] for b in m["blocks"])
    assert len(data["keyMessages"]) == len(repo().quiz)
    assert "correctIndex" not in str(data) and "options" not in str(data)  # quiz answers never leak


def test_parallel_first_requests_on_a_fresh_database(tmp_path, monkeypatch):
    # the dashboard fires several requests at once; table creation must not race
    from concurrent.futures import ThreadPoolExecutor
    import config
    from fastapi.testclient import TestClient
    import main

    monkeypatch.setattr(config, "DATABASE_URL", f"sqlite:///{tmp_path / 'fresh.db'}")
    db.reset_engine()
    try:
        c = TestClient(main.app)
        paths = ["/dashboard/sessions", "/dashboard/tasks", "/dashboard/evaluation", "/content"] * 4
        with ThreadPoolExecutor(max_workers=16) as pool:
            codes = list(pool.map(lambda p: c.get(p).status_code, paths))
        assert codes == [200] * len(paths)
    finally:
        db.reset_engine()  # back to the suite's database
