"""Sign-in, role separation and household visits."""

from conftest import token_for


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_anonymous_learner_reaches_only_public_routes(anon):
    # household learners have no account: they can read lessons and attempt published quizzes, nothing else
    assert anon.get("/content").status_code == 200
    assert anon.get("/quizzes").status_code == 200
    assert anon.get("/health").status_code == 200
    assert anon.post("/session/start", json={"topic": "antibiotics", "durationMinutes": 5}).status_code == 401
    assert anon.get("/dashboard/sessions").status_code == 401
    assert anon.get("/visits").status_code == 401
    assert anon.get("/quizzes/drafts").status_code == 401
    assert anon.post("/quizzes/drafts", json={"topic": "AMR"}).status_code == 401
    assert anon.get("/agent/sessions").status_code == 401


def test_wrong_password_and_bad_token_are_rejected(anon):
    assert anon.post("/auth/login", json={"username": "asha", "password": "nope"}).status_code == 401
    assert anon.post("/auth/login", json={"username": "nobody", "password": "x"}).status_code == 401
    assert anon.get("/auth/me", headers=_h("not-a-token")).status_code == 401


def test_roles_are_separated(anon):
    asha, sup = token_for(anon, "asha"), token_for(anon, "supervisor")
    assert anon.get("/auth/me", headers=_h(asha)).json()["role"] == "asha"
    assert anon.get("/auth/me", headers=_h(sup)).json()["role"] == "supervisor"
    # ASHA workers cannot open the supervisor dashboard
    for path in ("/dashboard/sessions", "/dashboard/tasks", "/dashboard/visits", "/dashboard/evaluation"):
        assert anon.get(path, headers=_h(asha)).status_code == 403, path
    # supervisors cannot run household sessions or author quizzes
    body = {"topic": "antibiotics", "durationMinutes": 5, "lang": "en"}
    assert anon.post("/session/start", json=body, headers=_h(sup)).status_code == 403
    assert anon.get("/quizzes/drafts", headers=_h(sup)).status_code == 403
    assert anon.get("/visits", headers=_h(sup)).status_code == 403
    assert anon.get("/dashboard/sessions", headers=_h(sup)).status_code == 200


def test_logout_invalidates_the_token(anon):
    tok = token_for(anon, "asha")
    assert anon.get("/auth/me", headers=_h(tok)).status_code == 200
    anon.post("/auth/logout", headers=_h(tok))
    assert anon.get("/auth/me", headers=_h(tok)).status_code == 401


def test_sessions_belong_to_their_asha(anon):
    asha = token_for(anon, "asha")
    other = anon.post("/auth/login", json={"username": "asha2", "password": "asha123"}).json()["token"]
    sid = anon.post("/session/start", json={"topic": "antibiotics", "durationMinutes": 5, "lang": "en"},
                    headers=_h(asha)).json()["sessionId"]
    assert anon.get(f"/session/{sid}", headers=_h(asha)).json()["ashaId"] == "asha"
    assert anon.get(f"/session/{sid}", headers=_h(other)).status_code == 404
    assert anon.post("/session/step", json={"sessionId": sid, "action": "approve"}, headers=_h(other)).status_code == 404
    assert sid in {s["id"] for s in anon.get("/session/mine", headers=_h(asha)).json()}
    assert sid not in {s["id"] for s in anon.get("/session/mine", headers=_h(other)).json()}
    # the supervisor can read it and sees who ran it
    sup = token_for(anon, "supervisor")
    assert anon.get(f"/session/{sid}", headers=_h(sup)).status_code == 200
    row = next(r for r in anon.get("/dashboard/sessions", headers=_h(sup)).json() if r["id"] == sid)
    assert row["ashaName"].startswith("Savitha")


def test_visit_score_comes_from_the_linked_session(client, anon):
    from agents.content import repo
    sid = client.post("/session/start", json={"topic": "antibiotics", "durationMinutes": 10, "lang": "en"}).json()["sessionId"]
    qs = client.post("/session/step", json={"sessionId": sid, "action": "approve"}).json()["questions"]
    for q in qs[:2]:  # one right, one wrong -> 50%
        correct = repo().quiz_by_id[q["id"]]["correctIndex"]
        idx = correct if q is qs[0] else (correct + 1) % len(q["options"])
        client.post("/session/step", json={"sessionId": sid, "action": "answer",
                                           "answers": [{"questionId": q["id"], "selectedIndex": idx}]})
    client.post("/session/complete", json={"sessionId": sid})

    v = client.post("/visits", json={"household": "House 12", "village": "Hunsur", "district": "Mysuru",
                                     "sessionId": sid, "outcome": "completed"})
    assert v.status_code == 200, v.text
    visit = v.json()
    assert visit["quizScore"] == 50 and visit["topic"] == "antibiotics" and visit["durationMin"] == 10
    # without a session there is no score, and a topic is required
    assert client.post("/visits", json={"household": "H", "village": "V", "district": "Mysuru"}).status_code == 422
    plain = client.post("/visits", json={"household": "H", "village": "V", "district": "Mysuru", "topic": "general"}).json()
    assert plain["quizScore"] is None
    assert {visit["id"], plain["id"]} <= {x["id"] for x in client.get("/visits").json()}

    # another ASHA cannot link this session or delete these visits
    other = anon.post("/auth/login", json={"username": "asha2", "password": "asha123"}).json()["token"]
    assert anon.post("/visits", headers=_h(other), json={"household": "H", "village": "V", "district": "Mandya",
                                                          "sessionId": sid}).status_code == 404
    assert anon.delete(f"/visits/{visit['id']}", headers=_h(other)).status_code == 404
    # the supervisor sees every ASHA's visits with the ASHA's name
    sup_rows = client.get("/dashboard/visits").json()
    assert any(r["id"] == visit["id"] and r["ashaName"].startswith("Savitha") for r in sup_rows)
    assert client.delete(f"/visits/{visit['id']}").status_code == 200
