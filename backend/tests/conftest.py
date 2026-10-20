import os
import sys
from pathlib import Path

# run against backend/ as the import root, always in mock mode
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["BEDROCK_MOCK"] = "true"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
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
