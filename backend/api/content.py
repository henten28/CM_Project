from fastapi import APIRouter

from agents.content import repo

router = APIRouter(prefix="/content", tags=["content"])


@router.get("")
def library():
    # approved content only, grouped by module, for the learning library and the home page
    r = repo()
    modules = []
    for m in r.modules:
        blocks = [{
            "id": b["id"], "title": b["title"], "body": b["body"], "conceptTags": b["conceptTags"],
            "difficulty": b["difficulty"], "estimatedMinutes": b["estimatedMinutes"],
            "sourceId": b["sourceId"], "source": r.sources[b["sourceId"]], "version": b["version"],
        } for b in r.blocks_for_module(m["id"]) if r.is_verified(b)]
        if blocks:
            modules.append({"id": m["id"], "title": m["title"], "estimatedMinutes": m["estimatedMinutes"], "blocks": blocks})
    return {
        "contentVersion": r.version,
        "sources": [{"id": k, "name": v} for k, v in r.sources.items()],
        "modules": modules,
        # reviewed one-line messages: the explanations from the approved quiz bank (answers not included)
        "keyMessages": [{"id": q["id"], "conceptTag": q["conceptTag"], "text": q["explanation"]} for q in r.quiz],
    }
