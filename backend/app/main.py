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
from backend.app.agent.pipeline import SlayQLPipeline, RUN_METADATA_STORE
from backend.app.queries.validator import SqlValidator
from backend.app.queries.executor import QueryExecutor
from backend.app.connections.store import connection_store
from backend.app.connections.runtime import test_external_connection, get_external_catalog
from backend.app.connections.registry import get_connection, get_credentials, get_sqlite_path
from backend.app.history.store import history_store
from backend.app.accounts.store import account_store
from backend.app.workbench.gemini_agent import chart_idiom_payload, gemini_workbench_agent, summarize_result
from backend.app.workbench.health import inspect_sqlite_health

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

class LoginRequest(BaseModel):
    email: Optional[str] = None
    organization_name: Optional[str] = None
    is_reviewer: bool = False
    role: Optional[str] = "Admin"

class CreateRunRequest(BaseModel):
    question: str
    model_id: Optional[str] = "anthropic/claude-sonnet-4.5"
    connection_id: Optional[str] = "sqlite_demo"
    conversation_id: Optional[str] = None

class ExecuteSqlRequest(BaseModel):
    sql: str
    connection_id: Optional[str] = "sqlite_demo"

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
    if required and not session:
        raise HTTPException(status_code=401, detail="Authentication is required.")
    return session


def _owner_id(request: Request) -> str:
    session = _session_from_request(request)
    return session["user"]["id"] if session else "anonymous_demo"


def _refresh_session_profile(user_id: str, profile: Dict[str, Any]) -> None:
    for session in ACTIVE_SESSIONS.values():
        if session.get("user", {}).get("id") == user_id:
            session["user"] = {**session["user"], **profile}


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
    session_data = {
        "token": session_token,
        "user": profile,
        "organization": {
            "id": f"org_{profile['id'].replace('usr_', '')}",
            "name": profile["organization_name"],
            "plan": "Enterprise Trial",
            "region": "us-east-1 (Isolated Cluster)",
            "tier": "Dedicated Tenant"
        },
        "authenticated_at": datetime.now(timezone.utc).isoformat()
    }
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
    if token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[token]
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
        "sqlite_demo_ready": True
    }

@app.get("/api/v1/models")
async def list_models(q: Optional[str] = Query(default=None, max_length=100)) -> List[ModelInfo]:
    return await openrouter_client.list_models(q)

# Dynamic Connections Store
DYNAMIC_CONNECTIONS: Dict[str, Dict[str, Any]] = {
    "sqlite_demo": {
        "id": "sqlite_demo",
        "name": "SlayQL Demo Database (Packaged SQLite)",
        "engine": "sqlite",
        "status": "connected",
        "access_mode": "read_only",
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
        "latency_ms": 18.5,
        "created_at": "2026-08-21T00:00:00Z"
    }
}

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
    if dynamic and (connection_id in {"sqlite_demo", "postgres_demo"} or owner_id is None or dynamic.get("owner_id") == owner_id):
        return dynamic
    return connection_store.get_metadata(connection_id, owner_id=owner_id)


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
    all_connections.update({key: value for key, value in DYNAMIC_CONNECTIONS.items() if key in {"sqlite_demo", "postgres_demo"} or value.get("owner_id") == owner_id})
    for conn_id, conn in all_connections.items():
        # calculate table count
        tbl_count = 7
        if conn["engine"] == "sqlite":
            try:
                cat = CatalogService.get_sqlite_catalog(conn.get("path", settings.SQLITE_DEMO_PATH))
                tbl_count = len(cat.tables)
            except Exception:
                pass
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
        data_path=str(destination),
        owner_id=owner_id,
    )
    metadata.update({"path": str(destination), "status": "connected"})
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
        elif not connection_store.get_credentials(connection_id) and settings.APP_ENV == "demo":
            result = {"status": "healthy", "message": "Demo connection is available. Add credentials to verify a live provider."}
        else:
            result = test_external_connection(conn["engine"], connection_store.get_credentials(connection_id))
        connection_store.update_status(connection_id, "connected")
        result.update({"connection_id": connection_id, "engine": conn["engine"], "latency_ms": round((time.perf_counter() - started) * 1000, 1)})
        return result
    except Exception as exc:
        connection_store.update_status(connection_id, "error")
        return {"status": "error", "connection_id": connection_id, "engine": conn["engine"], "latency_ms": round((time.perf_counter() - started) * 1000, 1), "message": str(exc)}

@app.delete("/api/v1/connections/{connection_id}")
async def delete_connection(connection_id: str, request: Request):
    if connection_id in ["sqlite_demo", "postgres_demo"]:
        raise HTTPException(status_code=400, detail="Default demo database connections cannot be deleted.")
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    data_path = conn.get("path")
    if data_path and Path(data_path).resolve().parent == connection_store.data_dir.resolve():
        Path(data_path).unlink(missing_ok=True)
    DYNAMIC_CONNECTIONS.pop(connection_id, None)
    connection_store.delete(connection_id)
    return {"status": "deleted"}

