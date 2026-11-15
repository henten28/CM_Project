import os
import sys
import tempfile
from pathlib import Path

# run against backend/ as the import root, always in mock mode
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["BEDROCK_MOCK"] = "true"
os.environ["LLM_PROVIDER"] = "bedrock"
os.environ["SEED_DEMO_USERS"] = "true"
# tests use a throwaway SQLite file, never the real backend/amr_jagruti.db
_TMP_DB = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

import pytest
from fastapi.testclient import TestClient

DEMO = {"asha": ("asha", "asha123"), "supervisor": ("supervisor", "super123")}


def token_for(client: TestClient, role: str) -> str:
    username, password = DEMO[role]
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


class SignedInClient(TestClient):
    """Signs in for real: the demo ASHA for session routes, the demo supervisor for /dashboard."""

    def __init__(self, app):
        super().__init__(app)
        self._tokens = {}

    def _token(self, role: str) -> str:
        if role not in self._tokens:
            self._tokens[role] = token_for(TestClient(self.app), role)
        return self._tokens[role]

    def request(self, method, url, *args, **kwargs):
        path = str(url)
        if not path.startswith("/auth/"):
            role = "supervisor" if path.startswith("/dashboard") else "asha"
            headers = dict(kwargs.pop("headers", None) or {})
            headers.setdefault("Authorization", f"Bearer {self._token(role)}")
            kwargs["headers"] = headers
        return super().request(method, url, *args, **kwargs)


@pytest.fixture
def client():
    import main
    return SignedInClient(main.app)


@pytest.fixture
def anon():
    # no sign-in at all, as a household learner would be
    import main
    return TestClient(main.app)


@pytest.fixture
def started(client):
    # helper: start a session and return (client, response json)
    def _start(topic="antibiotics", duration=10, lang="kn", gaps=None):
        r = client.post("/session/start", json={"topic": topic, "durationMinutes": duration, "lang": lang,
                                               "priorGaps": gaps or []})
        assert r.status_code == 200, r.text
        return r.json()
    return _start
