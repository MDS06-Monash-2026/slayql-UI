# SlayQL High-Fidelity Enterprise Demo Implementation Plan

## 1. Document purpose

This document is the implementation source of truth for converting the current SlayQL frontend prototype into a complete, public, high-fidelity enterprise product demo.

The detailed SSE query lifecycle, safe reasoning-trace UX, SQL reveal and validation flow, visualization studio, saved charts, dashboard behavior, event contracts, and related UAT are specified in `docs/SLAYQL_STREAMING_AND_VISUALIZATION_UX_PLAN.md`. Implement both documents together.

The demo is expected to support no more than five simultaneous users. It does not need production-scale concurrency, AWS infrastructure, multi-region recovery, formal compliance certification, or a self-hosted model. It must nevertheless look and behave like a credible final enterprise product.

The essential path must be real:

- Real login and authenticated sessions.
- Real organization/workspace membership.
- Real SQLite and PostgreSQL demo connections.
- Real catalog discovery.
- Real SlayQL orchestration.
- Real third-party model API calls.
- Real provider and model selection.
- Real SQL validation and read-only execution.
- Real result tables, charts, history, token usage, and audit activity.

Complex enterprise integrations may be represented by polished seeded demo states. Seeded information must be visibly marked as demo data and must never be presented as a completed external integration.

## 2. Locked decisions

- Host the complete demo on the existing VPS. Do not purchase AWS compute.
- Serve the Vite frontend as static files through Caddy or Nginx.
- Run one FastAPI backend container on the VPS.
- Use one Neon PostgreSQL project for SlayQL control data and one separate Neon project as the example customer database.
- Package a read-only SQLite database with the backend.
- Use WorkOS AuthKit for real email login and sessions.
- Use backend-owned, budget-limited API keys for OpenAI, Anthropic, and DeepSeek.
- Let users select an enabled provider and model from the SlayQL UI.
- Do not host an AI model on the VPS. SlayQL is the orchestration architecture, not the model itself.
- Permit only read-only SQL in the demo.
- Use synthetic data only.
- Optimize for a polished experience and reliable presentation, not scale.

## 3. Current repository assessment

The current repository is a React 19, Vite, Tailwind CSS v4, Lucide, and Recharts frontend prototype. It already provides useful visual starting points for landing, onboarding, dashboard navigation, query input, reasoning trace, results, database status, schema exploration, and history.

The implementation is not yet a functional product:

- `src/App.jsx` uses local view state rather than URL routing and protected routes.
- `src/views/OnboardingView.jsx` simulates provisioning and indexing with timers.
- `src/views/DashboardView.jsx` contains unfinished sections.
- `src/lib/api/database.js`, `query.js`, and `history.js` return mock data.
- `src/mock/mockData.js` drives SQL, results, charts, and pipeline events.
- Database credentials are collected by the UI but never securely transmitted or stored.
- There is no authentication, backend, persistence, provider gateway, SQL parser, or real execution.
- Some JSX uses `class` instead of `className`.
- Browser `alert()` calls are used instead of in-product validation and notifications.
- Some source text contains broken character encoding.
- Model references and reasoning events are hardcoded rather than derived from an actual run.
- Loading, empty, error, permission, provider-outage, and cancellation states are incomplete.

The implementation must progressively replace these behaviors. Production/demo builds must not silently fall back to mock data. A separate explicit visual test mode may retain mock fixtures for automated tests.

## 4. What must be real and what may be seeded

| Capability | Demo requirement |
| --- | --- |
| Email login, logout, session expiry | Real |
| Demo organization and membership | Real |
| SQLite and PostgreSQL health checks | Real |
| Schema and relationship discovery | Real |
| OpenAI, Anthropic, DeepSeek calls | Real |
| Provider and model switching | Real |
| SlayQL retrieval and SQL generation pipeline | Real |
| SQL safety validation | Real |
| Read-only query execution and cancellation | Real |
| Query history and saved queries | Real |
| Token and estimated cost reporting | Real |
| Core audit events | Real |
| Member directory and simple roles | Real |
| Enterprise SAML/SCIM configuration | Seeded interactive preview |
| Contract billing and invoices | Seeded interactive preview |
| Advanced approval chains | Seeded, with one functional approval example |
| Complex governance policy editor | Seeded, with read-only policy enforced for real |
| SOC 2, disaster recovery, data residency | Documentation/status preview only |