@app.get("/api/v1/connections/{connection_id}/catalog")
async def get_connection_catalog(connection_id: str, request: Request):
    conn = _connection_metadata(connection_id, _owner_id(request))
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    if conn.get("engine") != "sqlite":
        try:
            return get_external_catalog(conn["engine"], connection_store.get_credentials(connection_id))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Could not inspect this data source: {exc}") from exc
    db_path = conn.get("path", settings.SQLITE_DEMO_PATH) if conn else settings.SQLITE_DEMO_PATH
    catalog = CatalogService.get_sqlite_catalog(db_path)
    return catalog


def _catalog_for_connection(conn: Dict[str, Any], connection_id: str):
    if conn.get("engine") == "sqlite":
        return CatalogService.get_sqlite_catalog(get_sqlite_path(connection_id) or settings.SQLITE_DEMO_PATH)
    return get_external_catalog(conn["engine"], get_credentials(connection_id))


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
        result = await QueryExecutor.execute_sqlite(get_sqlite_path(connection_id) or settings.SQLITE_DEMO_PATH, validation.sanitized_sql, settings.QUERY_TIMEOUT_SECONDS, settings.MAX_RESULT_ROWS)
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
            diagnostics = inspect_sqlite_health(get_sqlite_path(connection_id) or settings.SQLITE_DEMO_PATH)
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


@app.post("/api/v1/agent-runs")
async def create_agent_run(req: CreateRunRequest, request: Request):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    owner_id = _owner_id(request)
    if not _connection_metadata(req.connection_id or "sqlite_demo", owner_id):
        raise HTTPException(status_code=404, detail="Selected data source was not found in this workspace.")
    session = _session_from_request(request)
    credits_remaining = None
    if session:
        profile = account_store.consume_credit(session["user"]["id"], 1, "AI query")
        if not profile:
            raise HTTPException(status_code=402, detail="Not enough credits to run this query.")
        _refresh_session_profile(profile["id"], profile)
        credits_remaining = profile["credits"]
        
    run_response = SlayQLPipeline.create_run(
        question=req.question.strip(),
        model_id=req.model_id or settings.DEFAULT_MODEL,
        connection_id=req.connection_id or "sqlite_demo",
        conversation_id=req.conversation_id
    )

    # Record in history
    history_item = {
        "id": run_response["run_id"],
        "conversation_id": run_response["conversation_id"],
        "prompt": req.question.strip(),
        "model_id": req.model_id,
        "connection_id": req.connection_id,
        "owner_id": owner_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    QUERY_HISTORY.insert(0, history_item)
    history_store.add(
        run_id=history_item["id"],
        conversation_id=history_item["conversation_id"],
        prompt=history_item["prompt"],
        model_id=history_item["model_id"],
        connection_id=history_item["connection_id"],
        created_at=history_item["created_at"],
        owner_id=owner_id,
    )

    return {**run_response, "credits_remaining": credits_remaining}

@app.get("/api/v1/agent-runs/{run_id}/events")
async def get_run_events_stream(run_id: str):
    """
    Server-Sent Events endpoint streaming the live SlayQL query lifecycle.
    """
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
async def cancel_agent_run(run_id: str):
    success = SlayQLPipeline.cancel_run(run_id)
    return {"cancelled": success, "run_id": run_id}

@app.post("/api/v1/agent-runs/{run_id}/execute")
async def execute_edited_sql(run_id: str, req: ExecuteSqlRequest):
    """
    Executes user-edited SQL against the read-only demo database with full AST safety validation.
    """
    conn = _connection_metadata(req.connection_id or "sqlite_demo")
    if not conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")
    try:
        if conn.get("engine") == "sqlite":
            catalog = CatalogService.get_sqlite_catalog(get_sqlite_path(req.connection_id or "sqlite_demo") or settings.SQLITE_DEMO_PATH)
            dialect = "sqlite"
        else:
            catalog = get_external_catalog(conn["engine"], get_credentials(req.connection_id or "sqlite_demo"))
            dialect = "postgres" if conn["engine"] in {"postgresql", "supabase"} else conn["engine"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not inspect this data source: {exc}") from exc
    val = SqlValidator.validate_and_sanitize(req.sql, dialect=dialect, catalog=catalog)
    
    if not val.is_valid:
        raise HTTPException(status_code=400, detail=val.error_message or "SQL Validation failed")

    if conn.get("engine") == "sqlite":
        result = await QueryExecutor.execute_sqlite(
            db_path=get_sqlite_path(req.connection_id or "sqlite_demo") or settings.SQLITE_DEMO_PATH,
            sql=val.sanitized_sql,
            timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
            max_rows=settings.MAX_RESULT_ROWS
        )
    else:
        result = await QueryExecutor.execute_external(
            provider=conn["engine"],
            credentials=get_credentials(req.connection_id or "sqlite_demo"),
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
    return history_store.list(owner_id=_owner_id(request), limit=50)


@app.delete("/api/v1/history/{history_id}")
async def delete_history(history_id: str, request: Request):
    if not history_store.delete(history_id, _owner_id(request)):
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
