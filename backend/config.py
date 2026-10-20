import os
from pathlib import Path

from dotenv import load_dotenv

# load backend/.env if present; variables already set in the shell win
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# model alias (see services/bedrock.py MODEL_ALIASES) or a full Bedrock model / inference profile id
BEDROCK_MODEL = os.getenv("BEDROCK_MODEL", "nova-pro")

# "auto" = mock only when boto3 finds no AWS credentials, "true" = always mock, "false" = never mock
BEDROCK_MOCK = os.getenv("BEDROCK_MOCK", "auto").strip().lower()

BEDROCK_MAX_TOKENS = int(os.getenv("BEDROCK_MAX_TOKENS", "1024"))
BEDROCK_TIMEOUT_S = int(os.getenv("BEDROCK_TIMEOUT_S", "60"))

# the only browser origin allowed to call this API
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
