import asyncio
import logging
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional, Type, TypeVar, Union

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, ValidationError

import config

log = logging.getLogger("bedrock")

T = TypeVar("T", bound=BaseModel)

# short names -> Bedrock ids. the "{geo}." prefix makes these cross-region inference profiles
MODEL_ALIASES = {
    "claude-3.5-sonnet": "{geo}.anthropic.claude-3-5-sonnet-20241022-v2:0",  # EOL on Bedrock since Mar 2026, kept for old accounts
    "claude-sonnet-4": "{geo}.anthropic.claude-sonnet-4-20250514-v1:0",
    "nova-pro": "{geo}.amazon.nova-pro-v1:0",
    "nova-lite": "{geo}.amazon.nova-lite-v1:0",
    "nova-micro": "{geo}.amazon.nova-micro-v1:0",
}

TOOL_NAME = "emit_structured_output"


class BedrockError(RuntimeError):
    pass


# ── client and mode ──────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _client():
    # credentials come from the standard boto3 chain (env vars, ~/.aws, IAM role) and never leave this process
    return boto3.client(
        "bedrock-runtime",
        region_name=config.AWS_REGION,
        config=Config(
            retries={"max_attempts": 4, "mode": "adaptive"},  # backs off on ThrottlingException
            read_timeout=config.BEDROCK_TIMEOUT_S,
            connect_timeout=10,
        ),
    )


@lru_cache(maxsize=1)
def is_mock_mode() -> bool:
    if config.BEDROCK_MOCK in ("1", "true", "yes"):
        return True
    if config.BEDROCK_MOCK in ("0", "false", "no"):
        return False
    has_creds = boto3.Session().get_credentials() is not None  # "auto"
    if not has_creds:
        log.warning("no AWS credentials found, Bedrock running in mock mode")
    return not has_creds


def resolve_model(model: Optional[str] = None) -> str:
    name = model or config.BEDROCK_MODEL
    if name not in MODEL_ALIASES:
        return name  # already a full model id or inference profile id
    region = config.AWS_REGION
    geo = "eu" if region.startswith("eu-") else "apac" if region.startswith("ap-") else "us"
    return MODEL_ALIASES[name].format(geo=geo)


# ── helpers ──────────────────────────────────────────────────────────────────

def _inline_refs(schema: Dict[str, Any]) -> Dict[str, Any]:
    # pydantic emits $defs/$ref; inline them so every model family gets a flat schema
    defs = schema.pop("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(dict(defs[node["$ref"].split("/")[-1]]))
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def _tool_choice(model_id: str) -> Dict[str, Any]:
    # Claude supports forcing a named tool; "any" with a single tool forces it on other families
    if "anthropic." in model_id:
        return {"tool": {"name": TOOL_NAME}}
    return {"any": {}}


async def _call_converse(**kwargs) -> Dict[str, Any]:
    try:
        # boto3 is synchronous; run it in a worker thread so the event loop stays free
        return await asyncio.to_thread(_client().converse, **kwargs)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "ClientError")
        log.error("bedrock converse failed: %s", code)
        raise BedrockError(f"Bedrock request failed ({code})") from e
    except BotoCoreError as e:
        log.error("bedrock converse failed: %s", type(e).__name__)
        raise BedrockError(f"Bedrock request failed ({type(e).__name__})") from e


def _message_text(message: Dict[str, Any]) -> str:
    return "".join(block.get("text", "") for block in message.get("content", []))


# ── public API ───────────────────────────────────────────────────────────────

async def converse(
    prompt: str,
    *,
    system: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.3,
    mock_text: str = "[mock] Bedrock is in mock mode.",
) -> str:
    if is_mock_mode():
        return mock_text

    kwargs: Dict[str, Any] = {
        "modelId": resolve_model(model),
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": max_tokens or config.BEDROCK_MAX_TOKENS, "temperature": temperature},
    }
    if system:
        kwargs["system"] = [{"text": system}]
    resp = await _call_converse(**kwargs)
    return _message_text(resp["output"]["message"])


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
    if is_mock_mode():
        if mock is None:
            raise BedrockError(f"mock mode is on but no mock was given for {schema.__name__}")
        data = mock() if callable(mock) else mock
        return schema.model_validate(data)  # mocks go through the same validation as real output

    model_id = resolve_model(model)
    tool_spec = {
        "toolSpec": {
            "name": TOOL_NAME,
            "description": f"Return the answer as a {schema.__name__} JSON object.",
            "inputSchema": {"json": _inline_refs(schema.model_json_schema())},
        }
    }
    sys_text = (system + "\n\n" if system else "") + f"Always answer by calling the {TOOL_NAME} tool."
    messages: List[Dict[str, Any]] = [{"role": "user", "content": [{"text": prompt}]}]

    last_err: Optional[Exception] = None
    for attempt in range(max_repairs + 1):
        resp = await _call_converse(
            modelId=model_id,
            system=[{"text": sys_text}],
            messages=messages,
            toolConfig={"tools": [tool_spec], "toolChoice": _tool_choice(model_id)},
            inferenceConfig={"maxTokens": max_tokens or config.BEDROCK_MAX_TOKENS, "temperature": temperature},
        )
        message = resp["output"]["message"]
        tool_use = next((b["toolUse"] for b in message.get("content", []) if "toolUse" in b), None)

        try:
            if tool_use is not None:
                return schema.model_validate(tool_use["input"])
            # model answered in plain text; accept it only if it is valid JSON for the schema
            return schema.model_validate_json(_message_text(message).strip())
        except (ValidationError, ValueError) as e:
            last_err = e
            log.warning("structured output invalid (attempt %d): %s", attempt + 1, e)
            if attempt == max_repairs:
                break
            # send the validation error back once so the model can correct itself
            messages.append(message)
            fix = f"Your output failed validation:\n{e}\nCall {TOOL_NAME} again with corrected JSON."
            if tool_use is not None:
                messages.append({"role": "user", "content": [{"toolResult": {
                    "toolUseId": tool_use["toolUseId"], "status": "error", "content": [{"text": fix}],
                }}]})
            else:
                messages.append({"role": "user", "content": [{"text": fix}]})

    raise BedrockError(f"model output did not match {schema.__name__}: {last_err}")


def status() -> Dict[str, Any]:
    # safe to expose: never includes credentials
    return {"mock": is_mock_mode(), "region": config.AWS_REGION, "model": resolve_model()}
