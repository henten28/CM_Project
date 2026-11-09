import os
from pathlib import Path

from dotenv import load_dotenv

# load backend/.env if present; variables already set in the shell win
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Provider used by the stable services.bedrock facade. Bedrock remains available
# for existing deployments and can be selected with LLM_PROVIDER=bedrock.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").strip().lower()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna")
OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "1024"))
OPENAI_TIMEOUT_S = int(os.getenv("OPENAI_TIMEOUT_S", "60"))
OPENAI_MOCK = os.getenv("OPENAI_MOCK", "auto").strip().lower()
OPENAI_REASONING_EFFORT = os.getenv("OPENAI_REASONING_EFFORT", "none").strip().lower()

# model alias (see services/bedrock.py MODEL_ALIASES) or a full Bedrock model / inference profile id
BEDROCK_MODEL = os.getenv("BEDROCK_MODEL", "nova-pro")

# "auto" = mock only when boto3 finds no AWS credentials, "true" = always mock, "false" = never mock
BEDROCK_MOCK = os.getenv("BEDROCK_MOCK", "auto").strip().lower()

BEDROCK_MAX_TOKENS = int(os.getenv("BEDROCK_MAX_TOKENS", "1024"))
BEDROCK_TIMEOUT_S = int(os.getenv("BEDROCK_TIMEOUT_S", "60"))

# SQLAlchemy URL; a local SQLite file by default, a postgresql:// URL works too
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent / 'amr_jagruti.db'}")

# the only browser origin allowed to call this API
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
