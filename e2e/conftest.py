# Browser tests against a running app. Start the backend and frontend first (see README), then:
#   pip install -r e2e/requirements.txt && python -m playwright install chromium
#   pytest e2e -q
# E2E_BASE_URL overrides the app address (default http://localhost:3000).
import os
import urllib.request

import pytest
from playwright.sync_api import sync_playwright

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:3000").rstrip("/")


def _app_ready() -> bool:
    # the frontend must be up and able to reach the backend
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=5) as r:
            return b'"reachable":true' in r.read().replace(b" ", b"")
    except Exception:
        return False


@pytest.fixture(scope="session")
def base_url():
    if not _app_ready():
        pytest.skip(f"app not reachable at {BASE_URL}; start the backend and `npm run dev` first")
    return BASE_URL


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def page(browser, base_url):
    # phone-sized viewport, fresh storage per test
    ctx = browser.new_context(viewport={"width": 400, "height": 860}, base_url=base_url)
    pg = ctx.new_page()
    pg.set_default_timeout(20_000)
    yield pg
    ctx.close()
