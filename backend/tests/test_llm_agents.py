"""Retrieval, tutor and summary agents with a fake model: valid choices are used, invalid ones are rejected,
generated text that reads like medical advice is screened out, and provider errors fall back to rules."""

import asyncio

import pytest

from agents import llm, retrieval_agent, summary_agent, tutor_agent
from agents.content import repo
from agents.models import AnswerIn, SessionRecord
from services import bedrock


@pytest.fixture
def fake_model(monkeypatch):
    """Turns the LLM on and serves queued outputs (dicts, validated against the requested schema, or exceptions)."""
    queue = []
    seen = []

    async def generate(prompt, schema, **kwargs):
        seen.append((schema.__name__, prompt))
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return schema.model_validate(item)

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(bedrock, "generate_structured", generate)
    return queue, seen


def _session(plan_ids=("c001", "c002")):
    from agents import planning_agent
    s = SessionRecord(id="sess-test", topic="antibiotics", durationMinutes=10, lang="en", priorGaps=[])
    s.approvedPlan = planning_agent.build_plan(list(plan_ids))
    s.state = "IN_PROGRESS"
    return s


def _wrong(qid):
    q = repo().quiz_by_id[qid]
    return AnswerIn(questionId=qid, selectedIndex=(q["correctIndex"] + 1) % len(q["options"]))


# ── retrieval ──

def test_retrieval_drops_invented_filters_and_finds_content(fake_model):
    queue, _ = fake_model
    queue.append({"searchTerms": ["leftover", "share"], "conceptTags": ["sharing", "made-up-tag"], "moduleIds": ["m4", "m99"]})
    res, trace = asyncio.run(retrieval_agent.agentic_search("hamma maneyalli ulida tablet kodabahude?", "kn"))
    assert trace["agentSource"] == "llm"
    assert "dropped_unknown:made-up-tag" in trace["dropped"] and "dropped_unknown:m99" in trace["dropped"]
    assert res.contentIds and all(cid in repo().block_by_id for cid in res.contentIds)


def test_retrieval_refines_once_then_falls_back(fake_model):
    queue, seen = fake_model
    queue.append({"searchTerms": ["zzzz"], "conceptTags": [], "moduleIds": []})
    queue.append({"searchTerms": ["handwashing"], "conceptTags": ["hygiene"], "moduleIds": []})
    res, trace = asyncio.run(retrieval_agent.agentic_search("qqqq", "en"))
    assert len(seen) == 2 and "refined" in trace
    assert "llm_refined_search" in res.refinements and res.contentIds


def test_retrieval_provider_error_uses_keyword_search(fake_model):
    queue, _ = fake_model
    queue.append(bedrock.BedrockError("boom"))
    res, trace = asyncio.run(retrieval_agent.agentic_search("why is handwashing important", "en"))
    assert trace["agentSource"] == "rules" and res.contentIds


# ── tutor ──

def test_tutor_uses_valid_picks_and_rejects_others(fake_model):
    queue, _ = fake_model
    s = _session()
    s.askedQuestionIds = ["q1"]
    tag = repo().quiz_by_id["q1"]["conceptTag"]
    good = next(b["id"] for b in repo().blocks if tag in b["conceptTags"])
    queue.append({"reinforcement": [{"questionId": "q1", "contentId": good}],
                  "nextActivityContentIds": ["c999-invented"],
                  "ashaTip": {"kn": "ಉದಾಹರಣೆ ಬಳಸಿ", "en": "Ask the family where they keep old tablets and why."}})
    result, records, trace = asyncio.run(tutor_agent.run_adaptive(s, [_wrong("q1")]))
    assert result.agentSource == "llm"
    assert result.feedback[0].reinforcementContentIds == [good]
    assert "c999-invented" in trace["rejected"]
    assert result.nextActivity.contentIds and "c999-invented" not in result.nextActivity.contentIds
    assert result.ashaTip is not None
    # fixed rules still decide the score and level
    assert result.scorePercent == 0.0 and result.nextActivity.level == "easy" and records[0].correct is False


def test_tutor_tip_with_dosage_is_screened_out(fake_model):
    queue, _ = fake_model
    s = _session()
    s.askedQuestionIds = ["q1"]
    queue.append({"reinforcement": [], "nextActivityContentIds": [],
                  "ashaTip": {"kn": "", "en": "Tell them to give 500 mg twice a day."}})
    result, _, trace = asyncio.run(tutor_agent.run_adaptive(s, [_wrong("q1")]))
    assert result.ashaTip is None and trace["tipScreenedOut"] is True


# ── summary ──

def test_summary_reorders_gaps_and_screens_unsafe_text(fake_model):
    queue, _ = fake_model
    s = _session()
    s.askedQuestionIds = ["q1", "q2"]
    _, recs = tutor_agent.run(s, [_wrong("q1"), _wrong("q2")])
    s.answers = recs
    gaps = [r.conceptTag for r in recs]
    queue.append({"narrative": {"kn": "ಕುಟುಂಬ ಕಲಿತರು", "en": "The family learned what antibiotics are."},
                  "nextVisit": {"kn": "", "en": "How many tablets should she take? 2 tablets."},
                  "priorityGaps": [gaps[1], "invented-gap", gaps[0]]})
    summary, trace = asyncio.run(summary_agent.run_with_llm(s))
    assert summary.agentSource == "llm"
    assert [g.conceptTag for g in summary.remainingGaps][:2] == [gaps[1], gaps[0]]
    assert summary.narrative is not None and summary.nextVisit is None
    assert trace["screenedOut"] == ["nextVisit"]


def test_summary_falls_back_to_rules_on_provider_error(fake_model):
    queue, _ = fake_model
    queue.append(bedrock.BedrockError("timeout"))
    summary, trace = asyncio.run(summary_agent.run_with_llm(_session()))
    assert summary.agentSource == "rules" and summary.narrative is None and trace["agentSource"] == "rules"
