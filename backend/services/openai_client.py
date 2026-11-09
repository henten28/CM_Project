"""Async OpenAI Responses API adapter used by the Bedrock-compatible facade."""

import logging
from functools import lru_cache
from typing import Any, Callable, Dict, Optional, Type, TypeVar, Union

from pydantic import BaseModel

import config

log = logging.getLogger("openai")
T = TypeVar("T", bound=BaseModel)


def _mock_setting() -> str:
    value = config.OPENAI_MOCK
    if value not in {"auto", "true", "1", "yes", "false", "0", "no"}:
        raise RuntimeError("OPENAI_MOCK must be auto, true, or false")
    return value


def is_mock_mode() -> bool:
    setting = _mock_setting()
    if setting in {"true", "1", "yes"}:
        return True
    if setting in {"false", "0", "no"}:
        return False
    return not bool(config.OPENAI_API_KEY)


@lru_cache(maxsize=1)
def _client():
    if not config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required when OPENAI_MOCK=false")
    from openai import AsyncOpenAI

    return AsyncOpenAI(
        api_key=config.OPENAI_API_KEY,
        timeout=config.OPENAI_TIMEOUT_S,
        max_retries=0,
    )


def _safe_error(error: Exception) -> str:
    # SDK exception messages may contain request details. Return only the class
    # name, never raw provider text or request configuration.
    kind = type(error).__name__
    log.error("OpenAI Responses request failed (%s)", kind)
    return f"OpenAI request failed ({kind})"


def _input(prompt: str, system: Optional[str]):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


def _request_options(max_tokens: Optional[int]) -> Dict[str, Any]:
    return {
        "model": config.OPENAI_MODEL,
        "reasoning": {"effort": config.OPENAI_REASONING_EFFORT},
        "max_output_tokens": max_tokens or config.OPENAI_MAX_TOKENS,
        "store": False,
    }


async def converse(
    prompt: str,
    *,
    system: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.3,
    mock_text: str = "[mock] OpenAI is in mock mode.",
) -> str:
    del temperature  # reasoning model compatibility: do not send temperature
    if is_mock_mode():
        return mock_text
    if not config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required when OPENAI_MOCK=false")
    try:
        response = await _client().responses.create(
            **{**_request_options(max_tokens), "model": model or config.OPENAI_MODEL},
            input=_input(prompt, system),
        )
        if getattr(response, "status", None) == "incomplete":
            raise RuntimeError("incomplete response")
        text = getattr(response, "output_text", None)
        if not text:
            raise RuntimeError("empty response")
        return text
    except Exception as error:
        raise RuntimeError(_safe_error(error)) from error


async def generate_structured(
    prompt: str,
    schema: Type[T],
    *,
    system: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.0,
    mock: Union[None, Dict[str, Any], Callable[[], Dict[str, Any]]] = None,
    max_repairs: int = 1,
) -> T:
    del temperature, max_repairs  # Responses structured parsing has no repair loop.
    if is_mock_mode():
        if mock is None:
            raise RuntimeError(f"mock mode is on but no mock was given for {schema.__name__}")
        data = mock() if callable(mock) else mock
        return schema.model_validate(data)
    if not config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required when OPENAI_MOCK=false")
    try:
        response = await _client().responses.parse(
            **{**_request_options(max_tokens), "model": model or config.OPENAI_MODEL},
            input=_input(prompt, system),
            text_format=schema,
        )
        if getattr(response, "status", None) == "incomplete":
            raise RuntimeError("incomplete response")
        for item in getattr(response, "output", []) or []:
            for part in getattr(item, "content", []) or []:
                if getattr(part, "type", None) == "refusal" or getattr(part, "refusal", None):
                    raise RuntimeError("model refused structured output")
        parsed = getattr(response, "output_parsed", None)
        if parsed is None:
            raise RuntimeError("structured response was empty")
        return schema.model_validate(parsed)
    except Exception as error:
        raise RuntimeError(_safe_error(error)) from error
