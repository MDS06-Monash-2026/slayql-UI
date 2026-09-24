# SlayQL

SlayQL is an agentic Text-to-SQL workspace for exploring relational data. A user asks a question in natural language, SlayQL finds the relevant schema and values, generates read-only SQL, validates it, executes it against the selected connection, and presents the result as a table and (when useful) a chart.

**SlayQL answers questions from your company's data, and tells you when not to trust the answer.** Every answer passes through a trust layer that checks it for double counting, silently included cancelled records and dates outside the data, compares independently written queries, and returns one of four outcomes: confident, caveat, clarify (showing each interpretation's number) or hand-off to an analyst. The project direction, business case and evaluation design are in [`docs/PROJECT_DIRECTION.md`](docs/PROJECT_DIRECTION.md); the current status is in [`docs/HANDOFF.md`](docs/HANDOFF.md).

This repository contains both sides of the application:

- **Frontend:** a React 19/Vite single-page application with the product UI, query workspace, database lab, and visualization tools.
- **Backend:** a FastAPI service that owns authentication, persistence, catalog discovery, connection credentials, the SlayQL agent pipeline, SQL safety checks, query execution, and AI workbench services.

## What It Includes

### Frontend application

The SPA uses route-aware views (browser paths and history navigation work without a separate router dependency):

- `/` - product landing page with the SlayQL pipeline, benchmark/ablation context, and a guided entry into the demo.
- `/login` - organization/reviewer sign-in flow backed by the API session endpoint.
- `/demo` - conversational Text-to-SQL workspace.
- `/dashboard` - workspace dashboard shell and database/query summary views.
- `/database-lab` - database administration and analysis center (also available at `/databases`, `/lab`, and `/ai-database-lab`).
- `/profile` - profile, organization, credits, theme, and sign-out controls.

The live demo supports:

- Natural-language prompts and follow-up questions in a persistent conversation.
- Model selection and thinking-effort controls (the server decides which configured model executes SQL).
- Streaming agent progress over Server-Sent Events (SSE), including retrieval, relationship expansion, value grounding, SQL generation, validation, and execution status.
- A SQL editor with syntax highlighting, copy, edit, and run actions.
- Result tables with column metadata, row counts, truncation state, and empty/error states.
- Chart recommendations and interactive Vega/Vega-Lite visualizations.
- Query history, saved queries, conversation restore/delete, and response reporting.
- Connection add/test/edit/delete flows, including SQLite upload and direct database credentials.
- Light/dark theme support, responsive sidebars/drawers, keyboard-friendly dialogs, loading states, and recoverable error notices.

### UX and UI approach

SlayQL is designed as an analyst tool rather than a marketing-only prototype. The interface uses a clear workspace hierarchy: navigation and connection context stay visible, while the main pane is reserved for the conversation, editor, catalog, or result being inspected. Dense information is made scannable with compact panels, monospace SQL, syntax colors, table headers, relationship lines, and status badges.

Interaction details are treated as part of the product behavior:

- Streaming progress is rendered as an ordered trace so users can see what the agent is doing without exposing hidden chain-of-thought.
- Drawers and dialogs handle catalog browsing, saved queries, connections, reports, and confirmations without losing the current query.
- Every network-heavy action has loading, success, empty, and retryable error states; destructive actions require confirmation.
- Editors support keyboard shortcuts, cursor position, copy, accept/reject, and run workflows that preserve the user’s draft.
- Tables and charts share the same result payload, so users can move from raw rows to visual analysis without rerunning a query.
- Light and dark themes, responsive layouts, visible focus styles, and mobile-friendly controls keep the workspace usable across screen sizes.

### Database Lab

The database lab is a focused interface for inspecting and working with a selected data source. Its sections are addressable as `/database-lab/<section>`:

1. **SQL Workbench** - write and execute safe SQL, inspect result rows, and use Cursor AI (`Ctrl+K`/`Cmd+K`) to request an explainable SQL edit. Suggestions can be accepted, rejected, or run immediately.
2. **Tables and columns** - search the discovered catalog, expand tables, inspect types/keys/row estimates, and open a table directly in the workbench.
3. **ER Diagram** - view foreign-key relationships with zoom/pan and multi-hop structure.
4. **AI Report Studio** - turn a result into a dashboard/report layout with chart selection and report editing assistance.
5. **Health Agent** - inspect SQLite/database health and receive an AI-assisted interpretation (with deterministic local fallback when Gemini is not configured).

The lab keeps selected connection/catalog and recent result state in a short-lived client cache so moving between sections does not discard work. Catalog refresh, connection testing, table management, and unsaved-dashboard prompts are built into the UI.

### Backend services

