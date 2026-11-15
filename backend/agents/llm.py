"""Shared LLM access for the specialist agents.

Every agent uses the same provider adapter (services.bedrock, which routes to OpenAI by default) with its own
system prompt and output schema. The model may only *select* among ids the backend offers and write short
ASHA-facing notes; ordinary code validates every choice, and the deterministic safety controller screens every
generated sentence. When the model is unavailable or its output is rejected, agents fall back to their rules.
"""

import logging
from typing import Optional, Tuple, Type, TypeVar

from pydantic import BaseModel

from agents import safety_controller
from agents.models import Bilingual
from services import bedrock

log = logging.getLogger("agents.llm")
T = TypeVar("T", bound=BaseModel)

COMMON_RULES = (
    "You are part of AMR Jagruti, an education tool that helps ASHA workers teach households about antibiotics "
    "and antimicrobial resistance. Never diagnose, never name a medicine to take, never give doses, and never tell "
    "anyone to start or stop a medicine. Only use ids that appear in the lists you are given."
)


def enabled() -> bool:
    try:
        return not bedrock.is_mock_mode()
    except bedrock.BedrockError:
        return False


async def call(agent: str, prompt: str, schema: Type[T], system: str,
               max_tokens: int = 700) -> Tuple[Optional[T], str]:
    """Returns (output, note). output is None in mock mode or on any provider error."""
    if not enabled():
        return None, "mock mode: rules"
    try:
        out = await bedrock.generate_structured(prompt, schema, system=f"{COMMON_RULES}\n\n{system}",
                                                max_tokens=max_tokens)
        return out, "llm"
    except bedrock.BedrockError as e:
        log.warning("%s LLM call failed, using rules: %s", agent, e)
        return None, f"llm_error: {e}"


def safe_text(*texts: str) -> bool:
    # generated sentences must not read like medical advice; the same rules that guard user questions apply
    return all(not safety_controller.classify(t).triggered for t in texts if t)


def safe_bilingual(b: Optional[Bilingual]) -> Optional[Bilingual]:
    if b is None or not b.en.strip():
        return None
    return b if safe_text(b.en, b.kn) else None