## 5. Target architecture

```text
Browser
  |
  | HTTPS
  v
Caddy on existing VPS
  |-- /                -> static Vite build
  |-- /api/*           -> FastAPI
  |-- /api/v1/runs/*   -> FastAPI SSE stream
                          |
                          |-- WorkOS AuthKit
                          |-- Neon SlayQL control database
                          |-- SQLite read-only demo database
                          |-- Neon customer-demo PostgreSQL
                          |-- OpenAI API
                          |-- Anthropic API
                          `-- DeepSeek API
```

Use Docker Compose with two application containers:

- `web`: static frontend build served by Caddy, or Caddy serving a mounted `dist` directory.
- `api`: FastAPI with one Uvicorn worker.

Do not add Redis, Celery, Kafka, Kubernetes, an API gateway, a GPU runtime, or a vector database. Five concurrent users do not justify them. Use PostgreSQL for durable state and bounded in-process async tasks for active runs.

## 6. Repository additions and organization

Keep the current frontend structure and add:

```text
backend/
  app/
    api/
    auth/
    agent/
    catalog/
    connectors/
    models/
    providers/
    queries/
    audit/
    settings.py
    main.py
  migrations/
  tests/
  pyproject.toml
deploy/
  Caddyfile
  docker-compose.yml
  Dockerfile.web
  Dockerfile.api
docs/
contracts/
  openapi.json
