import asyncio
import logging
import uuid
import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request, Response, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.app.config import settings
from backend.app.catalog.discovery import CatalogService
from backend.app.providers.openrouter_client import openrouter_client, ModelInfo
from backend.app.agent.effort import DEFAULT_THINKING_EFFORT, ThinkingEffort
from backend.app.agent.pipeline import SlayQLPipeline, RUN_METADATA_STORE
from backend.app.queries.validator import SqlValidator
from backend.app.queries.executor import QueryExecutor
from backend.app.connections.store import connection_store
from backend.app.connections.runtime import test_external_connection, get_external_catalog
from backend.app.connections.registry import (
    default_connection_id,
    get_connection,
    get_credentials,
    get_sqlite_path,
    require_sqlite_path,
)
from backend.app.control_database import control_database
from backend.app.history.store import history_store
from backend.app.history.conversation_store import conversation_store
from backend.app.feedback.store import chat_report_store
from backend.app.accounts.store import account_store
from backend.app.accounts.session_store import session_store
from backend.app.workbench.gemini_agent import (
    _fallback_chat_intent,
    _fast_greeting_answer,
    chart_idiom_payload,
    gemini_workbench_agent,
    summarize_result,
)
from backend.app.workbench.health import inspect_sqlite_health

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory history and saved queries store
SAVED_QUERIES: List[Dict[str, Any]] = [
    {
        "id": "saved_1",
        "name": "Top Customers by Total Revenue",
        "description": "Aggregates revenue across completed orders for top enterprise and mid-market accounts.",
        "prompt": "Show top 10 customers by total spending",
        "sql": """SELECT c.id, c.full_name, c.segment, COUNT(o.id) AS total_orders, ROUND(SUM(o.total_amount), 2) AS total_spent
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.status IN ('completed', 'shipped')
GROUP BY c.id, c.full_name, c.segment
ORDER BY total_spent DESC
LIMIT 10;""",
        "created_at": "2026-08-20T10:00:00Z"
    },
    {
        "id": "saved_2",
        "name": "Category Profit Margin Breakdown",
        "description": "Calculates unit margins and profit percentages by product category.",
        "prompt": "Which product categories have the highest profit margins?",
        "sql": """SELECT cat.name AS category_name, cat.department, COUNT(DISTINCT p.id) AS total_products, ROUND(AVG(p.unit_price - p.cost_price), 2) AS avg_unit_margin
FROM categories cat
JOIN products p ON cat.id = p.category_id
WHERE p.status = 'active'
GROUP BY cat.name, cat.department
ORDER BY avg_unit_margin DESC;""",
        "created_at": "2026-08-21T14:30:00Z"
    },
    {
        "id": "saved_3",
        "name": "Support Ticket Resolution Efficiency",
        "description": "Average resolution time grouped by case priority and status.",
        "prompt": "Show support case volume and average resolution hours by priority",
        "sql": """SELECT priority, status, COUNT(*) AS case_count, ROUND(AVG(resolution_time_hours), 2) AS avg_resolution_hours
FROM support_cases
GROUP BY priority, status
ORDER BY case_count DESC;""",
        "created_at": "2026-08-22T09:15:00Z"
    }
]

QUERY_HISTORY: List[Dict[str, Any]] = []  # Compatibility mirror; persistent history is authoritative.

# In-memory session store
ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}

# Connection metadata changes infrequently, while run creation reads it on
# every turn. A short process-local cache removes a Supabase round trip from
# the common path without caching credentials or user data.
_CONNECTION_METADATA_CACHE: Dict[tuple[str, Optional[str]], tuple[float, Dict[str, Any]]] = {}
_CONNECTION_METADATA_CACHE_TTL_SECONDS = 30.0

class LoginRequest(BaseModel):
    email: Optional[str] = None
    organization_name: Optional[str] = None
    is_reviewer: bool = False
    role: Optional[str] = "Admin"

class CreateRunRequest(BaseModel):
    question: str
    model_id: Optional[str] = "deepseek/deepseek-v4-flash"
    connection_id: Optional[str] = None
    conversation_id: Optional[str] = None
    thinking_effort: ThinkingEffort = DEFAULT_THINKING_EFFORT

class ExecuteSqlRequest(BaseModel):
    sql: str
    connection_id: Optional[str] = None

class SaveQueryRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    prompt: Optional[str] = ""
    sql: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    organization_name: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None

class AddCreditsRequest(BaseModel):
    amount: int = Field(default=100, ge=1, le=1000)

class ChatReportRequest(BaseModel):
    message_id: str = Field(min_length=1, max_length=128)
    category: str = Field(default="incorrect_or_unhelpful", min_length=1, max_length=64)
    note: str = Field(default="", max_length=2000)

class AdminReportUpdateRequest(BaseModel):
    status: str = Field(min_length=1, max_length=32)
    resolution_note: str = Field(default="", max_length=2000)

class WorkbenchResultPayload(BaseModel):
    columns: List[str] = Field(default_factory=list, max_length=50)
    column_types: List[str] = Field(default_factory=list, max_length=50)
    rows: List[List[Any]] = Field(default_factory=list, max_length=200)

class SqlAssistRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)
    sql: str = Field(default="", max_length=20000)
    cursor_position: int = Field(default=0, ge=0)

