# AMR Jagruti

A multi-agent, Kannada-first learning app that helps ASHA workers run short antimicrobial resistance (AMR) sessions in households. Built as an academic prototype for the Computing in Medicine course.

AMR Jagruti is an education tool. It does not diagnose, prescribe, suggest doses, or tell anyone to start or stop a medicine. Personal or urgent medical questions get fixed referral messages written by the team, never AI-generated text.

## Contents

1. [Quickstart](#quickstart)
2. [How it works](#how-it-works)
3. [Project structure](#project-structure)
4. [First-time setup](#first-time-setup)
5. [Running the app](#running-the-app)
6. [Trying it out](#trying-it-out)
7. [Using OpenAI](#using-openai)
8. [Using Amazon Bedrock](#using-amazon-bedrock)
9. [API reference](#api-reference)
10. [Safety controller](#safety-controller)
11. [Database](#database)
12. [Supervisor dashboard](#supervisor-dashboard)
13. [Tests and evaluation](#tests-and-evaluation)
14. [Adding content](#adding-content)
15. [What has been built so far](#what-has-been-built-so-far)
16. [Known limitations and next steps](#known-limitations-and-next-steps)

## Quickstart

Requirements: Node.js 20+, Python 3.10+, and Git. The default demo needs no AWS credentials or Bedrock packages. With an OpenAI key, only the planner calls OpenAI; retrieval, tutor, summary and safety use approved content and deterministic rules. Without an OpenAI key, the planner uses local mock mode.

```bash
git clone https://github.com/henten28/CM_Project.git && cd CM_Project
npm ci
cd backend && python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
cd ..
```

To use OpenAI, set `OPENAI_API_KEY` in `backend/.env` on the server, then restart the backend. Never enter the key in the browser or commit `.env`. With `OPENAI_MOCK=auto`, a missing key selects mock mode; `OPENAI_MOCK=true` always uses mock mode, while `OPENAI_MOCK=false` requires a key. The default `OPENAI_MAX_TOKENS=1024` and `OPENAI_REASONING_EFFORT=none` keep requests bounded; the adapter does not retry requests automatically. Mock mode makes no model call.

Start the backend and frontend in two terminals as described in [Running the app](#running-the-app). The Settings page's **Connected** status means the backend responds; it does not validate an OpenAI key or contact the provider. `/health` reports provider configuration and local mode only; it does not ping the provider. An optional live adapter check is `cd backend && python check_openai.py --force-live`; it makes one structured API request and may incur provider usage when explicitly run with a key.

## How it works

A session follows the workflow in Figure 1 of the project proposal:

1. **Start**: the ASHA worker picks a topic, a language (Kannada, English or Hindi) and a duration (5, 10 or 15 minutes).
2. **Planning agent**: builds a lesson plan from approved content blocks that fits the time, putting the learner's earlier gaps first.
3. **ASHA review**: the ASHA worker approves the plan (or edits it through the API).
4. **Retrieval agent**: returns the exact approved content and its verified sources.
5. **Tutor agent**: runs a checkpoint quiz. Fixed rules score each answer and set the next activity level:
   - 80% or higher: hard (case study)
   - 40% to 79%: medium (guided practice)
   - below 40%: easy (recap)

   Each wrong answer gets the reviewed explanation plus a reinforcement block on that concept.
6. **Summary agent**: records topics covered, remaining gaps, follow-up tasks and referral tasks.

The **safety controller** runs throughout. Every free-text question, typed or spoken, is checked by deterministic rules before any agent sees it. If a rule matches, the agent's output is replaced with a fixed referral message, and a simulated referral task is logged.

The **orchestrator** passes results between agents, validates every agent output against the content repository, and writes each handoff to an audit log.

```
Browser (Next.js PWA)
   |  calls only this app's own /api routes
   v
Next.js API routes  -- forward server-side -->  FastAPI backend (port 8000)
                                                   |- orchestrator + audit log
                                                   |- planning, retrieval, tutor, summary agents
                                                   |- safety controller (rules only)
                                                   |- content/modules.json (versioned, reviewed)
                                                   |- SQLite database: sessions, referral tasks, audit log
                                                   '- OpenAI planner (default; mock mode without a key), or Amazon Bedrock
```

Provider credentials exist only on the backend server. The browser never sees them, and nothing sensitive is stored in localStorage.

## Project structure

```
CM_Project/
|- app/                         Next.js pages (App Router)
|  |- page.tsx                  home: hero, start a session, how it works, services, live figures, helplines
|  |- learn/page.tsx            learning library: every approved lesson, filter, search, listen
|  |- session/page.tsx          the session: plan review, lessons, quiz, summary, voice
|  |- settings/page.tsx         backend connection status (provider, model, mode)
|  |- dashboard/page.tsx        supervisor dashboard: sessions, referral tasks, evaluation results
|  |- profile/ visits/ certificate/
|  '- api/
|     |- session/[action]/route.ts   proxy to the backend /session/* endpoints
|     |- dashboard/[...path]/route.ts proxy to the backend /dashboard/* endpoints
|     |- content/route.ts             proxy to the backend /content (approved lessons)
|     |- health/route.ts             proxy to the backend /health
|     '- session/route.ts, safety/route.ts   old mock routes, no longer used by the session flow
|- components/
|  |- SiteChrome.tsx           shared header (text size, language), navigation bar, key-message ticker, footer
|  '- PrefsApplier.tsx         applies the saved language and text size to the page
|- lib/
|  |- prefs.ts                 language and text-size preference, shared by every page
|  |- api-client.ts            typed client the pages use to call /api/*
|  |- backend.ts               server-only forwarder (reads BACKEND_URL)
|  '- agents/, safety.ts, ...  original TypeScript mock agents (kept, now unused by the session flow)
|- public/                     PWA manifest, service worker, app icons
|  '- img/                     original SVG illustrations (hero, one per module, session steps)
|- e2e/                        Playwright browser tests (pytest)
'- backend/                    FastAPI backend
   |- main.py                  app entry point, CORS, /health
   |- config.py                environment variables, mock mode, database URL
   |- db.py                    SQLAlchemy models and queries (SQLite by default)
   |- api/session.py           /session/start, /session/step, /session/complete, /session/{id}
   |- api/dashboard.py         /dashboard/sessions, /dashboard/tasks, /dashboard/evaluation
   |- agents/
   |  |- orchestrator.py       session state, flow rules, audit log
   |  |- planning_agent.py
   |  |- retrieval_agent.py
   |  |- tutor_agent.py
   |  |- summary_agent.py
   |  |- safety_controller.py
   |  |- content.py            loads the content repository
   |  '- models.py             Pydantic models for every agent input and output
   |- services/                  OpenAI and Bedrock structured-output adapters
   |- content/modules.json     versioned content, quiz bank, source IDs, follow-up texts
   |- eval/                    evaluation scenarios, runner and latest report
   |- tests/                   pytest tests
   |- requirements.txt, requirements-dev.txt
   '- .env.example
```

## First-time setup

### Requirements

- **Node.js 20 or newer**: check with `node --version`.
- **Python 3.10 or newer**: check with `python3 --version`.
- **Git**, if you are cloning the repository.

### 1. Get the code

```bash
git clone https://github.com/henten28/CM_Project.git
cd CM_Project
```

### 2. Install the frontend

```bash
npm ci
```

### 3. Install the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Configure the backend

Copy the example file and set `OPENAI_API_KEY` there if you want the planning agent to use OpenAI. With the default `OPENAI_MOCK=auto`, a missing key selects mock mode, which uses the local rule-based planner and needs no provider account.

```bash
cp backend/.env.example backend/.env
```

Keep the key in `backend/.env`; the frontend never reads it. The frontend reads one optional variable, `BACKEND_URL`, which defaults to `http://127.0.0.1:8000`. Set it in `.env.local` at the project root only if the backend runs somewhere else.

## Running the app

The app needs two terminals running at the same time.

**Terminal 1: backend**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Wait for `Application startup complete`.

**Terminal 2: frontend**

```bash
npm run dev
```

Then open:

- the app: http://localhost:3000
- backend status: http://localhost:3000/settings (should say Connected)
- interactive API docs: http://localhost:8000/docs

**On a phone:** connect it to the same Wi-Fi and open the Network address that `npm run dev` prints, for example `http://192.168.x.x:3000`. The phone does not need to reach port 8000, because the Next.js server forwards every call.

To stop either server, press `Ctrl+C` in its terminal. If a port is already in use, an old server is still running; close it or choose another port.

**After pulling new changes,** rerun `pip install -r requirements.txt` in `backend/` and `npm ci` in the root, in case dependencies changed.

## Trying it out

**Language and text size.** Choose ಕನ್ನಡ, English or हिंदी and A−, A or A+ in the bar at the top of any page. The choice is saved in the browser and stays on every page, and after reloads, until you change it. Saving a profile with a preferred language also sets it.

A five-minute demo that covers every part of the system:

1. **Start a session.** On the home page, choose ASHA worker, topic "What are antibiotics?", 10 minutes, then Start.
2. **Review the plan.** Check the lesson plan and press Approve.
3. **Read the lessons.** Go through the content cards. Press Listen to hear one read aloud. Each card shows its source ID and version.
4. **Ask questions** in the chat box, typed or with the microphone button:

   | Question | Expected result |
   |---|---|
   | Why is handwashing important? | Answer from approved content, with its source |
   | My child has fever, what should I do? | Referral banner (personal health question) |
   | What dose of amoxicillin should I give? | Banner (no medicines or doses) |
   | Can I take my leftover antibiotics? | Banner (no self-medication advice) |
   | She has swelling on her face after the tablet | Urgent banner telling them to call 104 |

5. **Take the quiz.** In the current quiz bank the correct answer is always B.
   - Answer B every time: the level rises to hard.
   - Answer A every time: the level drops to easy, and each wrong answer shows an explanation plus a reinforcement card.
6. **Read the summary.** It shows the score, topics covered, gaps with follow-up tasks, and the referral tasks logged in step 4.
7. **Reload mid-session.** Refresh the page during the quiz: the session resumes where it was.
8. **Browse the learning library** at http://localhost:3000/learn: filter by module, search in Kannada or English, and press 🔊 to listen.
9. **Open the supervisor dashboard** at http://localhost:3000/dashboard. Your session appears under History, and the referral tasks from step 4 are under Safety Log, where they can be marked done.
10. **Check the audit log.** At http://localhost:8000/docs, call `GET /session/{session_id}` to see every agent handoff.

## Using OpenAI

OpenAI is the default optional planning provider. Only the planning agent uses the model; retrieval, tutor, summary and safety use approved content and deterministic rules. Planning output is schema-validated and checked against the approved content before use; invalid output falls back to the rule-based plan.

1. Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY` in `backend/.env`.
2. Optionally set `OPENAI_MODEL` (default `gpt-6-luna`), `OPENAI_MAX_TOKENS` (default `1024`), `OPENAI_TIMEOUT_S` (default `60`), and `OPENAI_REASONING_EFFORT` (default `none`).
3. Leave `OPENAI_MOCK=auto` to use mock mode when no key is configured; set it to `true` to always use mock mode, or `false` to require a key. Restart the backend after changing configuration.

For a single live adapter check, run `cd backend && python check_openai.py --force-live` with a key configured. It sends one small structured request and may incur provider usage. The backend does not retry requests automatically. See the [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) for model details.

## Using Amazon Bedrock

To use Bedrock instead of the default OpenAI provider:

1. Get access to a Bedrock model in your AWS account (for example Amazon Nova Pro).
2. Give the backend credentials in the standard AWS way: `aws configure`, `AWS_PROFILE`, or an IAM role. Do not put credentials in the frontend or in any `NEXT_PUBLIC_*` variable.
3. From the `backend/` directory, install the optional Bedrock dependencies:
   ```bash
   pip install -r requirements-bedrock.txt
   ```
4. In `backend/.env`, set:
   ```
   LLM_PROVIDER=bedrock
   AWS_REGION=us-east-1
   BEDROCK_MODEL=nova-pro
   BEDROCK_MOCK=auto
   ```
5. Restart the backend. The Settings page reports the configured provider, model and (for Bedrock) region. Its Connected indicator only means the backend is reachable; it does not ping the provider.

**Model aliases:**
- `nova-pro` (default), `nova-lite`, `nova-micro`
- `claude-sonnet-4`
- `claude-3.5-sonnet`: reached end of life on Bedrock in March 2026, kept only for older accounts
- You can also pass a full model ID or inference profile ID.

To check that a model is still active:

```bash
aws bedrock get-foundation-model --model-identifier amazon.nova-pro-v1:0 --query modelDetails.modelLifecycle
```

**How the model is used:** only the planning agent calls it. Its output must pass Pydantic schema validation and backend checks: every content ID must exist and belong to its module, and the plan must fit the time. If the output fails, the backend falls back to the rule-based plan and logs why. The retrieval, tutor, summary and safety components are deterministic.

## API reference

The browser calls the Next.js routes on the left; they forward to the backend routes on the right.

| Next.js route | Backend route | Purpose |
|---|---|---|
| `POST /api/session/start` | `POST /session/start` | Create a session and lesson plan |
| `POST /api/session/step` | `POST /session/step` | `approve`, `answer`, `ask` or `resume` |
| `POST /api/session/complete` | `POST /session/complete` | Produce the summary |
| `GET /api/session/{id}` | `GET /session/{id}` | Full session record with audit log |
| `GET /api/health` | `GET /health` | Backend status, configured provider, mock mode, model and Bedrock region when relevant |
| `GET /api/dashboard/sessions` | `GET /dashboard/sessions` | One summary row per session, newest first |
| `GET /api/dashboard/tasks?status=open` | `GET /dashboard/tasks` | Referral tasks (`open`, `closed` or `all`) |
| `POST /api/dashboard/tasks/{id}/close` | `POST /dashboard/tasks/{id}/close` | Mark a referral task done |
| `GET /api/dashboard/evaluation` | `GET /dashboard/evaluation` | Latest evaluation report, or `null` |
| `GET /api/content` | `GET /content` | Approved lessons by module, sources, and key messages |

### Example requests

Start a session:
```json
{"topic": "antibiotics", "durationMinutes": 10, "lang": "kn", "priorGaps": ["sharing"]}
```

Approve the plan (optionally with an edited list of content IDs):
```json
{"sessionId": "sess-...", "action": "approve"}
{"sessionId": "sess-...", "action": "approve", "editedContentIds": ["c001", "c007"]}
```

Answer quiz questions:
```json
{"sessionId": "sess-...", "action": "answer", "answers": [{"questionId": "q1", "selectedIndex": 1}]}
```

Ask a question:
```json
{"sessionId": "sess-...", "action": "ask", "text": "Why is handwashing important?"}
```

Resume after a page reload (returns the lesson content, unanswered questions and progress):
```json
{"sessionId": "sess-...", "action": "resume"}
```

### Session states

`AWAITING_APPROVAL` → `IN_PROGRESS` → `COMPLETED`. A session goes to `SAFETY_HOLD` if the start topic itself triggers the safety controller; it can then only be completed, which records the referral.

### Status codes

- `404`: unknown session
- `409`: action not allowed in the current state (for example answering before approval)
- `422`: invalid input
- `502`: configured provider request error
- `503`: the frontend cannot reach the backend

## Safety controller

`backend/agents/safety_controller.py` uses regular expressions and phrase lists only. It never calls a model.

**Categories, in priority order:**

| Category | Examples | Response |
|---|---|---|
| `URGENT` | breathing difficulty, chest pain, unconsciousness, reaction after a medicine | Fixed message with helpline 104 |
| `DOSAGE` | dose, mg, how many tablets, prescribe | Fixed message: no medicines or doses |
| `SELF_MEDICATION` | can I take or give, leftover medicine, without prescription, stopping a course | Fixed message: ask the ANM or doctor |
| `PERSONAL_MEDICAL` | my child has fever, I am pregnant | Fixed message: consult the ANM or doctor |

**When a rule matches:**
- No agent answer is shown.
- The session page shows a fixed banner, pinned at the top, with a listen button.
- A simulated escalation task is saved. It stores only the category and rule ID, never the person's words.

**Message sources:**
- Kannada and English messages are copied word for word from the team's original `lib/safety.ts`.
- Hindi messages and Hindi trigger phrases are new and **need review by a native speaker** before field use.

## Database

Sessions are stored with SQLAlchemy in a SQLite file, `backend/amr_jagruti.db`, created automatically the first time the backend runs. Nothing needs installing or signing up for. The file is gitignored, so each person has their own local data.

| Table | Contents |
|---|---|
| `sessions` | One row per session: state, topic, language, duration, and the rest of the record as JSON |
| `referral_tasks` | Simulated referrals from the safety controller: category, rule, action, open or closed |
| `audit_log` | Every agent handoff, append-only, in order |

Sessions survive a backend restart, and a page reload resumes the session where it was.

To use a hosted database later (for example Amazon RDS for PostgreSQL), set `DATABASE_URL` in `backend/.env`, for example `postgresql+psycopg://user:password@host/dbname`, and install that database's driver. Tables are created on first use; there are no migrations yet. To start fresh locally, stop the backend and delete `amr_jagruti.db`.

## Supervisor dashboard

http://localhost:3000/dashboard reads from the backend:

- **Overview:** session counts, completion, safety routing, plan validity and average score, plus the latest evaluation report.
- **Charts:** scores by topic and over time, score distribution, sessions by language.
- **Safety Log:** referral tasks with category, rule and recommended action. Supervisors mark them done. Only the category and rule are stored, never the person's words.
- **History:** every session with its score, gaps and plan status. Download CSV exports the same rows.
- **Coverage Map:** district coverage, still kept in the browser only.

## Tests and evaluation

### Backend tests

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

66 tests, all in mock mode, each run against a throwaway database. They cover the session flow, plans fitting 5, 10 and 15 minutes, prior gaps, rejection of invalid model plans, retrieval refinement, the score thresholds, ASHA plan edits, safety routing in English, Kannada and Hindi, questions that must not trigger the safety controller, referral privacy, the audit log, persistence across a restart, resume, the dashboard endpoints, the content repository checks, and the evaluation scenarios.

### Evaluation (proposal section 6)

```bash
cd backend
python -m eval.run_eval
```

This runs the 30 predefined scenarios in `eval/scenarios.json` against a throwaway database and writes `eval/report.json` and `eval/report.md`. The dashboard shows the latest report.

| Group | Scenarios | What is checked |
|---|---|---|
| Session flow and branching | S01 to S08 | Full sessions across topics, durations, languages and answer patterns; the level after the quiz; gaps in the summary |
| Safety routing | F01 to F13 | 10 medical questions in three languages routed to the right category, 3 teaching questions left alone |
| Invalid AI output | A01 to A05 | Invented content, over-time plans, wrong modules and provider errors fall back to the rule-based plan; a valid model plan is accepted |
| Persistence and state | P01 to P04 | Restart, resume, out-of-order requests, unsafe start topics |

It reports the four metrics from the proposal: test pass rate, medical questions routed to the correct safety category, AI lesson plans passing validation, and full sessions completed without manual fixes. The AI plan metric requires a configured live provider, so it shows "not measured" in mock mode. Run the evaluation again with OpenAI or Bedrock configured to measure it. The last recorded mock-mode run passed all 30 scenarios.

### Browser tests (Playwright)

Start the backend and frontend as in [Running the app](#running-the-app), then from the project root:

```bash
pip install -r e2e/requirements.txt
python -m playwright install chromium
pytest e2e -q
```

13 tests drive the app in a phone-sized Chromium window: a full session to the summary, a wrong answer lowering the level, the safety banner, the urgent helpline, resume after reload, the dashboard and closing a referral, the settings page, the app icons, language persistence across pages and reloads, text size, the learning library, and the home page sections. The tests create sessions in your local database. They skip themselves if the app is not running.

## Adding content

All lesson content lives in `backend/content/modules.json`. To add a content block, copy an existing one and fill in every field:

- `id`: a new unique id, for example `c016`
- `moduleId`: an existing module (`m1` to `m7`)
- `title` and `body`: both `kn` (Kannada script) and `en`
- `conceptTags`, `difficulty` (`basic`, `intermediate` or `advanced`) and `estimatedMinutes`
- `sourceId`: an entry in `sources`; add a new source there first if needed
- `version`: start at 1 and increase it whenever the text changes
- `reviewStatus`: `draft` until a team member has checked the medical accuracy and a Kannada speaker has checked the language, then `approved`

Agents only ever see `approved` items. Raise `contentVersion` at the top of the file when you change content. Then run `pytest -q` in `backend/`: `tests/test_content.py` fails with a clear message if a field is missing, a source or module does not exist, the Kannada text is missing, or a quiz question has no approved block for reinforcement.

Only add public-awareness material (NCDC, NAP-AMR 2.0, WHO awareness messages, NHM ASHA training modules). Never add content with medicine names and doses, such as treatment guidelines.

## What has been built so far

### Backend (new, `backend/`)

- **Bedrock integration (`services/bedrock.py`)**
  - Async wrapper around the Bedrock Converse API with adaptive retries.
  - Structured JSON output: the model is forced to call a single tool whose input schema is a Pydantic model, and the result is validated with one automatic repair attempt.
  - Mock mode when no AWS credentials are found.
  - Error messages never include credentials.
- **Five agents and an orchestrator**, as described above.
- **Content repository (`content/modules.json`)**
  - Generated from the team's original TypeScript content, so all Kannada and English medical text is the team's own reviewed wording.
  - Adds content version 2026.10.0, source IDs (`SRC-NCDC-AMR`, `SRC-NAP-AMR-2`, `SRC-KA-SAMASTA`), per-item versions and review status.
  - Agents only see items marked `approved`.
- **FastAPI router (`api/session.py`)** tying the pipeline together.
- **Scenario tests (`tests/`).**

### Frontend changes

- **`lib/api-client.ts` and the `/api/session/*` and `/api/health` proxy routes** connect the app to the backend.
- **Session page**
  - Uses the backend for every step instead of the TypeScript mock agents.
  - Shows the backend's fixed safety banner and sends spoken questions through the same safety check.
  - Reads lessons, questions, explanations and reinforcement content aloud.
  - Shows the tutor agent's difficulty level.
  - Never receives the correct quiz answers.
- **Settings page**
  - The API key, AWS token and endpoint inputs are removed and replaced by a backend status check.
  - It also deletes the old `amr_llm_config` entry from the browser, so previously typed keys are removed.
- **Home page**: session lengths are now 5, 10 or 15 minutes to match the proposal, and earlier quiz gaps are sent to the planning agent.

### Added before provider credentials were available

- **SQLite database** with SQLAlchemy for sessions, referral tasks and the audit log (`backend/db.py`).
- **Session resume:** reloading the page mid-session brings back the lessons, remaining questions and progress.
- **Supervisor dashboard on real data.** It previously showed 20 hardcoded example sessions and a browser-only safety log. It now shows backend sessions, referral tasks that supervisors can close, and the latest evaluation report.
- **Evaluation runner** with 30 scenarios and the proposal's four metrics (`backend/eval/`).
- **Content repository checks** (`backend/tests/test_content.py`).
- **Playwright browser tests** (`e2e/`).
- **Portal redesign** in the style of national health portals: shared header with text size and language, green navigation bar, a ticker of reviewed key messages, a home page with hero, start panel, how-it-works steps, services, live figures and helplines, and a full footer. Illustrations are original SVGs in `public/img/`; no government logos or emblems are used.
- **Learning library** page and backend `/content` endpoint.
- **Language that persists** on every page; previously each page kept its own setting and the home page reset to the profile language.
- **Certificate wording:** it no longer names the Karnataka Health Department as the issuer.
- **Fixes:** `npm run build` works again (type error in `lib/profile-store.ts`), and the missing app icons `icon-192.png` and `icon-512.png` are added.

## Known limitations and next steps

- **Earlier evaluation state.** The latest recorded evaluation used mock mode. Configure either provider and rerun the evaluation to measure the AI plan metric.
- **New interface text in Kannada and Hindi** (menus, headings, home page sections) was written for the redesign and should be checked by native speakers. Lesson content is unchanged.
- **There is no reviewed Hindi content yet.** Hindi sessions show English lesson text, and the Hindi safety phrases and messages need native review.
- **The content library is small** (15 blocks, 5 quiz questions). Adding reviewed material is the most useful next step; see [Adding content](#adding-content).
- **The local database is per person.** For one shared dashboard across several phones, the backend and database need to be hosted in one place.
- **Profiles, visits, spaced-repetition gaps and district coverage** are still kept in each browser's localStorage.
- **Some code is now unused.** `app/api/session/route.ts`, `app/api/safety/route.ts`, `lib/agents/*`, `lib/safety.ts`, `lib/safety-log.ts` and `lib/session-store.ts` can be removed once the team agrees.
