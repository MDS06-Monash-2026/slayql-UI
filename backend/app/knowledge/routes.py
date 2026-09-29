"""API for the review queue, approved definitions and clarification choices."""
from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.app.accounts.access import access_store
from backend.app.config import settings
from backend.app.knowledge.store import knowledge_store
from backend.app.verification.learning import workspace_learning


class DefinitionRequest(BaseModel):
    term: str = Field(min_length=1, max_length=80)
    table_name: str = Field(min_length=1, max_length=120)
    column_name: Optional[str] = Field(default=None, max_length=120)
    filter_sql: str = Field(default="", max_length=1000)
    description: str = Field(default="", max_length=1000)
    synonyms: List[str] = Field(default_factory=list)
    approve: bool = False


class DefinitionStatusRequest(BaseModel):
    status: str


class ReviewResolveRequest(BaseModel):
    resolution: str
    note: str = Field(default="", max_length=2000)
    corrected_sql: Optional[str] = Field(default=None, max_length=20000)
    save_verified_query: bool = False


class ClarifyChoiceRequest(BaseModel):
    option_index: int = Field(ge=0, le=10)


def build_router(
    *,
    require_admin: Callable[[Request], Dict[str, Any]],
    session_from_request: Callable[..., Optional[Dict[str, Any]]],
    run_option: Callable[[str, int, Request], Any],
    validate_sql: Callable[[str, str], Any],
    try_sql: Callable[[str, str], Any],
) -> APIRouter:
    """Routes receive main.py's auth and execution helpers to avoid import cycles."""
    router = APIRouter(prefix="/api/v1")

    async def organization_ids(session: Dict[str, Any]) -> List[str]:
        """Users in the caller's organisation, so each organisation sees only its own review items."""
        return await asyncio.to_thread(access_store.member_ids, session["user"]["organization_name"])

    def actor(request: Request) -> Optional[str]:
        session = session_from_request(request)
        return (session or {}).get("user", {}).get("email") if session else None

    # --- Definitions -------------------------------------------------------

    @router.get("/connections/{connection_id}/definitions")
    async def list_definitions(connection_id: str, status: Optional[str] = Query(default=None)):
        return await asyncio.to_thread(knowledge_store.list_definitions, connection_id, status)

    @router.post("/connections/{connection_id}/definitions")
    async def create_definition(connection_id: str, req: DefinitionRequest, request: Request):
        if req.approve:
            require_admin(request)
        if req.filter_sql:
            error = await try_sql(connection_id, f"SELECT 1 FROM {req.table_name} WHERE {req.filter_sql} LIMIT 1")
            if error:
                raise HTTPException(status_code=400, detail=f"The filter does not run on this data source: {error}")
        try:
            return await asyncio.to_thread(
                knowledge_store.create_definition,
                connection_id=connection_id,
                term=req.term,
                table_name=req.table_name,
                column_name=req.column_name,
                filter_sql=req.filter_sql,
                description=req.description,
                synonyms=req.synonyms,
                created_by=actor(request),
                approve=req.approve,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.patch("/definitions/{definition_id}")
    async def update_definition(definition_id: str, req: DefinitionStatusRequest, request: Request):
        require_admin(request)
        try:
            updated = await asyncio.to_thread(knowledge_store.set_definition_status, definition_id, req.status, actor(request))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not updated:
            raise HTTPException(status_code=404, detail="Definition not found.")
        return updated

    # --- Review queue ------------------------------------------------------

    @router.get("/review-items")
    async def list_review_items(request: Request, status: Optional[str] = Query(default="open"), limit: int = Query(default=100, ge=1, le=200)):
        session = require_admin(request)
        try:
            return await asyncio.to_thread(knowledge_store.list_review_items, status or None, limit, await organization_ids(session))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/review-items/count")
    async def count_review_items(request: Request):
        session = require_admin(request)
        return {"open": await asyncio.to_thread(knowledge_store.count_open, await organization_ids(session))}

    @router.post("/review-items/{item_id}/resolve")
    async def resolve_review_item(item_id: str, req: ReviewResolveRequest, request: Request):
        session = require_admin(request)
        item = await asyncio.to_thread(knowledge_store.get_review_item, item_id)
        # Another organisation's item is treated as missing.
        if item and item.get("owner_id") and item["owner_id"] not in await organization_ids(session):
            item = None
        if not item:
            raise HTTPException(status_code=404, detail="Review item not found.")
        if req.corrected_sql and item.get("connection_id"):
            error = await try_sql(item["connection_id"], req.corrected_sql)
            if error:
                raise HTTPException(status_code=400, detail=f"The corrected SQL does not run: {error}")
        try:
            resolved = await asyncio.to_thread(
                knowledge_store.resolve_review_item,
                item_id,
                resolution=req.resolution,
                reviewer=actor(request),
                note=req.note,
                corrected_sql=req.corrected_sql,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        verified = None
        final_sql = req.corrected_sql or item.get("sql")
        if req.save_verified_query and req.resolution in {"confirmed", "corrected"} and final_sql and item.get("connection_id"):
            verified = await asyncio.to_thread(
                knowledge_store.add_verified_query,
                connection_id=item["connection_id"],
                question=item["question"],
                sql=final_sql,
                approved_by=actor(request),
            )
        # Every confirmed or corrected answer is a label for this data source's confidence model.
        calibration = None
        if item.get("connection_id") and req.resolution in {"confirmed", "corrected"}:
            await asyncio.to_thread(workspace_learning.refit, item["connection_id"])
            calibration = await asyncio.to_thread(
                workspace_learning.status, item["connection_id"], settings.VERIFY_DEFAULT_PENALTY
            )
        return {"item": resolved, "verified_query": verified, "calibration": calibration}

    @router.get("/connections/{connection_id}/calibration")
    async def calibration_status(connection_id: str, request: Request):
        """What SlayQL has learned about its own reliability on this data source."""
        require_admin(request)
        return await asyncio.to_thread(workspace_learning.status, connection_id, settings.VERIFY_DEFAULT_PENALTY)

    # --- Clarification choices --------------------------------------------

    @router.post("/agent-runs/{run_id}/clarify")
    async def choose_clarification(run_id: str, req: ClarifyChoiceRequest, request: Request):
        result = await run_option(run_id, req.option_index, request)
        if result is None:
            raise HTTPException(status_code=404, detail="That clarification option is not available for this run.")
        return result

    return router