```

Frontend application code must be migrated incrementally from JSX to strict TypeScript. Do not stop feature work for an all-at-once rewrite.

## 7. Frontend technology additions

Add and use:

- React Router for URL routing and protected layouts.
- TanStack Query for API state, caching, mutation state, and invalidation.
- React Hook Form and Zod for forms and validation.
- Monaco Editor for generated and edited SQL.
- TanStack Table plus virtualization for result tables.
- Zustand only for temporary query-workspace state.
- Radix primitives for dialogs, menus, tabs, tooltips, and accessible overlays.
- `date-fns` for dates.
- Generated OpenAPI client types for backend calls.
- Vitest, React Testing Library, MSW, Axe, and Playwright.

Do not store authentication secrets, provider API keys, or database passwords in frontend state, local storage, or any `VITE_*` variable.

## 8. Information architecture and routes

Implement these routes:

```text
/
/login
/auth/callback
/demo-access
/onboarding
/app
/app/query/new
/app/query/:runId
/app/data
/app/data/:connectionId
/app/catalog
/app/history
/app/saved
/app/approvals
/app/models
/app/admin/members
/app/admin/policies
/app/admin/audit
/app/admin/usage
/app/admin/billing
/app/admin/security
```

Routing behavior:

- Unauthenticated users may access `/`, `/login`, `/auth/callback`, and `/demo-access` only.
- Authenticated users without a completed workspace are redirected to `/onboarding`.
- Authenticated and onboarded users enter `/app`.
- Admin routes require the Owner or Admin demo role.
- Refreshing any route must preserve the current page through server-side SPA fallback.
- Browser back/forward behavior must work correctly.

## 9. Visual and interaction direction

The authenticated application must feel like an operational data workspace, not a marketing page.

- Use a restrained neutral foundation with distinct accent colors for actions, success, warning, risk, and errors.
- Avoid an interface dominated by indigo, purple, or dark slate.
- Keep cards at 8px radius or less.
- Do not place cards inside cards.
- Use full-width work surfaces and compact panels.
- Keep typography smaller and denser inside the workspace than on the landing page.
- Use Lucide icons for familiar actions and add tooltips to unfamiliar icon-only controls.
- Use stable toolbar, table, editor, sidebar, and result dimensions so loading content does not shift the layout.
- Use status text plus color; never rely on color alone.
- Reserve animation for progress, transitions, and state changes. Do not use decorative AI animation.
- Do not show hidden model chain-of-thought. Show SlayQL operational evidence instead.

Define design tokens for surface, border, text, muted text, accent, success, warning, danger, focus, spacing, radius, shadow, and control height. Remove one-off hardcoded styles as components are migrated.

## 10. Authentication UX

### Login page

The login page must include:

- SlayQL name as the primary first-viewport signal.
- Email one-time-code or magic-link authentication.
- Google login if enabled in WorkOS.
- A clearly separate `Enter reviewer demo` action.
- Terms and privacy links.
- Loading, invalid email, expired code, invalid callback, service unavailable, and rate-limit states.
- Return-to behavior so users continue to their intended page after login.

Do not place marketing feature descriptions around the login controls.

### Reviewer access

The reviewer flow creates or reuses a restricted demo user and places the user in `SlayQL Demo Workspace`. It must not reveal shared credentials in frontend source code. The backend owns the reviewer access token or code.

### Session UX

- Show the current user, workspace, and role in the application header.
- Provide logout and session-expired recovery.
- Preserve unsent query drafts across a session refresh.
- Do not preserve provider keys or database credentials in the browser.

## 11. Onboarding UX

Replace the current simulated cluster provisioning flow with a four-step wizard:

1. **Workspace**: create or join the demo workspace.
2. **Data source**: choose packaged SQLite or hosted PostgreSQL.
3. **AI model**: choose an enabled provider and model.
4. **First question**: run a guided question and enter the workspace.

Requirements:

- Each step must be URL or state-machine addressable and resumable.
- Validate inline; do not use browser alerts.
- Test database and provider health for real.
- Explain only information needed to complete the current step.
- Display exact connection failures and recovery actions.
- Show schema discovery progress based on real backend events.
- Allow the user to skip guided examples after the database and model are ready.

## 12. Application shell

Evolve the current dashboard into:

- Collapsible primary navigation.
- Workspace switcher with one real demo workspace and seeded future workspaces.
- Global database selector.
- Global provider/model selector.
- Search or command menu for pages, saved queries, and schema assets.
- Notification menu for query, provider, and connection events.
- User and role menu.
- Compact service health indicator.

Primary navigation:

- Home
- Query
- Data
- Catalog
- History
- Saved
- Approvals
- Models
- Administration

Mobile navigation must use a proper overlay drawer with focus trapping and must not overlap content.

## 13. Workspace home

Replace decorative welcome content with useful operational information:

- Start-query action.
- Selected database and model.
- Recent query runs.
- Saved queries.
- Database health.
- Provider status.
- Usage against the demo budget.
- Suggested questions derived from the selected schema.
- Pending approval example.

Every item must link to the relevant detailed screen.

## 14. Query workspace UX

The query workspace is the primary demo experience.

### Composer

- Multi-line natural-language input.
- Schema, table, column, metric, and saved-query mentions.
- Selected database and model controls.
- Suggested questions based on the active source.
- Submit and cancel controls.
- Draft persistence.
- Prompt length and quota feedback only near limits.

### Agent progress

Convert the current reasoning trace into a factual SlayQL execution timeline:

- Intent classified.
- Relevant schema retrieved.
- Foreign-key graph expanded.
- Value grounding completed.
- Provider and model called.
- SQL candidate parsed.
- Identifiers verified.
- Read-only policy evaluated.
- Query executed.
- Result shape verified.

Each step may show duration, status, and concise evidence. Never show private chain-of-thought, including reasoning content returned by a provider.

### SQL panel

- Monaco editor with SQL formatting and syntax highlighting.
- Dialect and connection labels.
- Validation markers.
- Read-only risk badge.
- Referenced tables and columns.
- Copy, format, edit, regenerate, compare, and run controls.
- Diff when a regeneration changes SQL.
- Explicit notice when the SQL was edited after generation.

### Clarification

If schema or intent is ambiguous, SlayQL must ask a concise question using selectable options while retaining the original prompt and agent run.

## 15. Results UX

Provide tabs for:

- Answer
- Table
- Chart
- SQL
- SlayQL trace
- Lineage

Result capabilities:

- Virtualized table with stable column widths.
- Sort, filter, resize, hide, and copy.
- Result row count, execution time, and truncation notice.
- Recharts visualization selected from result shape.
- Editable chart type, label, category, and measure.
- Empty, partial, cancelled, timeout, and source-error states.
- Save query, replay, compare model, and export synthetic data.
- Provider, model, token counts, and estimated cost.

Do not pretend a chart is meaningful if the result shape is unsuitable. Default to the table when uncertain.

## 16. Model selection and comparison UX

### Model selector

Place a compact selector in the application header and query toolbar. Display:

- Provider name.
- Model display name.
- Cost tier.
- Availability.
- Capability indicators for structured output, reasoning, and streaming.

The expanded selector groups models by provider and shows a short neutral description. Do not claim one provider is universally better.

### Initial allowlist

OpenAI:

- `gpt-5.6-terra` as the balanced default when available.
- `gpt-5.6-luna` as the cost-sensitive option when available.
- `gpt-5.5` as an optional comparison model when available to the account.

Anthropic:

- The current enabled Claude Sonnet model.
- The current enabled Claude Haiku model.
- Fetch exact model identifiers from the provider Models API, then approve them in the SlayQL model registry.

DeepSeek:

- `deepseek-v4-flash`.
- `deepseek-v4-pro`.
- Do not use retired `deepseek-chat` or `deepseek-reasoner` identifiers.

Provider names and prices change. Keep them in backend configuration/database records, not frontend constants. Verify provider model access during startup and mark inaccessible models unavailable.

### Comparison experience

Allow a user to run the same prompt and schema context against two enabled models. Compare:

- Generated SQL.
- Validation outcome.
- Execution success.
- Result equivalence.
- Generation latency.
- Input/output tokens.
- Estimated cost.

The comparison must not automatically execute unsafe or invalid SQL. It must not rank models using invented confidence scores.

## 17. Data connections UX

### Connections list

Show:

- SQLite Demo and PostgreSQL Demo.
- Engine, status, schema count, last sync, latency, and access mode.
- Connect/test, browse catalog, resync, and open workspace actions.
- Healthy, syncing, stale, unavailable, and permission-error states.

### Connection detail

Include:

- Overview.
- Read-only credential status.
- Schema allowlist.
- Catalog sync history.
- Tables and relationships.
- Test diagnostics.
- Seeded enterprise options such as private gateway and credential rotation, marked as preview.

Do not show secret values after initial configuration.

## 18. Catalog UX

Implement a functional catalog for both real demo databases:

- Search schemas, tables, columns, and descriptions.
- Expandable schema tree.
- Table detail with columns, types, keys, and row estimate.
- Relationship graph with stable dimensions and usable zoom/pan.
- Sensitivity badges from seeded metadata.
- Verified-query and business-term examples.
- `Use in query` action.
- Stale metadata state and resync action.

The current Data Explorer can be retained and evolved, but it must load real catalog data.

## 19. History, saved queries, and approvals

### History

- Persist real agent and query runs.
- Search and filter by database, provider, model, status, date, and user.
- Display prompt, SQL preview, model, duration, row count, and cost.
- Open, replay, save, and compare.
- Do not persist query result rows.

### Saved queries

- Name, description, tags, owner, database, SQL, and original prompt.
- Run and duplicate actions.
- Seed a small shared collection.

### Approvals

Implement one functional demonstration: a query marked sensitive by seeded column metadata requires an Owner to approve before execution. Other approval-chain options may be seeded previews.

## 20. Enterprise administration UX

These screens must look complete even where their data is seeded:

### Members

- Real logged-in members and seeded example members.
- Roles: Owner, Admin, Analyst, Approver, Viewer.
- Invite, role change, deactivate, and search interactions.
- Seeded actions must not send email or mutate external identity systems.

### Policies

- Real enforced read-only policy.
- Seeded sensitive-column, row-limit, export, and approval policies.
- Human-readable summary and advanced policy preview.

### Audit

Persist real events for login, logout, provider selection, database selection, run creation, validation, execution, cancellation, and approval. Mix in seeded enterprise events only when tagged `Demo data`.

### Usage

- Real calls, tokens, latency, estimated cost, and errors by provider/model.
- Per-user and per-day breakdown.
- Demo budget progress.
- Seeded contract quota preview.

### Billing

Show a high-fidelity contract/usage layout with seeded plan, invoice, and entitlement data. Label it as a preview and do not integrate a payment provider.

### Security

Show real current-session details and seeded SSO, SCIM, MFA, retention, and data-control settings. Clearly identify features that are not active in the demo.

## 21. Accessibility and responsive behavior

Target WCAG 2.2 AA:

- All controls operable by keyboard.
- Visible focus indicators.
- Correct landmarks and heading order.
- Labels and descriptions for every form field.
- Focus trapping and restoration for dialogs and drawers.
- Live regions for agent progress and notifications.
- Reduced-motion support.
- Sufficient contrast.
- No color-only status communication.
- Minimum usable pointer targets.
- Screen-reader-friendly data table summaries.

Test desktop at 1440x900 and 1280x720, tablet at 768x1024, and mobile at 390x844. Text, controls, editors, tables, and overlays must not overlap or overflow incoherently.

## 22. Backend implementation

Use Python 3.12 with:

- FastAPI and Uvicorn.
- Pydantic settings and schemas.
- SQLAlchemy async and asyncpg.
- Alembic migrations.
- `sqlglot` for SQL parsing and dialect handling.
- Official OpenAI and Anthropic SDKs.
- An HTTP client or OpenAI-compatible client for DeepSeek.
- `aiosqlite` for SQLite.
- Server-sent events for run progress.
- Structured JSON logs with request IDs.
- Pytest and Testcontainers.

Use one Uvicorn worker so active in-process run state, cancellation, and rate limiting remain coherent. Set a global semaphore of five active agent runs and a per-user semaphore of one active run.

## 23. Provider-neutral model gateway

Define a backend interface equivalent to:

```text
ModelProvider
  list_models()
  health()
  generate(request)
  generate_stream(request)
  normalize_usage(response)
  normalize_error(error)
