import asyncio
import json
from types import SimpleNamespace

import pytest

import agent_loop


QUOTE = "Antibiotics treat infections caused by bacteria, not viruses."
CHUNK = {
    "chunkId": "chunk-test", "documentId": "doc-test", "title": "Test source",
    "url": "https://example.test/source", "location": "paragraph 1",
    "text": QUOTE + " They do not work against viral infections.",
    "provenance": "approved",
}


def _call(name, args, index):
    return SimpleNamespace(type="function_call", id=f"fc-{index}", call_id=f"call-{index}",
                           name=name, arguments=json.dumps(args))


def _search(index=1):
    return _call("search_sources", {"query": "antibiotics bacteria infections"}, index)


def _proposal(kind="plan", index=2, quote=QUOTE):
    quiz = None
    if kind == "quiz":
        quiz = {"question": "What do antibiotics treat?", "options": [
            "Bacterial infections", "Viral infections", "All infections"],
            "correctIndex": 0, "explanation": "They treat bacterial infections.",
            "conceptTag": "antibiotics"}
    return _call("propose_activity", {
        "kind": kind, "title": f"{kind.title()} activity",
        "body": "Antibiotics treat bacterial infections. They do not treat viruses.",
        "citations": [{"chunkId": CHUNK["chunkId"], "quote": quote}],
        "quiz": quiz,
    }, index)


class FakeResponses:
    def __init__(self, sequence):
        self.sequence = list(sequence)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(json.loads(json.dumps(kwargs)))
        output = self.sequence.pop(0)
        return SimpleNamespace(id=f"resp-{len(self.calls)}", status="completed",
                               usage={"input_tokens": 12, "output_tokens": 7}, output=[output])