The API is implemented in `backend/app/main.py` and is organized into catalog discovery, connections, accounts/sessions, history, query validation/execution, providers, and workbench modules. Important capabilities include:

- Versioned JSON APIs under `/api/v1` and interactive OpenAPI docs at `/api/docs`.
- Email/reviewer demo login, bearer sessions, profile/avatar updates, credits, logout, and admin chat-report review.
- Account-owned connections for managed SQLite uploads and direct PostgreSQL, Supabase, MySQL, and Snowflake sources.
- Catalog discovery with columns, types, primary keys, foreign keys, row estimates, sample values, and refresh support.
- SlayQL pipeline stages for schema retrieval, foreign-key graph expansion (RBP), BM25/value grounding, structured SQL generation, validation, bounded repair/retry, and execution.
- SSE run streaming plus cancellation and explicit execute endpoints.
- Read-only SQL policy enforcement, dialect-aware parsing with `sqlglot`, result row limits, timeouts, and sanitized SQL responses.
- Persistent conversations, query history, saved queries, feedback reports, and control-database metadata.
- Gemini-backed workbench assistance for SQL, chart idioms, dashboards, reports, and database health, with local deterministic fallbacks.

### Trust layer, review queue and audience game

- `backend/app/verification/`: grain (fan-out), definition, period and sanity checks; result-based consensus across candidate queries; a logistic confidence score compared with the threshold `c / (1 + c)`, where `c` is how much worse a wrong answer is than a right one (`VERIFY_DEFAULT_PENALTY`, default 4).
- `backend/app/knowledge/`: approved business definitions (versioned, injected into SQL generation and enforced by the checks), analyst-verified queries, and the review queue for hand-offs, clarifications and flagged answers.
- `backend/app/arena/`: Trust or Bust, the live audience game and user study (`/play`, `/arena/screen`, `/arena/host`).
- `PRIVACY_MODE=true` masks personal-data columns (names, emails, phones, MyKad numbers) before values reach AI providers; every answer records what was sent.
- New pages: `/review` (review queue) and `/definitions` (definitions library) for analysts and admins.

## Evaluation

```bash
python -m backend.eval.datasets.build_trap_set            # rebuild and check the business trap set
python -m backend.eval.generate --dataset trap            # paid phase: cached candidate SQL
python -m backend.eval.generate --dataset bird --concurrency 12 --budget 15
python -m backend.eval.evaluate --dataset trap            # free: scores B0-B3, writes backend/eval/results/
python -m backend.eval.evaluate --dataset bird --fit      # fits a BIRD-specific calibration on the fit half
```

BIRD Mini-Dev (CC BY-SA 4.0) goes in `backend/eval/data/minidev/` (git-ignored). Every published figure must come from `backend/eval/results/`.

## Data and Database Setup

SlayQL separates its **control database** (application state) from user-selected **query databases**. The control database is never exposed to the SQL agent as a selectable source.

By default, local development uses SQLite files under `backend/data`:

- `slayql_demo.sqlite3` - packaged read-only demo source (AdventureWorks-style related data, suitable for the live demo and lab).
- `slayql_control.sqlite3` - local persistence for accounts, sessions, connections, history, and saved queries.

For deployed persistence, set `DATABASE_URL` to a PostgreSQL URI (for example, a Supabase **Connect** URI) and optionally set `BACKEND_DATABASE_SCHEMA=slayql`. When `DATABASE_URL` is set, it is used only by the backend control store; it is not registered as a query connection.

Connection credentials are encrypted with `FIELD_ENCRYPTION_KEY`. Managed uploads are stored under `CONNECTION_DATA_DIR`. Use read-only database users for direct connections. The API validates connection details with a `SELECT 1` check and never returns stored credentials to the browser or an AI provider.

## Environment Variables

Copy `.env.example` to `.env` and fill only the values needed for your environment:

```dotenv
# API/runtime
APP_ENV=demo
DEBUG=false
LOG_LEVEL=INFO

# AI gateway (used for agentic SQL generation)
OPENROUTER_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_EXECUTION_MODEL=deepseek/deepseek-v4-flash
DEFAULT_MODEL=deepseek/deepseek-v4-flash

# Optional direct provider/workbench keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=

# Backend persistence and local data
DATABASE_URL=
BACKEND_DATABASE_SCHEMA=slayql
SQLITE_DEMO_PATH=backend/data/slayql_demo.sqlite3
CONTROL_DB_PATH=backend/data/slayql_control.sqlite3
CONNECTION_DATA_DIR=backend/data/connections
FIELD_ENCRYPTION_KEY=

# Guardrails
MAX_ACTIVE_RUNS=5
QUERY_TIMEOUT_SECONDS=10
MAX_RESULT_ROWS=200
```

