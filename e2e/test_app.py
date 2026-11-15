import re

from playwright.sync_api import Page, expect


DEMO = {"asha": ("asha", "asha123"), "asha2": ("asha2", "asha123"), "supervisor": ("supervisor", "super123")}


def sign_in(page: Page, who: str = "asha") -> None:
    # signs in through the real form; the token ends up in an httpOnly cookie
    username, password = DEMO[who]
    page.goto("/login")
    page.fill("#login-username", username)
    page.fill("#login-password", password)
    page.click("#login-submit")
    page.wait_for_url(re.compile(r"/dashboard" if who == "supervisor" else r"/$|/\?"))


def sign_out(page: Page) -> None:
    page.goto("/")  # the session page has its own compact header without the account menu
    page.click("#sign-out-btn")
    page.wait_for_selector("#sign-in-link")


def start_session(page: Page, minutes: str = "10") -> str:
    # signed-in ASHA, home page in English, default topic; returns the session id from the URL
    if not page.locator("#sign-out-btn").count():
        sign_in(page, "asha")
    page.goto("/")
    page.click("#lang-en")
    page.click(f"#time-{minutes}")
    page.click("#start-session-btn")
    page.wait_for_selector("#approve-btn")
    return re.search(r"id=([\w-]+)", page.url).group(1)


def approve(page: Page) -> None:
    page.click("#approve-btn")
    page.wait_for_selector(".content-block")


def ask(page: Page, text: str) -> None:
    page.fill("#user-message-input", text)
    page.click("#send-btn")


def go_to_quiz(page: Page) -> None:
    while page.locator("#next-block-btn").count():
        page.click("#next-block-btn")
    page.click("#start-quiz-btn")
    page.wait_for_selector("#quiz-opt-0")


def answer_current(page: Page, option: int) -> str:
    page.click(f"#quiz-opt-{option}")
    btn = page.wait_for_selector("#next-question-btn")
    return btn.inner_text()


def test_full_session_reaches_summary(page: Page):
    start_session(page)
    approve(page)
    expect(page.locator(".cb-source").first).to_contain_text("SRC-")  # verified source id shown
    go_to_quiz(page)
    for _ in range(10):  # the tutor may add questions; stop at the summary button
        label = answer_current(page, 1)  # B is correct for every question in the current bank
        page.click("#next-question-btn")
        if "Summary" in label:
            break
    expect(page.locator(".stat-grid")).to_be_visible()
    expect(page.locator(".stat-val").first).to_have_text("100%")


def test_wrong_answer_lowers_level_and_shows_reinforcement(page: Page):
    start_session(page)
    approve(page)
    go_to_quiz(page)
    answer_current(page, 0)
    expect(page.locator(".quiz-option.incorrect")).to_have_count(1)
    expect(page.get_by_text("📖").first).to_be_visible()  # reinforcement block from the retrieval agent
    expect(page.locator(".badge", has_text="easy").first).to_be_visible()


def test_unsafe_question_shows_fixed_banner_then_clears(page: Page):
    start_session(page)
    approve(page)
    ask(page, "My child has fever, what dose of amoxicillin should I give?")
    banner = page.locator(".safety-banner")
    expect(banner).to_contain_text("cannot recommend, prescribe, or suggest doses")
    box = banner.bounding_box()
    assert box and 0 <= box["y"] < 860  # pinned in view, not scrolled away
    ask(page, "Why is handwashing important?")
    expect(banner).to_have_count(0)
    expect(page.locator(".msg-bubble").last).to_contain_text("📚")  # answered from approved content


def test_urgent_question_shows_helpline(page: Page):
    start_session(page)
    approve(page)
    ask(page, "She has swelling on her face after the tablet")
    expect(page.locator(".safety-banner")).to_contain_text("104")


def test_reload_mid_quiz_resumes(page: Page):
    start_session(page, "15")
    approve(page)
    go_to_quiz(page)
    answer_current(page, 1)
    page.reload()
    expect(page.get_by_text("Session resumed")).to_be_visible()
    expect(page.locator("#quiz-opt-0")).to_be_visible()  # back on the remaining questions


def test_dashboard_lists_session_and_closes_referral(page: Page):
    sid = start_session(page)
    approve(page)
    ask(page, "Can I take my leftover antibiotics?")
    expect(page.locator(".safety-banner")).to_be_visible()

    sign_out(page)
    sign_in(page, "supervisor")
    page.goto("/dashboard")
    expect(page.locator("#evaluation-card")).to_be_visible()
    page.click("#tab-history")
    expect(page.locator(".session-history-item").first).to_contain_text("Savitha")  # who ran it
    page.click("#tab-safety")
    task = page.locator(".referral-task", has_text=sid)
    expect(task).to_contain_text("SELF_MEDICATION")
    task.get_by_role("button", name=re.compile("Mark done")).click()
    expect(page.locator(".referral-task", has_text=sid)).to_have_count(0)  # open filter hides it
    page.click("#task-filter-all")
    expect(page.locator(".referral-task", has_text=sid)).to_contain_text("Closed")


def test_settings_shows_backend_and_removes_old_keys(page: Page):
    sign_in(page, "asha")
    page.goto("/settings")
    page.evaluate("localStorage.setItem('amr_llm_config', JSON.stringify({apiKey: 'AKIA-FAKE'}))")
    page.reload()
    expect(page.locator("#backend-status")).to_contain_text("Connected")
    if page.locator("#aws-region").count():  # only shown when the provider is Bedrock
        expect(page.locator("#aws-region")).not_to_have_text("—")
    assert page.evaluate("localStorage.getItem('amr_llm_config')") is None
    expect(page.locator("input[type=password]")).to_have_count(0)  # no credential fields anywhere