class VisualizationAssistRequest(BaseModel):
    question: str = Field(default="", max_length=1000)
    result: WorkbenchResultPayload

class DashboardAssistRequest(BaseModel):
    preference: Dict[str, Any] = Field(default_factory=dict)
    result: WorkbenchResultPayload


def _session_from_request(request: Request, required: bool = False) -> Optional[Dict[str, Any]]:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    session = ACTIVE_SESSIONS.get(token)
    if not session and token:
        stored_session = session_store.get(token)
        if stored_session:
            profile = account_store.get(stored_session["user_id"])
            if profile:
                session = _build_session(token, profile, stored_session["authenticated_at"])
                ACTIVE_SESSIONS[token] = session
    if required and not session:
        raise HTTPException(status_code=401, detail="Authentication is required.")
    return session


def _owner_id(request: Request) -> str:
    session = _session_from_request(request)
    return session["user"]["id"] if session else "anonymous_demo"


def _require_admin(request: Request) -> Dict[str, Any]:
    session = _session_from_request(request, required=True)
    role = str(session.get("user", {}).get("role") or "").casefold()
    if "admin" not in role and "owner" not in role:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return session


def _refresh_session_profile(user_id: str, profile: Dict[str, Any]) -> None:
    for session in ACTIVE_SESSIONS.values():
        if session.get("user", {}).get("id") == user_id:
            session["user"] = {**session["user"], **profile}


def _build_session(token: str, profile: Dict[str, Any], authenticated_at: str) -> Dict[str, Any]:
    return {
        "token": token,
        "user": profile,
        "organization": {
            "id": f"org_{profile['id'].replace('usr_', '')}",
            "name": profile["organization_name"],
            "plan": "Enterprise Trial",
            "region": "us-east-1 (Isolated Cluster)",
            "tier": "Dedicated Tenant",
        },
        "authenticated_at": authenticated_at,
    }


def _compact_catalog(catalog) -> Dict[str, Any]:
    return {
        "engine": catalog.engine,
        "database_name": catalog.database_name,
        "tables": {
            name: {
                "row_count": table.row_count_estimate,
                "columns": [{"name": column.name, "type": column.type, "primary_key": column.primary_key} for column in table.columns],
                "foreign_keys": [fk.model_dump() for fk in table.foreign_keys],
            }
            for name, table in catalog.tables.items()
        },
    }


def _consume_workbench_credit(request: Request, reason: str) -> Optional[int]:
    session = _session_from_request(request)
    if not session or not settings.GEMINI_API_KEY:
        return session.get("user", {}).get("credits") if session else None
    profile = account_store.consume_credit(session["user"]["id"], 1, reason)
    if not profile:
        raise HTTPException(status_code=402, detail="Not enough credits for this AI operation.")
    _refresh_session_profile(profile["id"], profile)
    return profile["credits"]


def _ensure_workbench_credit(request: Request) -> None:
    if not settings.GEMINI_API_KEY:
        return
    session = _session_from_request(request, required=True)
    profile = account_store.get(session["user"]["id"])
    if not profile or profile["credits"] < 1:
        raise HTTPException(status_code=402, detail="Not enough credits for this AI operation.")

# --- Authentication & Session Endpoints ---

@app.post("/api/v1/auth/login")
async def login(req: LoginRequest):
    if req.is_reviewer:
        org_name = req.organization_name or "SlayQL Enterprise Demo Workspace"
        user_name = "Enterprise Reviewer"
        user_email = "reviewer@slayql.demo"
        user_role = "Lead Architect / Owner"
    else:
        user_email = (req.email or "").strip()
        if not user_email or "@" not in user_email:
            raise HTTPException(status_code=400, detail="Valid organization email is required.")
        
        # Derive org name from domain or user input
        domain = user_email.split("@")[1].split(".")[0].capitalize()
        org_name = req.organization_name or f"{domain} Enterprise Analytics"
        user_name = user_email.split("@")[0].replace(".", " ").capitalize()
        user_role = req.role or "Data Architect"

    profile = account_store.upsert_login(
        email=user_email,
        name=user_name,
        role=user_role,
        organization_name=org_name,
    )
    session_token = f"sess_{uuid.uuid4().hex}"
    authenticated_at = datetime.now(timezone.utc).isoformat()
    session_data = _build_session(session_token, profile, authenticated_at)
    session_store.save(session_token, profile["id"], authenticated_at)
    ACTIVE_SESSIONS[session_token] = session_data
    return session_data

@app.get("/api/v1/session")
async def get_current_session(request: Request):
    session = _session_from_request(request)
    if session:
        profile = account_store.get(session["user"]["id"])
        if profile:
            _refresh_session_profile(profile["id"], profile)
        return session
    # Return default reviewer session if not authenticated
    return {
        "authenticated": False,
        "default_reviewer": {
            "organization": "SlayQL Enterprise Demo Workspace",
            "user": "Enterprise Reviewer",
            "role": "Owner"
        }
    }

