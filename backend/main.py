import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import config
from api.session import router as session_router
from schemas import AgentNote, LessonModule, LessonPlan, PlanRequest
from services import bedrock

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ASHA tutor backend")

# only the Next.js origin may call this API; no credentials are ever returned to it
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(session_router)

PLAN_SYSTEM = (
    "You are the Planning Agent for an ASHA health-worker tutor about antibiotics and AMR. "
    "Pick modules ONLY from the catalog provided. The sum of estimatedMinutes must not exceed "
    "the available minutes. Prefer modules that address the learner's prior gaps."
)


def _mock_plan(req: PlanRequest) -> dict:
    # deterministic plan for local testing: fill the time budget in catalog order
    picked, total = [], 0
    for m in req.modules:
        if total + m.estimatedMinutes > req.availableMinutes:
            break
        picked.append(LessonModule(moduleId=m.id, contentIds=m.contentIds, estimatedMinutes=m.estimatedMinutes))
        total += m.estimatedMinutes
    if not picked:
        m = req.modules[0]
        picked.append(LessonModule(moduleId=m.id, contentIds=m.contentIds, estimatedMinutes=m.estimatedMinutes))
        total = m.estimatedMinutes
    note = AgentNote(
        kn=f"ಯೋಜನಾ ಏಜೆಂಟ್ (mock): {len(picked)} ಮಾಡ್ಯೂಲ್, {total} ನಿಮಿಷ.",
        en=f"Planning Agent (mock): {len(picked)} module(s), {total} min.",
    )
    return LessonPlan(lessonPlan=picked, agentNote=note).model_dump()


@app.get("/health")
def health():
    return {"ok": True, **bedrock.status()}


@app.post("/api/plan", response_model=LessonPlan)
async def plan(req: PlanRequest):
    catalog = "\n".join(
        f"- id={m.id} | {m.title} | {m.estimatedMinutes} min | contentIds={m.contentIds}" for m in req.modules
    )
    prompt = (
        f"Topic: {req.topic}\nAvailable minutes: {req.availableMinutes}\n"
        f"Prior gaps: {', '.join(req.priorGaps) or 'none'}\nLearner language: {req.lang}\n\n"
        f"Module catalog:\n{catalog}"
    )
    try:
        result = await bedrock.generate_structured(
            prompt, LessonPlan, system=PLAN_SYSTEM, mock=lambda: _mock_plan(req)
        )
    except bedrock.BedrockError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # business rules the JSON schema cannot express
    known = {m.id for m in req.modules}
    unknown = [m.moduleId for m in result.lessonPlan if m.moduleId not in known]
    if unknown:
        raise HTTPException(status_code=502, detail=f"model chose unknown modules: {unknown}")
    # a single over-length module is allowed, same as the frontend's "at least one module" fallback
    if sum(m.estimatedMinutes for m in result.lessonPlan) > req.availableMinutes and len(result.lessonPlan) > 1:
        raise HTTPException(status_code=502, detail="model plan exceeds available minutes")
    return result
