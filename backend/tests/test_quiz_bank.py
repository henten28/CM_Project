import asyncio
import json
from types import SimpleNamespace

import pytest

import quiz_bank


QUOTE = "Antibiotics treat infections caused by bacteria, not viruses."
CHUNK = {
    "chunkId": "chunk-test", "documentId": "doc-test", "title": "CDC source",
    "url": "https://example.test/cdc", "location": "paragraph 1",
    "text": QUOTE + " Do not use antibiotics for viral infections.",
    "provenance": "official",
}


def _call(name, args, index):
    return SimpleNamespace(type="function_call", id=f"fn-{index}", call_id=f"call-{index}",
                           name=name, arguments=json.dumps(args))


def _search(index=1):
    return _call("search_sources", {"query": "antibiotics bacteria infections"}, index)


def _q(question, index=0, quote=QUOTE):
    return {"question": question, "options": [
        "Bacterial infections", "Viral infections", "All infections"],
        "correctIndex": index, "explanation": "Antibiotics act against bacterial infections.",
        "conceptTag": "antibiotic-use",
        "citations": [{"chunkId": CHUNK["chunkId"], "quote": quote}]}


def _proposal(questions, title="AMR basics", index=2):
    return _call("propose_quiz", {"title": title, "questions": questions}, index)


class FakeResponses:
    def __init__(self, sequence):
        self.sequence = list(sequence)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(json.loads(json.dumps(kwargs)))
        output = self.sequence.pop(0)
        return SimpleNamespace(id=f"response-{len(self.calls)}", status="completed",
                               usage={"input_tokens": 33, "output_tokens": 21}, output=[output])