@app.post("/api/v1/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    ACTIVE_SESSIONS.pop(token, None)
    if token:
        session_store.delete(token)
    return {"status": "logged_out"}


@app.get("/api/v1/profile")
async def get_profile(request: Request):
    session = _session_from_request(request, required=True)
    profile = account_store.get(session["user"]["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return profile


@app.patch("/api/v1/profile")
async def update_profile(req: UpdateProfileRequest, request: Request):
    session = _session_from_request(request, required=True)
    fields = {key: value for key, value in req.model_dump().items() if value is not None}
    if fields.get("name") == "":
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    profile = account_store.update(session["user"]["id"], fields)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    _refresh_session_profile(profile["id"], profile)
    session["organization"]["name"] = profile["organization_name"]
    return profile


@app.post("/api/v1/profile/avatar")
async def upload_profile_avatar(request: Request, file: UploadFile = File(...)):
    session = _session_from_request(request, required=True)
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Upload a JPEG, PNG, or WebP image.")
    content = await file.read(2 * 1024 * 1024 + 1)
    await file.close()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Profile photo must be 2 MB or smaller.")
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    signatures_valid = (
        file.content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
        or file.content_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
        or file.content_type == "image/webp" and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    )
    if not signatures_valid:
        raise HTTPException(status_code=400, detail="The uploaded file does not match its image type.")
    profile = account_store.set_avatar(session["user"]["id"], content, file.content_type)
    _refresh_session_profile(profile["id"], profile)
    return profile


@app.get("/api/v1/credits")
async def get_credits(request: Request):
    session = _session_from_request(request, required=True)
    return account_store.credit_summary(session["user"]["id"])


@app.post("/api/v1/credits/add")
async def add_credits(req: AddCreditsRequest, request: Request):
    session = _session_from_request(request, required=True)
    profile = account_store.add_credits(session["user"]["id"], req.amount, "Credit pack added")
    _refresh_session_profile(profile["id"], profile)
    return account_store.credit_summary(profile["id"])


# --- Endpoints ---

@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.APP_ENV,
        "active_models_count": len(await openrouter_client.list_models()),
        "sqlite_demo_ready": settings.demo_connections_enabled,
        "default_connection_id": default_connection_id(),
        "backend_database": control_database.backend,
    }

@app.get("/api/v1/models")
async def list_models(q: Optional[str] = Query(default=None, max_length=100)) -> List[ModelInfo]:
    return await openrouter_client.list_models(q)

# Dynamic Connections Store
DYNAMIC_CONNECTIONS: Dict[str, Dict[str, Any]] = {}

if settings.demo_connections_enabled:
    DYNAMIC_CONNECTIONS.update({
        "sqlite_demo": {
            "id": "sqlite_demo",
            "name": "SlayQL Demo Database (Packaged SQLite)",
            "engine": "sqlite",
            "status": "connected",
            "access_mode": "read_only",
            "is_default": True,
            "managed_by_environment": True,
            "path": settings.SQLITE_DEMO_PATH,
            "latency_ms": 1.2,
            "created_at": "2026-08-20T00:00:00Z"
        },
        "postgres_demo": {
            "id": "postgres_demo",
            "name": "SlayQL Customer PostgreSQL Demo (Neon)",
            "engine": "postgresql",
            "status": "ready" if settings.DEMO_POSTGRES_URL else "simulated",
            "access_mode": "read_only",
            "is_default": False,
            "managed_by_environment": True,
            "latency_ms": 18.5,
            "created_at": "2026-08-21T00:00:00Z"
        },
    })

ENVIRONMENT_CONNECTION_IDS = {"sqlite_demo", "postgres_demo"}

class ColumnDef(BaseModel):
    name: str
    type: str = "TEXT"
    primary_key: bool = False
    nullable: bool = True
    sample_values: Optional[List[str]] = []

class ForeignKeyDef(BaseModel):
    from_column: str
    to_table: str
    to_column: str

class CreateTableRequest(BaseModel):
    table_name: str
    description: Optional[str] = ""
    columns: List[ColumnDef]
    foreign_keys: Optional[List[ForeignKeyDef]] = []
    initial_rows: Optional[List[Dict[str, Any]]] = []

class CreateConnectionRequest(BaseModel):
    name: str
    provider: Optional[str] = None
    engine: str = "sqlite" # backwards-compatible alias for provider
    mode: str = "direct" # direct | upload
    connection_string: Optional[str] = None
    description: Optional[str] = ""
    credentials: Dict[str, Any] = Field(default_factory=dict)


def _connection_metadata(connection_id: str, owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    dynamic = DYNAMIC_CONNECTIONS.get(connection_id)
    if dynamic and (connection_id in ENVIRONMENT_CONNECTION_IDS or owner_id is None or dynamic.get("owner_id") == owner_id):
        return dict(dynamic)
    cache_key = (connection_id, owner_id)
    cached = _CONNECTION_METADATA_CACHE.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < _CONNECTION_METADATA_CACHE_TTL_SECONDS:
        return dict(cached[1])
    metadata = connection_store.get_metadata(connection_id, owner_id=owner_id)
    if metadata:
        _CONNECTION_METADATA_CACHE[cache_key] = (now, dict(metadata))
        return dict(metadata)
    _CONNECTION_METADATA_CACHE.pop(cache_key, None)
    return None


def _invalidate_connection_metadata(connection_id: str) -> None:
    for cache_key in [key for key in _CONNECTION_METADATA_CACHE if key[0] == connection_id]:
        _CONNECTION_METADATA_CACHE.pop(cache_key, None)


def _provider_credentials(req: CreateConnectionRequest) -> Dict[str, Any]:
    credentials = dict(req.credentials or {})
    if req.connection_string:
        credentials["connection_string"] = req.connection_string
    # Keep the API flexible for provider-specific auth while making it explicit
    # that this payload is encrypted and never echoed back to the client.
    return {str(key): value for key, value in credentials.items() if value not in (None, "")}

# --- Connection & Catalog Endpoints ---

@app.get("/api/v1/connections")
async def list_connections(request: Request):
    result = []
    owner_id = _owner_id(request)
    all_connections = {item["id"]: item for item in connection_store.list_metadata(owner_id=owner_id)}
    all_connections.update({key: value for key, value in DYNAMIC_CONNECTIONS.items() if key in ENVIRONMENT_CONNECTION_IDS or value.get("owner_id") == owner_id})
    for conn_id, conn in all_connections.items():
        tbl_count = int(conn.get("table_count", 0))
        if conn["engine"] == "sqlite":
            sqlite_path = get_sqlite_path(conn_id)
            try:
                if not sqlite_path:
                    raise FileNotFoundError("SQLite file is unavailable on this deployment")
                cat = CatalogService.get_sqlite_catalog(sqlite_path)
                tbl_count = len(cat.tables)
            except Exception:
                conn = {**conn, "status": "error", "catalog_error": "SQLite file is unavailable on this deployment."}
            else:
                conn = {**conn, "path": sqlite_path}
        result.append({
            **{key: value for key, value in conn.items() if key not in {"credentials", "encrypted_credentials"}},
            "table_count": tbl_count
        })
    return result

@app.post("/api/v1/connections")
async def create_connection(req: CreateConnectionRequest, request: Request):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Database name is required.")
    
    conn_id = f"conn_{uuid.uuid4().hex[:8]}"
    owner_id = _owner_id(request)
    db_engine = (req.provider or req.engine or "sqlite").lower()
    if db_engine not in {"sqlite", "postgresql", "supabase", "mysql", "snowflake"}:
        raise HTTPException(status_code=400, detail="Unsupported database provider.")
    mode = req.mode.lower()
    if mode not in {"direct", "upload"}:
        raise HTTPException(status_code=400, detail="Connection mode must be direct or upload.")
    if mode == "upload":
        raise HTTPException(status_code=400, detail="Use the upload connection endpoint for managed files.")
    if db_engine == "sqlite":
        raise HTTPException(status_code=400, detail="SQLite sources must be added through managed upload.")
    credentials = _provider_credentials(req)
    if db_engine != "sqlite" and not credentials and settings.APP_ENV != "demo":
        raise HTTPException(status_code=400, detail="Connection details are required.")
    
    new_conn = {
        "id": conn_id,
        "name": req.name.strip(),
        "engine": db_engine,
        "status": "pending",
        "access_mode": "read_only",
        "description": req.description or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "owner_id": owner_id,
    }
    if db_engine == "sqlite":
        new_conn["path"] = credentials.get("path", settings.SQLITE_DEMO_PATH)
    connection_store.save(
        connection_id=conn_id,
        name=new_conn["name"],
        provider=db_engine,
        mode=mode,
        description=new_conn["description"],
        status=new_conn["status"],
        credentials=credentials,
        data_path=new_conn.get("path"),
        owner_id=owner_id,
    )
    _invalidate_connection_metadata(conn_id)
    new_conn["credentials_configured"] = bool(credentials)
    DYNAMIC_CONNECTIONS[conn_id] = new_conn
    return new_conn


@app.post("/api/v1/connections/upload")
async def upload_connection(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(default=""),
):
    """Store an uploaded SQLite database in the managed, persistent data directory."""
    if not name.strip():
        raise HTTPException(status_code=400, detail="Database name is required.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".sqlite", ".sqlite3", ".db"}:
        raise HTTPException(status_code=400, detail="Upload a SQLite .db, .sqlite, or .sqlite3 file.")

    conn_id = f"conn_{uuid.uuid4().hex[:8]}"
    owner_id = _owner_id(request)
    destination = connection_store.data_dir / f"{conn_id}.sqlite3"
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.MAX_CONNECTION_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Database upload exceeds the size limit.")
                output.write(chunk)
        with sqlite3.connect(destination) as sqlite_conn:
            integrity = sqlite_conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise HTTPException(status_code=400, detail="The uploaded SQLite database failed integrity checks.")
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read the uploaded database: {exc}") from exc
    finally:
        await file.close()

    metadata = connection_store.save(
        connection_id=conn_id,
        name=name.strip(),
        provider="sqlite",
        mode="upload",
        description=description.strip(),
        status="connected",
        credentials={"original_filename": file.filename or "database.sqlite3"},
        # Store a deployment-portable reference. The absolute container path
        # differs between local development and the VPS.
        data_path=f"connections/{conn_id}.sqlite3",
        owner_id=owner_id,
    )
    _invalidate_connection_metadata(conn_id)
    metadata.update({"path": f"connections/{conn_id}.sqlite3", "status": "connected"})
    DYNAMIC_CONNECTIONS[conn_id] = metadata
    return metadata

@app.post("/api/v1/connections/{connection_id}/test")
async def test_connection(connection_id: str, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    started = time.perf_counter()
    try:
        if conn["engine"] == "sqlite":
            path = conn.get("path") or settings.SQLITE_DEMO_PATH
            with sqlite3.connect(path) as db:
                db.execute("SELECT 1").fetchone()
            result = {"status": "healthy", "message": "SQLite file is readable."}
        elif not get_credentials(connection_id) and settings.APP_ENV == "demo":
            result = {"status": "healthy", "message": "Demo connection is available. Add credentials to verify a live provider."}
        else:
            result = test_external_connection(conn["engine"], get_credentials(connection_id))
        connection_store.update_status(connection_id, "connected")
        _invalidate_connection_metadata(connection_id)
        result.update({"connection_id": connection_id, "engine": conn["engine"], "latency_ms": round((time.perf_counter() - started) * 1000, 1)})
        return result
    except Exception as exc:
        connection_store.update_status(connection_id, "error")
        _invalidate_connection_metadata(connection_id)
        return {"status": "error", "connection_id": connection_id, "engine": conn["engine"], "latency_ms": round((time.perf_counter() - started) * 1000, 1), "message": str(exc)}

@app.delete("/api/v1/connections/{connection_id}")
async def delete_connection(connection_id: str, request: Request):
    if connection_id in ENVIRONMENT_CONNECTION_IDS:
        raise HTTPException(status_code=400, detail="Environment-managed database connections cannot be deleted.")
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    data_path = conn.get("path")
    sqlite_path = get_sqlite_path(connection_id) if conn.get("engine") == "sqlite" else None
    if sqlite_path and Path(sqlite_path).resolve().parent == connection_store.data_dir.resolve():
        Path(sqlite_path).unlink(missing_ok=True)
    DYNAMIC_CONNECTIONS.pop(connection_id, None)
    connection_store.delete(connection_id)
    _invalidate_connection_metadata(connection_id)
    return {"status": "deleted"}

@app.get("/api/v1/connections/{connection_id}/catalog")
async def get_connection_catalog(connection_id: str, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    if conn.get("engine") != "sqlite":
        try:
            return get_external_catalog(conn["engine"], get_credentials(connection_id))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Could not inspect this data source: {exc}") from exc
    db_path = get_sqlite_path(connection_id)
    if not db_path:
        raise HTTPException(status_code=409, detail="The SQLite file is unavailable on this deployment. Re-upload this database file.")
    catalog = CatalogService.get_sqlite_catalog(db_path)
    return catalog


def _catalog_for_connection(conn: Dict[str, Any], connection_id: str):
    if conn.get("engine") == "sqlite":
        return CatalogService.get_sqlite_catalog(require_sqlite_path(connection_id))
    return get_external_catalog(conn["engine"], get_credentials(connection_id))


@app.get("/api/v1/connections/{connection_id}/explore-suggestions")
async def get_explore_suggestions(connection_id: str, request: Request):
    owner_id = _owner_id(request)
    conn = _connection_metadata(connection_id, owner_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        catalog = _catalog_for_connection(conn, connection_id)
        recent_questions = [
            item["prompt"]
            for item in history_store.list(owner_id=owner_id, limit=30)
            if item.get("connection_id") == connection_id and item.get("prompt")
        ][:8]
        response = await gemini_workbench_agent.suggest_explorations(
            _compact_catalog(catalog),
            list(reversed(recent_questions)),
        )
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not generate exploration suggestions: {exc}") from exc


@app.get("/api/v1/workbench/chart-idioms")
async def list_chart_idioms():
    return {"count": len(chart_idiom_payload()), "idioms": chart_idiom_payload()}


@app.post("/api/v1/connections/{connection_id}/workbench/query")
async def execute_workbench_query(connection_id: str, req: ExecuteSqlRequest, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        catalog = _catalog_for_connection(conn, connection_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not inspect this data source: {exc}") from exc
    dialect = "sqlite" if conn["engine"] == "sqlite" else "postgres" if conn["engine"] in {"postgresql", "supabase"} else conn["engine"]
    validation = SqlValidator.validate_and_sanitize(req.sql, dialect=dialect, catalog=catalog, max_rows=settings.MAX_RESULT_ROWS)
    if not validation.is_valid:
        raise HTTPException(status_code=400, detail=validation.error_message or "SQL validation failed.")
    if conn["engine"] == "sqlite":
        result = await QueryExecutor.execute_sqlite(require_sqlite_path(connection_id), validation.sanitized_sql, settings.QUERY_TIMEOUT_SECONDS, settings.MAX_RESULT_ROWS)
    else:
        result = await QueryExecutor.execute_external(conn["engine"], get_credentials(connection_id), validation.sanitized_sql, settings.QUERY_TIMEOUT_SECONDS, settings.MAX_RESULT_ROWS)
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)
    return {"validation": validation.model_dump(), "result": result.model_dump()}


@app.post("/api/v1/connections/{connection_id}/workbench/ai/sql")
async def assist_workbench_sql(connection_id: str, req: SqlAssistRequest, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        _ensure_workbench_credit(request)
        catalog = _catalog_for_connection(conn, connection_id)
        dialect = "sqlite" if conn["engine"] == "sqlite" else "postgres" if conn["engine"] in {"postgresql", "supabase"} else conn["engine"]
        response = await gemini_workbench_agent.assist_sql(req.instruction, req.sql, req.cursor_position, dialect, _compact_catalog(catalog))
        response["credits_remaining"] = _consume_workbench_credit(request, "Gemini SQL assistance")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini SQL assistant failed: {exc}") from exc


@app.post("/api/v1/connections/{connection_id}/workbench/ai/visualization")
async def assist_workbench_visualization(connection_id: str, req: VisualizationAssistRequest, request: Request):
    if not _connection_metadata(connection_id, _owner_id(request)):
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        _ensure_workbench_credit(request)
        profile = summarize_result(req.result.columns, req.result.column_types, req.result.rows)
        response = await gemini_workbench_agent.recommend_chart(req.question, profile)
        response["credits_remaining"] = _consume_workbench_credit(request, "Gemini visualization recommendation")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini visualization agent failed: {exc}") from exc


@app.post("/api/v1/connections/{connection_id}/workbench/ai/dashboard")
async def build_workbench_dashboard(connection_id: str, req: DashboardAssistRequest, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        _ensure_workbench_credit(request)
        catalog = _catalog_for_connection(conn, connection_id)
        result_profile = summarize_result(req.result.columns, req.result.column_types, req.result.rows)
        response = await gemini_workbench_agent.build_dashboard(req.preference, _compact_catalog(catalog), result_profile)
        response["data_profile"] = result_profile
        response["credits_remaining"] = _consume_workbench_credit(request, "Gemini dashboard generation")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini dashboard agent failed: {exc}") from exc


@app.post("/api/v1/connections/{connection_id}/workbench/ai/health")
async def inspect_workbench_health(connection_id: str, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        _ensure_workbench_credit(request)
        if conn["engine"] == "sqlite":
            diagnostics = inspect_sqlite_health(require_sqlite_path(connection_id))
        else:
            catalog = _catalog_for_connection(conn, connection_id)
            diagnostics = {"engine": conn["engine"], "integrity": "provider-managed", "foreign_key_violations": [], "missing_fk_indexes": [], "tables": [{"name": name, "row_count": table.row_count_estimate, "foreign_key_count": len(table.foreign_keys)} for name, table in catalog.tables.items()], "table_count": len(catalog.tables)}
        response = await gemini_workbench_agent.explain_health(diagnostics)
        response["diagnostics"] = diagnostics
        response["credits_remaining"] = _consume_workbench_credit(request, "Gemini database health analysis")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini health agent failed: {exc}") from exc

@app.post("/api/v1/connections/{connection_id}/tables")
async def create_table(connection_id: str, req: CreateTableRequest, request: Request):
    if not req.table_name.strip():
        raise HTTPException(status_code=400, detail="Table name is required.")
    if not req.columns or len(req.columns) == 0:
        raise HTTPException(status_code=400, detail="At least one column is required.")
    
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    if conn and conn.get("engine") != "sqlite":
        raise HTTPException(status_code=400, detail="Table management is available for managed SQLite sources only.")
    db_path = conn.get("path", settings.SQLITE_DEMO_PATH) if conn else settings.SQLITE_DEMO_PATH
    
    try:
        cols = [c.model_dump() for c in req.columns]
        fks = [f.model_dump() for f in (req.foreign_keys or [])]
        updated_catalog = CatalogService.create_custom_table(
            db_path=db_path,
            table_name=req.table_name.strip(),
            columns=cols,
            foreign_keys=fks,
            initial_rows=req.initial_rows or []
        )
        return {
            "status": "table_created",
            "table_name": req.table_name.strip(),
            "catalog": updated_catalog
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/v1/connections/{connection_id}/tables/{table_name}")
async def drop_table(connection_id: str, table_name: str, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    if conn and conn.get("engine") != "sqlite":
        raise HTTPException(status_code=400, detail="Table management is available for managed SQLite sources only.")
    db_path = conn.get("path", settings.SQLITE_DEMO_PATH) if conn else settings.SQLITE_DEMO_PATH
    
    try:
        updated_catalog = CatalogService.drop_table(db_path, table_name)
        return {
            "status": "table_dropped",
            "table_name": table_name,
            "catalog": updated_catalog
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _persist_run_start(
    *,
    conversation_id: str,
    owner_id: str,
    connection_id: str,
    model_id: Optional[str],
    question: str,
    occurred_at: str,
    prior_persistence_task: Optional[asyncio.Task] = None,
) -> None:
    # A rapid follow-up can arrive while the prior assistant message is still
    # being written. Preserve ordering without holding up the POST response.
    if prior_persistence_task is not None:
        await asyncio.shield(prior_persistence_task)
    message = await asyncio.to_thread(
        conversation_store.persist_user_message,
        conversation_id=conversation_id,
        owner_id=owner_id,
        connection_id=connection_id,
        selected_model_id=model_id,
        title=question,
        content=question,
        created_at=occurred_at,
    )
    if not message:
        raise RuntimeError("The user message could not be saved.")


def _schedule_history_persistence(history_item: Dict[str, Any]) -> asyncio.Task:
    """Persist the compatibility history index without blocking run creation."""
    task = asyncio.create_task(asyncio.to_thread(history_store.add, **history_item))

    def _log_failure(completed: asyncio.Task) -> None:
        try:
            completed.result()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Background query-history persistence failed for %s", history_item.get("id"))

    task.add_done_callback(_log_failure)
    return task


@app.post("/api/v1/agent-runs")
async def create_agent_run(req: CreateRunRequest, request: Request):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    # Resolve authentication once. Store lookups are synchronous SQLAlchemy
    # calls, so run them in a worker thread instead of blocking FastAPI's loop.
    session = await asyncio.to_thread(_session_from_request, request)
    owner_id = session["user"]["id"] if session else "anonymous_demo"
    preflight = _fallback_chat_intent(req.question, [])
    is_fast_greeting = bool(preflight.get("fast_path"))
    connection_id = req.connection_id or default_connection_id()
    if not connection_id:
        raise HTTPException(status_code=400, detail="Add and select a data source before running SQL generation.")
    if not await asyncio.to_thread(_connection_metadata, connection_id, owner_id):
        raise HTTPException(status_code=404, detail="Selected data source was not found in this workspace.")
    conversation_id = req.conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
    conversation_messages: List[Dict[str, str]] = []
    if req.conversation_id:
        existing_conversation = SlayQLPipeline.recent_conversation_context(
            req.conversation_id,
            owner_id,
        )
        if existing_conversation is None:
            await SlayQLPipeline.await_conversation_persistence(req.conversation_id)
            existing_conversation = await asyncio.to_thread(
                conversation_store.get_metadata if is_fast_greeting else conversation_store.get,
                req.conversation_id,
                owner_id,
            )
        if not existing_conversation:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        if existing_conversation.get("connection_id") != connection_id:
            raise HTTPException(status_code=400, detail="A conversation must continue on its original data source.")
        if not is_fast_greeting:
            if "messages" in existing_conversation:
                conversation_messages = (
                    existing_conversation["messages"]
                    if existing_conversation.get("id") is None
                    else conversation_store.context_from_thread(existing_conversation, limit=8)
                )
    credits_remaining = None
    if session and not is_fast_greeting:
        profile = await asyncio.to_thread(account_store.consume_credit, session["user"]["id"], 1, "AI query")
        if not profile:
            raise HTTPException(status_code=402, detail="Not enough credits to run this query.")
        _refresh_session_profile(profile["id"], profile)
        credits_remaining = profile["credits"]
    elif session:
        credits_remaining = session["user"].get("credits")
        
    occurred_at = datetime.now(timezone.utc).isoformat()
    run_response = SlayQLPipeline.create_run(
        question=req.question.strip(),
        model_id=req.model_id or settings.DEFAULT_MODEL,
        connection_id=connection_id,
        conversation_id=conversation_id,
        owner_id=owner_id,
        conversation_messages=conversation_messages,
        thinking_effort=req.thinking_effort,
    )

    # Record in history
    history_item = {
        "id": run_response["run_id"],
        "conversation_id": run_response["conversation_id"],
        "prompt": req.question.strip(),
        "model_id": req.model_id,
        "connection_id": connection_id,
        "owner_id": owner_id,
        "created_at": occurred_at,
    }
    QUERY_HISTORY.insert(0, history_item)
    history_values = dict(
        run_id=history_item["id"],
        conversation_id=history_item["conversation_id"],
        prompt=history_item["prompt"],
        model_id=history_item["model_id"],
        connection_id=history_item["connection_id"],
        created_at=history_item["created_at"],
        owner_id=owner_id,
    )
    prior_persistence_task = SlayQLPipeline.conversation_persistence_task(conversation_id)
    persistence_task = asyncio.create_task(_persist_run_start(
        conversation_id=conversation_id,
        owner_id=owner_id,
        connection_id=connection_id,
        model_id=req.model_id or settings.DEFAULT_MODEL,
        question=req.question.strip(),
        occurred_at=occurred_at,
        prior_persistence_task=prior_persistence_task,
    ))
    SlayQLPipeline.attach_start_persistence(run_response["run_id"], persistence_task)
    history_task = _schedule_history_persistence(history_values)
    SlayQLPipeline.attach_history_persistence(run_response["run_id"], history_task)

    # Begin processing before the client opens SSE. Events are retained and
    # replayed, so a late stream connection remains complete and ordered.
    SlayQLPipeline.start_run(run_response["run_id"])

    initial_answer = _fast_greeting_answer(req.question) if is_fast_greeting else None
    return {
        **run_response,
        "credits_remaining": credits_remaining,
        "initial_answer": initial_answer,
        "initial_is_sql_query": False if initial_answer else None,
    }

@app.get("/api/v1/agent-runs/{run_id}/events")
async def get_run_events_stream(run_id: str, request: Request):
    """
    Server-Sent Events endpoint streaming the live SlayQL query lifecycle.
    """
    owner_id = await asyncio.to_thread(_owner_id, request)
    if not SlayQLPipeline.owns_run(run_id, owner_id):
        raise HTTPException(status_code=404, detail="Agent run not found.")
    event_stream = SlayQLPipeline.stream_run_events(run_id)
    return StreamingResponse(
        event_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/v1/agent-runs/{run_id}/cancel")
async def cancel_agent_run(run_id: str, request: Request):
    success = SlayQLPipeline.cancel_run(run_id, _owner_id(request))
    return {"cancelled": success, "run_id": run_id}

@app.post("/api/v1/agent-runs/{run_id}/execute")
async def execute_edited_sql(run_id: str, req: ExecuteSqlRequest, request: Request):
    """
    Executes user-edited SQL against the selected read-only source with full AST safety validation.
    """
    owner_id = _owner_id(request)
    if run_id in RUN_METADATA_STORE and not SlayQLPipeline.owns_run(run_id, owner_id):
        raise HTTPException(status_code=404, detail="Agent run not found.")
    connection_id = req.connection_id or default_connection_id()
    if not connection_id:
        raise HTTPException(status_code=400, detail="Add and select a data source before executing SQL.")
    conn = _connection_metadata(connection_id, owner_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        if conn.get("engine") == "sqlite":
            catalog = CatalogService.get_sqlite_catalog(require_sqlite_path(connection_id))
            dialect = "sqlite"
        else:
            catalog = get_external_catalog(conn["engine"], get_credentials(connection_id))
            dialect = "postgres" if conn["engine"] in {"postgresql", "supabase"} else conn["engine"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not inspect this data source: {exc}") from exc
    val = SqlValidator.validate_and_sanitize(req.sql, dialect=dialect, catalog=catalog)
    
    if not val.is_valid:
        raise HTTPException(status_code=400, detail=val.error_message or "SQL Validation failed")

    if conn.get("engine") == "sqlite":
        result = await QueryExecutor.execute_sqlite(
            db_path=require_sqlite_path(connection_id),
            sql=val.sanitized_sql,
            timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
            max_rows=settings.MAX_RESULT_ROWS
        )
    else:
        result = await QueryExecutor.execute_external(
            provider=conn["engine"],
            credentials=get_credentials(connection_id),
            sql=val.sanitized_sql,
            timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
            max_rows=settings.MAX_RESULT_ROWS
        )
    
    return {
        "validation": val.model_dump(),
        "result": result.model_dump()
    }

@app.get("/api/v1/history")
async def get_history(request: Request):
    owner_id = _owner_id(request)
    persisted = await asyncio.to_thread(history_store.list, owner_id=owner_id, limit=50)
    by_id = {item["id"]: item for item in persisted}
    # A newly accepted run is visible immediately even while its compatibility
    # history row is being written by the background task.
    for item in QUERY_HISTORY:
        if item.get("owner_id") == owner_id:
            by_id.setdefault(item["id"], {key: item.get(key) for key in (
                "id", "conversation_id", "prompt", "model_id", "connection_id", "created_at"
            )})
    return sorted(by_id.values(), key=lambda item: item.get("created_at") or "", reverse=True)[:50]


@app.get("/api/v1/conversations")
async def get_conversations(request: Request):
    owner_id = await asyncio.to_thread(_owner_id, request)
    return await asyncio.to_thread(conversation_store.list, owner_id=owner_id, limit=50)


@app.get("/api/v1/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    owner_id = await asyncio.to_thread(_owner_id, request)
    await SlayQLPipeline.await_conversation_persistence(conversation_id)
    conversation = await asyncio.to_thread(conversation_store.get, conversation_id, owner_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@app.delete("/api/v1/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request):
    owner_id = await asyncio.to_thread(_owner_id, request)
    await SlayQLPipeline.await_conversation_persistence(conversation_id)
    if not await asyncio.to_thread(conversation_store.delete, conversation_id, owner_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    SlayQLPipeline.invalidate_conversation_context(conversation_id)
    return {"status": "deleted", "id": conversation_id}


@app.post("/api/v1/chat-reports")
async def report_chat_response(req: ChatReportRequest, request: Request):
    if req.message_id.startswith("msg_run_"):
        await SlayQLPipeline.await_run_persistence(req.message_id.removeprefix("msg_"))
    try:
        owner_id = await asyncio.to_thread(_owner_id, request)
        report = await asyncio.to_thread(
            chat_report_store.create,
            owner_id=owner_id,
            message_id=req.message_id,
            category=req.category,
            note=req.note,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not report:
        raise HTTPException(status_code=404, detail="Assistant response was not found.")
    return report


@app.get("/api/v1/admin/chat-reports")
async def list_chat_reports(
    request: Request,
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
):
    _require_admin(request)
    try:
        return chat_report_store.list(status=status, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/v1/admin/chat-reports/{report_id}")
async def update_chat_report(report_id: str, req: AdminReportUpdateRequest, request: Request):
    _require_admin(request)
    try:
        report = chat_report_store.update_status(
            report_id=report_id,
            status=req.status,
            resolution_note=req.resolution_note,
            resolved_at=datetime.now(timezone.utc).isoformat(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not report:
        raise HTTPException(status_code=404, detail="Chat report was not found.")
    return report


@app.delete("/api/v1/history/{history_id}")
async def delete_history(history_id: str, request: Request):
    await SlayQLPipeline.await_history_persistence(history_id)
    owner_id = await asyncio.to_thread(_owner_id, request)
    if not await asyncio.to_thread(history_store.delete, history_id, owner_id):
        raise HTTPException(status_code=404, detail="Chat history entry not found.")
    QUERY_HISTORY[:] = [item for item in QUERY_HISTORY if item.get("id") != history_id]
    return {"status": "deleted", "id": history_id}

@app.get("/api/v1/saved-queries")
async def get_saved_queries():
    return SAVED_QUERIES

@app.post("/api/v1/saved-queries")
async def create_saved_query(req: SaveQueryRequest):
    new_item = {
        "id": f"saved_{uuid.uuid4().hex[:8]}",
        "name": req.name,
        "description": req.description or "",
        "prompt": req.prompt or "",
        "sql": req.sql,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    SAVED_QUERIES.insert(0, new_item)
    return new_item

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
