"""Make one tiny OpenAI structured-output request when explicitly requested."""

import argparse
import asyncio
import sys

import config
from pydantic import BaseModel
from services import openai_client


class CheckResult(BaseModel):
    ok: bool


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force-live", action="store_true",
        help="send one live request (otherwise this command never contacts OpenAI)",
    )
    args = parser.parse_args()

    if not args.force_live:
        if not config.OPENAI_API_KEY:
            print("OPENAI_API_KEY is missing; no request sent.")
        elif openai_client.is_mock_mode():
            print("OpenAI mock mode is enabled; no request sent. Use --force-live to check the API.")
        else:
            print("Live mode is configured; no request sent. Use --force-live to check the API.")
        return 0
    if not config.OPENAI_API_KEY:
        print("OPENAI_API_KEY is required for --force-live.", file=sys.stderr)
        return 2
    if config.OPENAI_MOCK in {"true", "1", "yes"}:
        print("OPENAI_MOCK=true prevents live requests; set OPENAI_MOCK=false to check the API.", file=sys.stderr)
        return 2

    try:
        result = await openai_client.generate_structured(
            "Return ok=true.", CheckResult,
            system="Return the requested health check result.", max_tokens=64,
        )
    except Exception as error:
        print(f"OpenAI check failed: {error}", file=sys.stderr)
        return 1

    print(f"OpenAI check succeeded: model={config.OPENAI_MODEL} ok={result.ok}")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