def _configure(monkeypatch, tmp_path, sequence):
    monkeypatch.setattr(quiz_bank, "DB_PATH", tmp_path / "quiz_bank.db")
    monkeypatch.setattr(quiz_bank.config, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(quiz_bank.config, "OPENAI_API_KEY", "fake-api-key")
    monkeypatch.setattr(quiz_bank.config, "OPENAI_MOCK", "false")
    monkeypatch.setattr(quiz_bank.config, "AGENT_TURN_MAX_CALLS", 4)
    monkeypatch.setattr(quiz_bank.config, "AGENT_SESSION_MAX_CALLS", 24)
    monkeypatch.setattr(quiz_bank.knowledge, "list_sources", lambda: {
        "sources": [], "chunkCount": 1, "usingDemo": False})
    monkeypatch.setattr(quiz_bank.knowledge, "search", lambda query, limit=5: [CHUNK])
    client = SimpleNamespace(responses=FakeResponses(sequence))
    monkeypatch.setattr(quiz_bank.openai_client, "_client", lambda: client)
    return client.responses


def _generated_questions(count=2):
    return [_q(f"What infections does antibiotic {number} treat?", number % 3)
            for number in range(1, count + 1)]


def test_batch_publish_redaction_pinned_attempt_and_idempotent_grade(monkeypatch, tmp_path):
    calls = _configure(monkeypatch, tmp_path, [_search(), _proposal(_generated_questions())])
    draft = asyncio.run(quiz_bank.create_draft("antibiotic basics", question_count=2))
    assert draft["state"] == "AWAITING_REVIEW"
    assert len(draft["questions"]) == 2
    assert draft["callsUsed"] == 2
    assert draft["trace"][0]["detail"]["model"] == "gpt-6-luna"
    assert "fake-api-key" not in json.dumps(draft["trace"])
    assert "correctIndex" in draft["questions"][0]

    before_publish = draft["revision"]
    with pytest.raises(quiz_bank.QuizError, match="stale"):
        asyncio.run(quiz_bank.mutate_draft(
            draft["id"], action="publish", expected_revision=before_publish - 1))
    published = asyncio.run(quiz_bank.mutate_draft(
        draft["id"], action="publish", expected_revision=before_publish))
    assert published["state"] == "PUBLISHED"
    assert published["publishedVersion"] == 1
    public = quiz_bank.get_published(draft["id"])
    assert all(set(question) == {"id", "question", "options"} for question in public["questions"])
    assert "correctIndex" not in json.dumps(public)
    assert "explanation" not in json.dumps(public)
    assert QUOTE not in json.dumps(public)
    assert "trace" not in public
    with pytest.raises(quiz_bank.QuizError, match="stale"):
        asyncio.run(quiz_bank.mutate_draft(
            draft["id"], action="publish", expected_revision=before_publish))
    assert len(calls.calls) == 2

    attempt = asyncio.run(quiz_bank.create_attempt(draft["id"], 1))
    assert attempt["status"] == "IN_PROGRESS"
    private_fields = json.dumps(attempt)
    for hidden in ("correctIndex", "explanation", QUOTE, "_evidence", "trace"):
        assert hidden not in private_fields
    loaded = quiz_bank.get_attempt(attempt["id"])
    assert loaded == attempt

    # Invalid submissions do not complete or persist a grade.
    quiz_questions = attempt["quiz"]["questions"]
    complete = [{"questionId": q["id"], "selectedIndex": 0} for q in quiz_questions]
    with pytest.raises(quiz_bank.QuizError, match="exactly one"):
        asyncio.run(quiz_bank.submit_attempt(attempt["id"], complete[:-1]))
    with pytest.raises(quiz_bank.QuizError, match="exactly one"):
        asyncio.run(quiz_bank.submit_attempt(
            attempt["id"], [complete[0], complete[0]]))
    assert quiz_bank.get_attempt(attempt["id"])["status"] == "IN_PROGRESS"

    # A later edited/published version never changes the already pinned snapshot.
    current = quiz_bank.get_draft(draft["id"])
    first_question = current["questions"][0]
    edit = {
        "question": "Which infections do antibiotics treat?",
        "options": ["Bacterial infections", "Viral infections", "All infections"],
        "correctIndex": 0, "explanation": "They act against bacteria.",
        "conceptTag": "antibiotic-use", "citations": [{"chunkId": CHUNK["chunkId"], "quote": QUOTE}],
    }
    bad_edit = {**edit, "citations": [{"chunkId": CHUNK["chunkId"], "quote": "This quote was made up."}]}
    with pytest.raises(quiz_bank.QuizError, match="exact, meaningful quote"):
        asyncio.run(quiz_bank.mutate_draft(
            draft["id"], action="edit_question", expected_revision=current["revision"],
            question_id=first_question["id"], question=bad_edit))
    assert quiz_bank.get_draft(draft["id"])["revision"] == current["revision"]
    edited = asyncio.run(quiz_bank.mutate_draft(
        draft["id"], action="edit_question", expected_revision=current["revision"],
        question_id=first_question["id"], question=edit))
    version2 = asyncio.run(quiz_bank.mutate_draft(
        draft["id"], action="publish", expected_revision=edited["revision"]))
    assert version2["publishedVersion"] == 2
    assert quiz_bank.get_published(draft["id"], 1)["questions"][0]["question"] == first_question["question"]
    version2_attempt = asyncio.run(quiz_bank.create_attempt(draft["id"], 2))
    assert version2_attempt["id"] != attempt["id"]
    assert version2_attempt["version"] == 2

    result = asyncio.run(quiz_bank.submit_attempt(attempt["id"], complete))
    assert result["status"] == "COMPLETED"
    assert result["result"]["total"] == 2
    assert "correctIndex" in json.dumps(result["result"])
    assert result["result"]["items"][0]["correctIndex"] == 1
    assert result["result"]["items"][0]["correct"] is False
    assert QUOTE in json.dumps(result["result"])
    v2_result = asyncio.run(quiz_bank.submit_attempt(version2_attempt["id"], complete))
    assert v2_result["result"]["items"][0]["correctIndex"] == 0
    assert v2_result["result"]["items"][0]["correct"] is True
    assert asyncio.run(quiz_bank.submit_attempt(attempt["id"], complete)) == result
    conflict = [dict(item) for item in complete]
    conflict[0]["selectedIndex"] = 1
    with pytest.raises(quiz_bank.QuizError, match="different answers"):
        asyncio.run(quiz_bank.submit_attempt(attempt["id"], conflict))
    assert len(calls.calls) == 2  # learner attempts, grading, and publishing never call the model


def test_unreviewed_and_fabricated_citations_never_publish(monkeypatch, tmp_path):
    invalid_quote = _q("What infections do antibiotics treat?", 0, "Fabricated supporting words are not a quote.")
    sequence = [
        _proposal([_q("What infections do antibiotics treat?")], index=1),  # proposal before retrieval
        _search(2),
        _proposal([invalid_quote], index=3),  # fabricated quote after retrieval
        _proposal([_q("What infections do antibiotics treat?")], index=4),
    ]
    responses = _configure(monkeypatch, tmp_path, sequence)
    draft = asyncio.run(quiz_bank.create_draft("antibiotic basics", question_count=1))
    assert draft["state"] == "AWAITING_REVIEW"
    assert len(draft["questions"]) == 1
    assert len([event for event in draft["trace"] if event["event"] == "guardrail"]) == 2
    with pytest.raises(quiz_bank.QuizError, match="not found"):
        quiz_bank.get_published(draft["id"])
    assert len(responses.calls) == 4


def test_regenerate_question_preserves_other_questions_and_title(monkeypatch, tmp_path):
    replacement = _q("How should antibiotics be used?", 0)
    other = _q("Which infections do antibiotics treat?", 2)
    sequence = [
        _search(1), _proposal([_q("What are antibiotics for?", 0), other], "Original title"),
        _search(3),
        _proposal([other], "Untrusted replacement title", 4),
        _proposal([replacement], "Still ignored for single replacement", 5),
    ]
    responses = _configure(monkeypatch, tmp_path, sequence)
    draft = asyncio.run(quiz_bank.create_draft("antibiotic basics", question_count=2))
    first, second = draft["questions"]
    before = quiz_bank.get_draft(draft["id"])
    revised = asyncio.run(quiz_bank.mutate_draft(
        before["id"], action="regenerate_question", expected_revision=before["revision"],
        question_id=first["id"], feedback="Use a practical question"))
    assert revised["state"] == "AWAITING_REVIEW"
    assert revised["title"] == "Original title"
    assert revised["questions"][0]["id"] == first["id"]
    assert revised["questions"][0]["question"] == replacement["question"]
    assert revised["questions"][1]["question"] == other["question"]
    assert any(event["event"] == "guardrail" for event in revised["trace"])
    assert len(responses.calls) == 5


def test_safety_and_missing_key_block_without_model(monkeypatch, tmp_path):
    responses = _configure(monkeypatch, tmp_path, [])
    unsafe = asyncio.run(quiz_bank.create_draft("What dose should I take?", question_count=1))
    assert unsafe["state"] == "BLOCKED"
    assert unsafe["callsUsed"] == 0
    assert not responses.calls

    monkeypatch.setattr(quiz_bank.config, "OPENAI_API_KEY", "")
    missing_key = asyncio.run(quiz_bank.create_draft("Antibiotic basics", question_count=1))
    assert missing_key["state"] == "BLOCKED"
    assert "OPENAI_API_KEY" in missing_key["error"]
    assert missing_key["callsUsed"] == 0
    assert not responses.calls