Generate an encryption key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Never put provider keys, database URLs, or encryption keys in `VITE_*` variables. Vite variables are compiled into browser assets.

## Run Locally

Prerequisites: Node.js 18+, npm, Python 3.11+ (3.12 recommended), and a virtual environment for the API.

### Backend

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`; health is `GET /api/v1/health` and docs are `http://localhost:8000/api/docs`.

### Frontend

```bash
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend uses the API prefix configured by the client service; for a separate API host, set `VITE_API_BASE_URL` in `.env.local` (for example, `http://localhost:8000/api/v1`).

Production checks:

```bash
npm run build
npm run preview
```

## API Surface (Summary)

The complete contract is generated by FastAPI at `/api/openapi.json`. The main resource groups are:

| Group | Representative endpoints | Purpose |
| --- | --- | --- |
| Auth/profile | `/auth/login`, `/session`, `/profile`, `/credits` | Sessions, account data, credits |
| Connections | `/connections`, `/connections/{id}/test`, `/connections/{id}/catalog` | Add sources and inspect/refresh catalogs |
| Agent runs | `/agent-runs`, `/agent-runs/stream`, `/agent-runs/{id}/events`, `/cancel`, `/execute` | Generate, stream, cancel, and execute SQL runs |
| Workbench | `/connections/{id}/workbench/query`, `/workbench/ai/*` | SQL editor, charts, dashboards, reports, health |
| History | `/history`, `/conversations`, `/saved-queries` | Persist and reuse analysis work |
| Feedback/admin | `/chat-reports`, `/admin/chat-reports` | Report and review assistant responses |

## Architecture

```text
React/Vite SPA
  -> services/api.js + services/sse.js
  -> FastAPI (/api/v1)
     -> account/session + control database
     -> connection registry + catalog discovery
     -> SlayQL retrieval/RBP/BM25 pipeline
     -> sqlglot validator + read-only executor
     -> OpenRouter/Gemini provider clients
     -> SQLite/PostgreSQL/MySQL/Snowflake sources
```

Key directories:

```text
src/
  views/                 # route-level screens
  components/demo/       # live demo chat, catalog, SQL, results, dialogs
  components/workbench/  # SQL workbench, charts, reports, health
  services/              # REST and SSE clients
backend/app/
  agent/                 # retrieval, RBP, orchestration, pipeline
  catalog/               # schema discovery
  connections/           # encrypted metadata and runtime connections
  queries/               # SQL validation and execution
  workbench/             # Gemini assistance and health/report agents
  accounts/, history/    # persistence and session/history stores
```

## Safety and Privacy

- Only one read-only `SELECT`/safe CTE statement is accepted; DML/DDL, stacked statements, system schemas, and unsafe file/database functions are rejected.
- Queries are parsed and checked against the discovered catalog before execution, with a configurable timeout and maximum result rows.
- AI requests go through OpenRouter (and Gemini for workbench features) to providers outside Malaysia. They contain the user question, the relevant schema, up to 8 database values that match the question (for grounding), and, at every thinking effort above minimal, up to 25 result rows for the written answer. At high and max effort, result profiles are also sent for chart planning. Credentials, control-database secrets, and full databases are never sent to providers. Enable privacy mode to mask personal-data columns before anything is sent.
- Result rows are not written to the control database; history stores run metadata, SQL, status, and result summaries.
- Provider and database failures are surfaced as recoverable UI states rather than silently switching providers.

## Testing

> **Warning:** a developer `.env` may point `DATABASE_URL` at the production control database and `VITE_API_BASE_URL` at the live site. Tests isolate themselves (`backend/tests/conftest.py`) and so does the evaluation harness, but when running the app locally set `DATABASE_URL=` and `VITE_API_BASE_URL=http://localhost:<port>/api/v1` explicitly, and check that `/api/v1/health` reports `"backend_database": "sqlite"`.

Backend tests live in `backend/tests` and can be run with:

```bash
pytest
```

Run `npm run build` as the frontend smoke test. For deployment, see [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md). The streaming and visualization interaction details are documented in [`docs/SLAYQL_STREAMING_AND_VISUALIZATION_UX_PLAN.md`](docs/SLAYQL_STREAMING_AND_VISUALIZATION_UX_PLAN.md).

## Research Context

SlayQL builds on schema exploration and schema-linking research, including AutoLink:

Wang et al. (2025), *AutoLink: Autonomous Schema Exploration and Expansion for Scalable Schema Linking in Text-to-SQL at Scale.* [arXiv:2511.17190](https://arxiv.org/abs/2511.17190)