```

Normalized request fields:

- Provider and model ID.
- System instructions.
- User question.
- Bounded SlayQL schema context.
- Required JSON response schema.
- Reasoning/quality profile.
- Maximum output tokens.
- Timeout.

Normalized response fields:

- Provider and model ID.
- Structured final output.
- Input, cached-input, reasoning, and output token counts when available.
- First-token and total latency.
- Finish reason.
- Provider request ID.

Normalized errors:

- Invalid credentials.
- Rate limited.
- Insufficient balance or budget exhausted.
- Model unavailable.
- Context too large.
- Invalid structured response.
- Timeout.
- Provider service failure.

Never automatically transfer a failed request to another provider. Preserve the prompt and offer `Retry` and `Switch model`; switching provider requires user confirmation because data-handling terms differ.

## 24. SlayQL agent pipeline

Implement these real stages:

1. Validate and normalize the question.
2. Retrieve relevant schema candidates.
3. Expand the foreign-key graph using the SlayQL RBP architecture.
4. Apply BM25/value-grounding hints from synthetic demo values.
5. Assemble a bounded provider-neutral context.
6. Request structured SQL output from the selected model.
7. Parse SQL using `sqlglot` in the source dialect.
8. Verify tables, columns, joins, and statement type.
9. Apply read-only and seeded sensitivity policies.
10. Ask for clarification or one bounded repair when necessary.
11. Execute against the selected connection.
12. Stream result metadata and rows to the user.
13. Persist run metadata, SQL, usage, and audit events without result rows.

The model never receives database credentials and never executes SQL directly.

## 25. SQL execution safety

- Accept only one `SELECT` statement or safe CTE ending in `SELECT`.
- Reject INSERT, UPDATE, DELETE, MERGE, DDL, transactions, extensions, file functions, attached databases, and system schemas.
- Verify every referenced table and column against the discovered catalog.
- Use read-only database users.
- Apply a five-second statement timeout.
- Limit output to 200 rows, adding or enforcing a safe limit where dialect permits.
- Permit cancellation.
- Do not interpolate user values into SQL strings.
- Never authorize SQL using regex alone.
- Never execute provider output that failed parsing or policy checks.

## 26. Demo databases

### SQLite

Package a read-only database with at least six related synthetic tables. Include realistic dates, categories, amounts, primary keys, foreign keys, nullable fields, and one multi-hop join path. Recreate it during image build so every deployment is deterministic.

### PostgreSQL

Create a separate Neon project named `slayql-customer-demo` with synthetic tables such as customers, orders, order_items, products, regions, payments, and support_cases.

Create:

- A migration/seed owner used only during setup.
- A `slayql_demo_reader` user with CONNECT, USAGE, and SELECT only.
- Table and column comments for catalog UX.
- Views and relationships that exercise the SlayQL architecture.

Use a separate Neon project named `slayql-control-demo` for SlayQL application data.

## 27. Control database entities

Implement migrations for:

- `users`
- `organizations`
- `memberships`
- `connections`
- `catalog_assets`
- `catalog_relationships`
- `model_providers`
- `model_registry`
- `user_model_preferences`
- `conversations`
- `messages`
- `agent_runs`
- `agent_steps`
- `query_candidates`
- `query_executions`
- `saved_queries`
- `approvals`
- `usage_events`
- `audit_events`

Store query result metadata only: column names/types, row count, duration, truncation, and status. Do not store result rows.

## 28. Backend API contract

Expose versioned APIs under `/api/v1`:

```text
GET    /session
POST   /auth/demo
POST   /auth/logout
GET    /workspace