def _configure(monkeypatch, tmp_path, sequence):
    monkeypatch.setattr(agent_loop, "DB_PATH", tmp_path / "agent_sessions.db")
    monkeypatch.setattr(agent_loop.config, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(agent_loop.config, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(agent_loop.config, "OPENAI_MOCK", "false")
    monkeypatch.setattr(agent_loop.config, "AGENT_TURN_MAX_CALLS", 4)
    monkeypatch.setattr(agent_loop.config, "AGENT_SESSION_MAX_CALLS", 24)
    monkeypatch.setattr(agent_loop.knowledge, "list_sources", lambda: {
        "sources": [], "chunkCount": 1, "usingDemo": False})
    monkeypatch.setattr(agent_loop.knowledge, "search", lambda query, limit=5: [CHUNK])
    client = SimpleNamespace(responses=FakeResponses(sequence))
    monkeypatch.setattr(agent_loop.openai_client, "_client", lambda: client)
    return client.responses


def test_retrieval_and_exact_quote_required(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, [])
    state = {
        "topic": "antibiotics", "lang": "en", "durationMinutes": 5, "priorGaps": [],
        "history": [], "answers": [], "current": None, "usingDemo": False, "_evidence": [CHUNK],
    }
    base = {"kind": "plan", "title": "Plan", "body": "Read this lesson.",
            "citations": [{"chunkId": CHUNK["chunkId"], "quote": QUOTE}], "quiz": None}
    with pytest.raises(ValueError, match="search_sources"):
        agent_loop._validate_proposal(base, state, "start", False)
    fake_quote = dict(base, citations=[{"chunkId": CHUNK["chunkId"], "quote": "Antibiotics treat viruses."}])
    with pytest.raises(ValueError, match="exact quote"):
        agent_loop._validate_proposal(fake_quote, state, "start", True)
    assert agent_loop._validate_proposal(base, state, "start", True)["citations"][0]["documentId"] == "doc-test"


def test_review_gate_revision_trace_and_role_redaction(monkeypatch, tmp_path):
    sequence = [_search(1), _proposal("plan", 2), _search(3), _proposal("plan", 4)]
    responses = _configure(monkeypatch, tmp_path, sequence)
    session = asyncio.run(agent_loop.start_session("antibiotics", 5))
    proposal_id = session["pending"]["id"]
    learner = agent_loop.get_session(session["id"])
    assert learner["pending"] is None
    assert learner["trace"] and all(not event["detail"] for event in learner["trace"])
    with pytest.raises(agent_loop.AgentError, match="only the ASHA"):
        asyncio.run(agent_loop.mutate_session(session["id"], action="approve",
                                              proposal_id=proposal_id, view="learner"))
    with pytest.raises(agent_loop.AgentError, match="stale"):
        asyncio.run(agent_loop.mutate_session(session["id"], action="approve", proposal_id="old"))

    revised = asyncio.run(agent_loop.mutate_session(
        session["id"], action="revise", proposal_id=proposal_id,
        feedback="Use a shorter title", view="asha"))
    assert revised["state"] == "AWAITING_REVIEW"
    assert revised["pending"]["kind"] == "plan"
    assert revised["pending"]["id"] != proposal_id
    assert "revisionDraft" in responses.calls[2]["input"][1]["content"]
    assert [len(item["detail"]["input"]) for item in
            [event for event in agent_loop.get_session(session["id"], "asha")["trace"]
             if event["event"] == "api_request"]] == [2, 4, 2, 4]


def test_quiz_key_visibility_grade_idempotence_and_restart(monkeypatch, tmp_path):
    sequence = [_search(1), _proposal("plan", 2),
                _search(3), _proposal("quiz", 4)]
    _configure(monkeypatch, tmp_path, sequence)
    session = asyncio.run(agent_loop.start_session("antibiotics", 5))
    session = asyncio.run(agent_loop.mutate_session(
        session["id"], action="approve", proposal_id=session["pending"]["id"]))
    session = asyncio.run(agent_loop.mutate_session(session["id"], action="continue"))
    quiz = session["pending"]
    session = asyncio.run(agent_loop.mutate_session(
        session["id"], action="approve", proposal_id=quiz["id"]))
    learner = agent_loop.get_session(session["id"], "learner")
    assert "correctIndex" not in learner["current"]["quiz"]
    assert "explanation" not in learner["current"]["quiz"]
    answered = asyncio.run(agent_loop.mutate_session(
        session["id"], action="answer", proposal_id=quiz["id"], selected_index=1, view="learner"))
    assert answered["answers"] == [{
        "activityId": quiz["id"], "selectedIndex": 1, "correct": False, "conceptTag": "antibiotics"}]
    assert answered["current"]["quiz"]["explanation"] == "They treat bacterial infections."
    assert "correctIndex" not in answered["current"]["quiz"]
    with pytest.raises(agent_loop.AgentError):
        asyncio.run(agent_loop.mutate_session(
            session["id"], action="answer", proposal_id=quiz["id"], selected_index=0))
    reloaded = agent_loop.get_session(session["id"], "asha")
    assert len(reloaded["answers"]) == 1


def test_failed_call_and_budget_trace_survive_reload(monkeypatch, tmp_path):
    responses = _configure(monkeypatch, tmp_path, [_search(1)])
    monkeypatch.setattr(agent_loop.config, "AGENT_SESSION_MAX_CALLS", 1)
    session = asyncio.run(agent_loop.start_session("antibiotics", 5))
    assert session["state"] == "BLOCKED"
    assert session["callsUsed"] == 1
    agent_loop._reset_for_tests(tmp_path / "agent_sessions.db")
    reloaded = agent_loop.get_session(session["id"], "asha")
    assert reloaded["state"] == "BLOCKED"
    assert any(event["event"] == "error" for event in reloaded["trace"])
    assert "secret" not in json.dumps(reloaded)
    assert len(responses.calls) == 1


def test_finish_summary_waits_for_asha_and_safety_alert_is_immediate(monkeypatch, tmp_path):
    sequence = [_search(1), _proposal("plan", 2),
                _search(3), _proposal("summary", 4)]
    responses = _configure(monkeypatch, tmp_path, sequence)
    session = asyncio.run(agent_loop.start_session("antibiotics", 5))
    approved = asyncio.run(agent_loop.mutate_session(
        session["id"], action="approve", proposal_id=session["pending"]["id"]))
    summary = asyncio.run(agent_loop.mutate_session(approved["id"], action="finish"))
    assert summary["state"] == "AWAITING_REVIEW"
    assert summary["pending"]["kind"] == "summary"
    assert agent_loop.get_session(summary["id"], "learner")["pending"] is None
    completed = asyncio.run(agent_loop.mutate_session(
        summary["id"], action="approve", proposal_id=summary["pending"]["id"]))
    assert completed["state"] == "COMPLETED"
    assert len(responses.calls) == 4

    safety = asyncio.run(agent_loop.start_session("I have chest pain", 5))
    assert safety["state"] == "AWAITING_REVIEW"
    assert "emergency" in safety["safetyMessage"].lower()
    assert agent_loop.get_session(safety["id"], "learner")["pending"] is None
    assert agent_loop.get_session(safety["id"], "learner")["safetyMessage"] == safety["safetyMessage"]
    assert len(responses.calls) == 4


def test_provider_error_is_sanitized_and_persisted(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, [])

    class FailingResponses:
        async def create(self, **kwargs):
            raise RuntimeError("secret token should not be persisted")

    monkeypatch.setattr(agent_loop.openai_client, "_client", lambda: SimpleNamespace(responses=FailingResponses()))
    session = asyncio.run(agent_loop.start_session("antibiotics", 5))
    assert session["state"] == "BLOCKED"
    agent_loop._reset_for_tests(tmp_path / "agent_sessions.db")
    reloaded = agent_loop.get_session(session["id"], "asha")
    assert reloaded["error"] == "OpenAI request failed (RuntimeError)"
    assert "secret token" not in json.dumps(reloaded)
    assert any(event["event"] == "error" for event in reloaded["trace"])