def test_app_icons_exist(page: Page):
    for size in (192, 512):
        r = page.request.get(f"/icon-{size}.png")
        assert r.ok and r.headers["content-type"] == "image/png"


def test_language_choice_persists_across_pages_and_reloads(page: Page):
    sign_in(page, "asha")
    page.goto("/")
    page.click("#lang-en")
    expect(page.locator("h1").first).to_contain_text("Bridging the AMR awareness gap")
    for path, text in [("/learn", "Learning library"), ("/visits", "Household Visits"), ("/settings", "Settings")]:
        page.goto(path)
        expect(page.get_by_text(text).first).to_be_visible()
        expect(page.locator("#lang-en")).to_have_attribute("aria-pressed", "true")
    page.reload()
    expect(page.locator("#lang-en")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("document.documentElement.lang") == "en"

    # switching on any page switches everywhere
    page.click("#lang-kn")
    page.goto("/")
    expect(page.locator("h1").first).to_contain_text("ಒಂದೊಂದೇ ಮನೆಯಲ್ಲಿ AMR ಅರಿವು")
    expect(page.locator("#lang-kn")).to_have_attribute("aria-pressed", "true")


def test_profile_does_not_override_chosen_language(page: Page):
    page.goto("/")
    page.evaluate("""localStorage.setItem('amr_jagruti_profile', JSON.stringify(
        {id: 'asha-1', name: 'Test', block: 'B', district: 'Mysuru', lang: 'kn', createdAt: '', totalSessions: 0, totalVisits: 0}))""")
    page.click("#lang-en")
    page.goto("/")
    page.reload()
    expect(page.locator("#lang-en")).to_have_attribute("aria-pressed", "true")  # previously the profile reset it to Kannada


def test_text_size_persists(page: Page):
    page.goto("/")
    page.click("#text-lg")
    page.goto("/learn")
    assert page.evaluate("getComputedStyle(document.documentElement).fontSize") == "18.5px"
    page.click("#text-md")


def test_learning_library_filters_and_searches(page: Page):
    page.goto("/learn")
    page.click("#lang-en")
    cards = page.locator(".lib-card")
    expect(cards.first).to_be_visible()
    total = cards.count()
    page.click("#lib-m6")
    expect(cards.first).to_contain_text("Infection prevention")
    assert cards.count() < total
    page.click("#lib-all")
    page.fill("#lib-search", "handwashing")
    expect(cards.first).to_be_visible()
    expect(page.locator(".cb-source").first).to_contain_text("SRC-")
    page.fill("#lib-search", "zzzz-no-match")
    expect(cards).to_have_count(0)


def test_home_sections_and_ticker(page: Page):
    page.goto("/")
    page.click("#lang-en")
    expect(page.locator(".ticker-track")).to_contain_text("antibiotic", ignore_case=True)  # reviewed key messages
    expect(page.locator(".step4")).to_have_count(4)
    expect(page.locator(".service-card")).to_have_count(3)  # signed out: ASHA, supervisor, household
    expect(page.locator(".site-footer")).to_contain_text("Not an official government service")


# ── sign-in and role separation (testing doc items) ──

def test_signed_out_visitor_is_sent_to_sign_in(page: Page):
    for path in ("/visits", "/session", "/dashboard", "/quiz-builder", "/profile"):
        page.goto(path)
        expect(page).to_have_url(re.compile(r"/login\?next="))
    page.goto("/quiz")  # household learners need no account
    expect(page).to_have_url(re.compile(r"/quiz$"))


def test_asha_cannot_open_the_supervisor_dashboard(page: Page):
    sign_in(page, "asha")
    expect(page.get_by_role("navigation", name="Main")).not_to_contain_text("Dashboard")
    page.goto("/dashboard")
    expect(page).to_have_url(re.compile(r"denied=%2Fdashboard"))
    expect(page.locator(".notice-bar")).to_be_visible()
    assert page.request.get("/api/dashboard/sessions").status == 403


def test_supervisor_cannot_run_sessions(page: Page):
    sign_in(page, "supervisor")
    page.goto("/")
    expect(page).to_have_url(re.compile(r"/dashboard"))
    page.goto("/quiz-builder")
    expect(page).to_have_url(re.compile(r"/dashboard\?denied="))
    assert page.request.post("/api/session/start", data={"topic": "amr", "durationMinutes": 5}).status == 403


def test_visit_linked_to_session_takes_the_household_score(page: Page):
    start_session(page)
    approve(page)
    go_to_quiz(page)
    for _ in range(10):
        label = answer_current(page, 1)
        page.click("#next-question-btn")
        if "Summary" in label:
            break
    page.click("#log-visit-btn")
    expect(page).to_have_url(re.compile(r"/visits\?session="))
    page.fill("#visit-family", "House 7")
    page.fill("#visit-village", "Hunsur")
    expect(page.get_by_text("Quiz score the household earned together")).to_contain_text("100%")
    page.click("#submit-visit-btn")
    expect(page.locator(".visit-card").first).to_contain_text("House 7")
    expect(page.locator(".visit-card").first.locator(".score-pill")).to_have_text("100%")


def test_quiz_question_text_sits_inside_its_card(page: Page):
    lst = page.request.get("/api/quizzes").json()
    if not lst:
        import pytest
        pytest.skip("no published quiz yet")
    q = lst[0]
    page.goto(f"/quiz?id={q['id']}&version={q['version']}")
    page.get_by_role("button", name=re.compile("Start this quiz")).click()
    card = page.locator(".ql-question").first
    legend = card.locator("legend")
    cb, lb = card.bounding_box(), legend.bounding_box()
    assert lb["y"] >= cb["y"] + 4  # previously the legend sat on the card's top border
