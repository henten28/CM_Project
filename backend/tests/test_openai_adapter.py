import asyncio
import sys
from types import SimpleNamespace

from pydantic import BaseModel

from services import openai_client


class Result(BaseModel):
    ok: bool


def test_structured_call_uses_parse_and_safe_options(monkeypatch):
    calls = {}

    class FakeResponses:
        async def parse(self, **kwargs):
            calls.update(kwargs)
            return SimpleNamespace(status="completed", output_parsed={"ok": True}, output=[])

    monkeypatch.setattr(openai_client.config, "OPENAI_MOCK", "false")
    monkeypatch.setattr(openai_client.config, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai_client.config, "OPENAI_MODEL", "gpt-6-luna")
    monkeypatch.setattr(openai_client.config, "OPENAI_REASONING_EFFORT", "none")
    monkeypatch.setattr(openai_client, "_client", lambda: SimpleNamespace(responses=FakeResponses()))

    result = asyncio.run(openai_client.generate_structured("prompt", Result, system="system"))

    assert result == Result(ok=True)
    assert calls["model"] == "gpt-6-luna"
    assert calls["reasoning"] == {"effort": "none"}
    assert calls["max_output_tokens"] == 1024
    assert calls["store"] is False
    assert calls["text_format"] is Result


def test_missing_key_and_provider_errors_are_sanitized(monkeypatch):
    monkeypatch.setattr(openai_client.config, "OPENAI_MOCK", "false")
    monkeypatch.setattr(openai_client.config, "OPENAI_API_KEY", "")
    try:
        asyncio.run(openai_client.generate_structured("prompt", Result))
        assert False, "expected missing-key failure"
    except RuntimeError as error:
        assert str(error) == "OPENAI_API_KEY is required when OPENAI_MOCK=false"

    class FakeResponses:
        async def parse(self, **kwargs):
            raise RuntimeError("secret=do-not-leak")

    monkeypatch.setattr(openai_client.config, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai_client, "_client", lambda: SimpleNamespace(responses=FakeResponses()))
    try:
        asyncio.run(openai_client.generate_structured("prompt", Result))
        assert False, "expected sanitized provider failure"
    except RuntimeError as error:
        assert str(error) == "OpenAI request failed (RuntimeError)"
        assert "do-not-leak" not in str(error)


def test_sdk_client_disables_retries(monkeypatch):
    calls = {}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            calls.update(kwargs)

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(AsyncOpenAI=FakeAsyncOpenAI))
    monkeypatch.setattr(openai_client.config, "OPENAI_API_KEY", "test-key")
    openai_client._client.cache_clear()
    try:
        client = openai_client._client()
    finally:
        openai_client._client.cache_clear()
    assert isinstance(client, FakeAsyncOpenAI)
    assert calls["max_retries"] == 0
    assert calls["api_key"] == "test-key"