GET    /connections
GET    /connections/{id}
POST   /connections/{id}/test
POST   /connections/{id}/sync
GET    /connections/{id}/catalog

GET    /model-providers
GET    /models
POST   /models/{id}/select
POST   /models/compare

POST   /agent-runs
GET    /agent-runs/{id}
GET    /agent-runs/{id}/events
POST   /agent-runs/{id}/clarification
POST   /agent-runs/{id}/cancel
POST   /agent-runs/{id}/execute

GET    /history
GET    /saved-queries
POST   /saved-queries
GET    /approvals
POST   /approvals/{id}/approve
POST   /approvals/{id}/reject

GET    /admin/members
GET    /admin/policies
GET    /admin/audit-events
GET    /admin/usage
GET    /admin/billing-preview
```

Use OpenAPI as the contract source and generate TypeScript client types. Return stable problem responses containing `code`, `title`, `detail`, `request_id`, and optional field errors.

## 29. Required accounts and credentials

| Credential/account | Where obtained | Purpose | Browser exposure |
| --- | --- | --- | --- |
| WorkOS API key | WorkOS dashboard | Authentication backend | Never |
| WorkOS client ID | WorkOS dashboard | AuthKit project identity | Public identifier only where required |
| OpenAI project API key | OpenAI API platform project | OpenAI model calls | Never |
| Anthropic API key | Anthropic Console workspace | Claude model calls | Never |
| DeepSeek API key | DeepSeek API platform | DeepSeek model calls | Never |
| Neon control URL | Neon `slayql-control-demo` | Application persistence | Never |
| Neon customer URL | Neon `slayql-customer-demo` read-only user | Demo query execution | Never |
| Session secret | Generate locally with secure randomness | Cookie/session signing | Never |
| Field encryption key | Generate locally with secure randomness | Sensitive configuration encryption | Never |
| Domain DNS access | Existing registrar | HTTPS and auth callback | Never in app |

Consumer ChatGPT or Claude subscriptions are not API credentials. Use provider API billing/projects.

Provider keys are owned by SlayQL for this demo. Users select an enabled model but do not enter API keys. A future BYOK screen may be shown as a disabled preview only.

## 30. Environment variables

Create committed `.env.example` files without values. Use these names unless an official SDK requires an equivalent:

### Frontend build

```dotenv
VITE_API_BASE_URL=https://demo.slayql.example/api/v1
VITE_APP_ENV=demo
VITE_WORKOS_CLIENT_ID=
```

No provider or database secret may use a `VITE_*` name.

### Backend

```dotenv
APP_ENV=demo
APP_BASE_URL=https://demo.slayql.example
FRONTEND_ORIGIN=https://demo.slayql.example
LOG_LEVEL=INFO

