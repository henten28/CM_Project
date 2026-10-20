# AMR Jagruti

A multi-agent, Kannada-first learning app that helps ASHA workers run short antimicrobial resistance (AMR) sessions in households. Built as an academic prototype for the Computing in Medicine course.

AMR Jagruti is an education tool. It does not diagnose, prescribe, suggest doses, or tell anyone to start or stop a medicine. Personal or urgent medical questions get fixed referral messages written by the team, never AI-generated text.

## Contents

1. [How it works](#how-it-works)
2. [Project structure](#project-structure)
3. [First-time setup](#first-time-setup)
4. [Running the app](#running-the-app)
5. [Trying it out](#trying-it-out)
6. [Using Amazon Bedrock](#using-amazon-bedrock)
7. [API reference](#api-reference)
8. [Safety controller](#safety-controller)
9. [Tests](#tests)
10. [What has been built so far](#what-has-been-built-so-far)
11. [Known limitations and next steps](#known-limitations-and-next-steps)

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
                                                   '- Amazon Bedrock (optional; mock mode without AWS keys)
```

AWS credentials exist only on the backend server. The browser never sees them, and nothing sensitive is stored in localStorage.

## Project structure

```
aws/
|- app/                         Next.js pages (App Router)
|  |- page.tsx                  home: role, topic, duration, start session
|  |- session/page.tsx          the session: plan review, lessons, quiz, summary, voice
|  |- settings/page.tsx         backend connection status (region, model, mode)
|  |- dashboard/ profile/ visits/ certificate/
|  '- api/
|     |- session/[action]/route.ts   proxy to the backend /session/* endpoints
|     |- health/route.ts             proxy to the backend /health
|     '- session/route.ts, safety/route.ts   old mock routes, no longer used by the session flow
|- lib/
|  |- api-client.ts            typed client the pages use to call /api/*
|  |- backend.ts               server-only forwarder (reads BACKEND_URL)
|  '- agents/, safety.ts, ...  original TypeScript mock agents (kept, now unused by the session flow)
|- public/                     PWA manifest, service worker, icons
'- backend/                    FastAPI backend
   |- main.py                  app entry point, CORS, /health
   |- config.py                environment variables and mock mode
   |- api/session.py           /session/start, /session/step, /session/complete, /session/{id}
   |- agents/
   |  |- orchestrator.py       session state, flow rules, audit log
   |  |- planning_agent.py
   |  |- retrieval_agent.py
   |  |- tutor_agent.py
   |  |- summary_agent.py
   |  |- safety_controller.py
   |  |- content.py            loads the content repository
   |  '- models.py             Pydantic models for every agent input and output
   |- services/bedrock.py      Bedrock Converse API wrapper with Pydantic-validated JSON output
   |- content/modules.json     versioned content, quiz bank, source IDs, follow-up texts
   |- tests/                   pytest scenario tests
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
git clone <repository-url> aws
cd aws
```

### 2. Install the frontend

```bash
npm install
```

### 3. Install the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Optional: environment file

You can skip this step. Without it, the backend runs in **mock mode**, using rule-based agents and needing no AWS account.

To change settings, copy the example file:

```bash
cp backend/.env.example backend/.env
```

The frontend reads one optional variable, `BACKEND_URL`, which defaults to `http://127.0.0.1:8000`. Set it in `.env.local` at the project root only if the backend runs somewhere else.

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

## Trying it out

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
7. **Check the audit log.** At http://localhost:8000/docs, call `GET /session/{session_id}` to see every agent handoff.

## Using Amazon Bedrock

Without AWS credentials, the backend uses mock mode. To use Bedrock:

1. Get access to a Bedrock model in your AWS account (for example Amazon Nova Pro).
2. Give the backend credentials in the standard AWS way: `aws configure`, `AWS_PROFILE`, or an IAM role. Do not put keys in the frontend or in any `NEXT_PUBLIC_*` variable.
3. In `backend/.env`, set:
   ```
   AWS_REGION=us-east-1
   BEDROCK_MODEL=nova-pro
   BEDROCK_MOCK=auto
   ```
4. Restart the backend. The settings page should now show "Amazon Bedrock".

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
| `POST /api/session/step` | `POST /session/step` | `approve`, `answer` or `ask` |
| `POST /api/session/complete` | `POST /session/complete` | Produce the summary |
| `GET /api/session/{id}` | `GET /session/{id}` | Full session record with audit log |
| `GET /api/health` | `GET /health` | Backend status, mock mode, region, model |

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

### Session states

`AWAITING_APPROVAL` → `IN_PROGRESS` → `COMPLETED`. A session goes to `SAFETY_HOLD` if the start topic itself triggers the safety controller; it can then only be completed, which records the referral.

### Status codes

- `404`: unknown session
- `409`: action not allowed in the current state (for example answering before approval)
- `422`: invalid input
- `502`: Bedrock error
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

## Tests

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

There are 53 scenario tests, all run in mock mode. They cover:
- the full session flow
- plans fitting 5, 10 and 15 minutes
- prior gaps
- rejection of invalid or over-time model plans
- retrieval refinement
- the score thresholds
- ASHA plan edits
- safety routing for 15 unsafe questions in English, Kannada and Hindi
- 11 educational questions that must not trigger the safety controller
- referral privacy
- the audit log

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

## Known limitations and next steps

- **Sessions are kept in memory** and are lost when the backend restarts. The proposal's SQLite and SQLAlchemy layer is the next step.
- **Reloading the session page mid-session** only offers "Finish session", because lesson and quiz progress are held in the page.
- **There is no reviewed Hindi content yet.** Hindi sessions show English lesson text, and the Hindi safety phrases and messages need native review.
- **`npm run build` currently fails** because of two type errors in `lib/profile-store.ts` that predate this work. `npm run dev` is not affected.
- **`public/manifest.json` points to `icon-192.png`, which does not exist.** The browser logs a harmless 404.
- **Some code is now unused.** `app/api/session/route.ts`, `app/api/safety/route.ts`, `lib/agents/*` and `lib/safety.ts` can be removed once the team agrees.
- **The supervisor dashboard still reads local data.** It does not yet read sessions and referral tasks from the backend.
- **The proposal's Playwright tests are not written yet.**