SESSION_SECRET=
FIELD_ENCRYPTION_KEY=
DEMO_ACCESS_CODE=
DEMO_REVIEWER_EMAILS=

WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_REDIRECT_URI=https://demo.slayql.example/auth/callback

CONTROL_DATABASE_URL=postgresql+asyncpg://
DEMO_POSTGRES_URL=postgresql+asyncpg://
SQLITE_DEMO_PATH=/app/data/slayql_demo.sqlite3

OPENAI_API_KEY=
OPENAI_PROJECT_ID=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=

OPENAI_DEMO_BUDGET_USD=20
ANTHROPIC_DEMO_BUDGET_USD=20
DEEPSEEK_DEMO_BUDGET_USD=10
GLOBAL_DAILY_QUERY_LIMIT=100
PER_USER_DAILY_QUERY_LIMIT=25
MAX_ACTIVE_RUNS=5
QUERY_TIMEOUT_SECONDS=5
MAX_RESULT_ROWS=200
```

Store the real VPS environment file outside the repository with permissions limited to the deployment account. Never print it in deployment logs.

## 31. Privacy, logging, and cost controls

- Use synthetic data only.
- Send only the selected schema context, user question, and safe grounding hints to providers.
- Set `store: false` for OpenAI requests where supported.
- Do not opt provider accounts into training/data sharing.
- Do not log provider keys, database URLs, cookies, full result rows, or raw authorization headers.
- Redact SQL literals from general request logs.
- Track provider/model, token usage, latency, status, and estimated cost.
- Set provider-side budget notifications where supported.
- Enforce application-side daily and monthly budgets.
- Disable a provider gracefully after budget exhaustion.
- Keep provider privacy links accessible from the model selector.

OpenAI documents that API data is not used for training unless the organization opts in, while standard abuse-monitoring retention may still apply. Because this demo uses synthetic data, enterprise retention agreements are not required for the demo. Reassess before using customer data.

## 32. Rate limits for the demo

- Maximum five active runs globally.
- Maximum one active run per user.
- Maximum five run creations per minute per user.
- Maximum twenty-five completed runs per user per day.
- Maximum two model-comparison runs per user per day.
- Maximum 10,000 provider input tokens per run.
- Maximum 1,500 provider output tokens per call.
- Maximum one automatic structured-output repair.
- Maximum two provider calls in a normal agent run.

Show an actionable quota message rather than a generic error.

## 33. VPS deployment

Minimum existing VPS recommendation:

- 2 vCPU.
- 4 GB RAM.
- 40 GB SSD.
- Ubuntu 22.04 or 24.04.
- Public IPv4.
- Domain or subdomain pointing to the VPS.

Deployment requirements:

- Docker Engine and Docker Compose.
- Caddy automatic HTTPS.
- Ports 80 and 443 public; SSH restricted by firewall.
- SSH key authentication; disable password login.
- Containers run as non-root users where supported.
- Read-only mount for the SQLite database.
- Restart policy `unless-stopped`.
- Health checks for web and API.
- Bounded JSON log rotation.
- Daily automated database migration check, not an automatic destructive migration.
- Manual deployment rollback to the previous image tag.

The frontend and API should use one domain where practical so cookies, CORS, and authentication callbacks remain simple.

## 34. Empty, loading, and error states

Every screen must explicitly implement:

- First-use empty state.
- Loading skeleton.
- Stale data state.
- Recoverable error with retry.
- Permission denied.
- Session expired.
- Database offline.
- Catalog not synchronized.
- Provider unavailable.
- Provider budget exhausted.
- Rate limited.
- Query invalid.
- Query cancelled.
- Query timed out.
- No rows returned.
- Partial/truncated result.

Errors must preserve the user question and SQL draft wherever safe.

## 35. Automated testing

### Frontend

- Unit tests for forms, selectors, formatters, state transitions, and error mapping.
- Component tests for login, onboarding, query workspace, model selector, results, and administration.
- MSW fixtures for provider and database error states.
- Axe accessibility checks.
- Playwright tests at desktop and mobile viewports.

### Backend

- Unit tests for provider adapters, prompt construction, SQL parsing, policies, cost calculation, and error normalization.
- Integration tests for SQLite and temporary PostgreSQL.
- Migration tests from an empty control database.
- Contract tests for OpenAPI responses and SSE events.
- Provider adapter tests using recorded/sanitized fixtures, never live calls in normal CI.
- Security tests for stacked SQL, DDL/DML, system tables, SQL injection, unauthorized routes, and secret leakage.

### Deployment

- Build both containers.
- Start Docker Compose in a clean environment.
- Run health checks.
- Run one end-to-end query against SQLite.
- Verify the SPA loads after directly navigating to a nested route.
- Verify no secret appears in frontend assets.

## 36. UAT scenarios

The implementing LLM must complete and record these scenarios:

1. Log in using email and enter the demo workspace.
2. Enter using reviewer access.
3. Complete onboarding with SQLite and an OpenAI model.
4. Ask a simple query and receive executable SQL and results.
5. Ask a multi-hop query requiring the SlayQL graph expansion.
6. Trigger and answer a clarification question.
7. Switch from OpenAI to Claude and replay the query.
8. Switch to DeepSeek and compare generated SQL.
9. Use PostgreSQL and browse its real schema.
10. Edit generated SQL and execute it safely.
11. Attempt a write query and verify it is blocked.
12. Cancel an active generation or execution.
13. Trigger provider unavailable and budget-exhausted states.
14. Save, reopen, and replay a query.
15. Approve the seeded sensitive-data example as Owner.
16. Inspect real usage and audit events.
17. Inspect seeded SSO, billing, and security previews with clear demo labels.
18. Repeat the primary flow on a mobile viewport.
19. Refresh during a query and recover the draft/run state.
20. Deploy from a clean VPS checkout using only documented credentials.

## 37. Implementation order

1. Add TypeScript, routing, design tokens, query state, and frontend tests.
2. Add FastAPI, configuration, control database, migrations, and OpenAPI.
3. Implement WorkOS login, reviewer access, sessions, and protected routes.
4. Implement the application shell and real onboarding state.
5. Implement SQLite/PostgreSQL connectors and catalog discovery.
6. Implement provider registry and OpenAI, Anthropic, and DeepSeek adapters.
7. Implement the SlayQL pipeline, SQL parser, read-only policy, SSE, and cancellation.
8. Implement query workspace, results, charts, history, and saved queries.
9. Implement model comparison, usage, audit, approval example, and seeded admin screens.
10. Implement accessibility, responsive states, Docker deployment, documentation, tests, and UAT.

Each step must remove the corresponding mock behavior. Do not leave two competing paths active.

## 38. Explicitly out of scope

- AWS infrastructure.
- GPU or self-hosted inference.
- Kubernetes.
- More than five concurrent runs.
- Customer production data.
- Arbitrary customer database credentials in the public demo.
- Write queries.
- Real SAML, SCIM, billing, or payment processing.
- SOC 2 certification.
- Multi-region disaster recovery.
- Formal uptime SLA.
- Native mobile applications.
- Automatic fallback that sends data to another model provider.

## 39. Definition of done

The demo is complete only when:

- A reviewer can open the public URL and log in without developer help.
- The complete authenticated application has no `under construction` pages.
- SQLite and PostgreSQL are both genuinely queried.
- OpenAI, Anthropic, and DeepSeek can each be selected and called when their keys are configured.
- Model/provider failures produce polished recovery UX.
- Generated SQL is parsed and restricted to safe read-only execution.
- SlayQL operational evidence is shown without exposing hidden chain-of-thought.
- History, usage, model choice, costs, and audit events persist.
- Enterprise preview screens are cohesive and clearly marked when seeded.
- Desktop, tablet, mobile, keyboard, and accessibility tests pass.
- Automated frontend, backend, security, and end-to-end tests pass.
- The VPS deployment is reproducible from documentation.
- No provider key, database password, session secret, or customer result row appears in the browser bundle or logs.

## 40. Current reference documentation

- OpenAI models: https://developers.openai.com/api/docs/models
- OpenAI data controls: https://developers.openai.com/api/docs/guides/your-data
- Anthropic API documentation: https://platform.claude.com/docs
- DeepSeek models and pricing: https://api-docs.deepseek.com/quick_start/pricing
- WorkOS AuthKit: https://workos.com/docs/authkit
- WorkOS pricing: https://workos.com/pricing
- Neon pricing: https://neon.com/pricing

Provider model IDs, capabilities, pricing, and retention terms can change. The implementation must treat the backend model registry and provider health checks as authoritative rather than hardcoding those details in frontend components.
