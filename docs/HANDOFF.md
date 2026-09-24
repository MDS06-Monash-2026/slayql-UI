# Handoff: SlayQL trust-layer work (for the next agent)

Written 24 September 2026 at the end of a long session. Read this first, then `docs/PROJECT_DIRECTION.md`, which is the source of truth for what the project is and why.

## 1. Project in one paragraph

SlayQL is a Monash FYP (GitHub org `MDS06-Monash-2026`, repo `slayql-UI`): a React/Vite + FastAPI text-to-SQL app. The new direction repositions it as **"the AI analyst that knows when it's wrong"**. Every answer passes through a **trust layer**: deterministic checks, comparison of several independently written queries, and a calibrated confidence score. The layer returns one of four outcomes: `confident`, `caveat`, `clarify` or `handoff`. Uncertain answers go to an analyst **review queue**. Approved **business definitions** and **verified queries** make answers consistent. **Trust or Bust** is a live audience game for demo day, which doubles as a user study. The business case, Malaysian market context, CTO pitch and page map are all in `docs/PROJECT_DIRECTION.md` (sections 6 and 7.4).

Tagline: "SlayQL answers questions from your company's data, and tells you when not to trust the answer."

## 2. Safety rules: must follow

1. **`.env` points at production.** `DATABASE_URL` is the production Supabase control database, and `VITE_API_BASE_URL=https://fyp.kianlok.top/...` makes the dev frontend call the **live site**. Two incidents already happened this session (section 7).
   - Backend: always run with `DATABASE_URL=` (blank) and a temp `CONTROL_DB_PATH`. Tests do this automatically through `backend/tests/conftest.py`, and the eval harness through `backend/eval/__init__.py`.
   - Frontend dev server: run with `VITE_API_BASE_URL=http://localhost:<port>/api/v1`. In Git Bash use a full `http://` URL, because a bare `/api/v1` gets rewritten into a Windows path. Any browser automation must block every non-localhost request (see `.pytest_tmp/ui/drive.py` for the guard).
   - Verify with `GET /api/v1/health`, which must report `"backend_database": "sqlite"`.
2. **Never push or merge to `main`.** Pushing `main` auto-deploys to the VPS through `.github/workflows/deploy-vps.yml`. Work on `feature/trust-layer`, and push only if the user asks.
3. **Don't touch production or the VPS, and don't run `deploy/cleanup_test_data_2026-09-24.sql`.** The user runs that cleanup themselves.
4. **AI spending cap: USD 20 in total.** Roughly USD 0.2 has been spent so far. Datasets: **BIRD Mini-Dev only** plus the team's trap set. The user explicitly did not approve other datasets.
5. The user approved: committing on the branch, deleting and archiving files, installing named packages, and downloading BIRD Mini-Dev.
6. It's an assessed FYP. The user was advised to check their unit's rules on disclosing AI assistance. Every published number must come from `backend/eval/results/`, and you must never invent figures. The archived docs contain fabricated figures: never quote them.

## 3. Branch state

Branch `feature/trust-layer`, created from `main` @ `01e893a`. It has not been pushed.

| Commit | What |
|---|---|
| `ee4ef2f` | Test isolation (`conftest.py`, `pytest.ini`); ten-chart report minimum removed |
| `178016f` | Mock `/dashboard` and `/onboarding` removed; "Power BI" renamed; README privacy fix; docs archived; production cleanup SQL |
| `f170cd9` | Trust layer (`backend/app/verification/`), knowledge store, pipeline integration |
| `3780ae1` | Review-queue, definitions and clarify APIs; privacy mode |
| `aa2b280` | Trust UI in the live demo; consensus fix; Malay retrieval; SQLite foreign-key catalog bug fix |
| `09f57f3` | Trust or Bust backend (`backend/app/arena/`); Malay intent detection |
| `96e1acf` | Game, review queue and definitions pages; `qrcode` dependency |
| `96e4546` | Evaluation harness, trap set, trap results |

Untracked: `dashboard_examples/` (the team's reference PNGs, left untracked on purpose). Tests: `python -m pytest -q` gives **69 passed**. Frontend: `npm run build` passes.

## 4. What exists now (file map)

**Backend**
- `backend/app/verification/`
  - `checks.py`: grain (fan-out probe `COUNT(*)` vs `COUNT(DISTINCT pk)`), definition/status ambiguity, period (relative "now", date-only upper bounds), sanity.
  - `consensus.py`: result signatures and clusters.
  - `confidence.py`: logistic P(correct), with threshold `c/(1+c)` and default prior weights; `calibration.json` overrides them once fitted.
  - `engine.py`: `run_checks()` and `verify()`. Every candidate is checked; candidates with blocking findings don't vote.
- `backend/app/agent/pipeline.py`:
  - checks run in the repair loop;
  - `_verify_answer()` generates extra candidates (`agent/candidates.py`) and verifies them;
  - the `verification` and `data_sent` payload fields;
  - clarify/handoff answers use deterministic text;
  - dead ends become hand-offs;
  - `ephemeral` runs;
  - verified-query shortcut.
- `backend/app/agent/effort.py`: `candidate_count` per level is 1/2/3/3/5.
- `backend/app/knowledge/`: `store.py` holds the definitions, verified queries and review items (tables in `control_database.py`); `routes.py` holds the APIs.
- `backend/app/privacy.py`: `PRIVACY_MODE` masking and disclosure.
- `backend/app/arena/`:
  - `deck.py`: 8 cards (4 right, 4 wrong, one a genuine verifier miss), with evidence from real checks.
  - `service.py`: sessions, balanced conditions, votes, scoring, CSV of consenting players only.
  - `routes.py`: `/api/v1/arena/*`, including `eval-summary`.
- Config (`config.py`): `VERIFY_DEFAULT_PENALTY=4`, `PRIVACY_MODE=False`, `ARENA_MAX_STUMP_PER_PARTICIPANT=3`.

**Frontend**
- `src/components/trust/`: TrustBadge, EvidencePanel, ClarifyOptions, TrustPanel, AnalystNav.
- Views: `ArenaPlayerView` (`/play`), `ArenaScreenView` (`/arena/screen`), `ArenaHostView` (`/arena/host`), `ReviewQueueView` (`/review`), `DefinitionsView` (`/definitions`); routes are in `App.jsx`.
- `src/services/arena.js` and `src/utils/trustMath.js`.

**Evaluation** (`backend/eval/`)
- `generate.py` is the paid phase; results are cached in `cache/` (git-ignored).
- `evaluate.py` is free and re-runnable. It covers configurations B0–B3, uses `--fit` for calibration, and writes `results/<dataset>.json`.
- `metrics.py`.
- `datasets/build_trap_set.py` builds `trap_set.jsonl` (40 items, **draft pending team review**).
- BIRD Mini-Dev is at `backend/eval/data/minidev/MINIDEV/` (git-ignored, 1.4 GB).
- Scoring: BIRD uses strict set comparison; the trap set uses a lenient rule that allows extra columns.

## 5. Results so far (measured)

Trap set, all 40 items, model `deepseek/deepseek-v4-flash`, uncalibrated default prior:

| Config | Coverage | Silent error rate | EX on answerable | RS (c=4) | False alarm |
|---|---|---|---|---|---|
| B0 (current app) | 95% | 22.5% | 93.5% | −0.15 | — |
| B3 (full trust layer) | 77.5% | 2.5% | 96.8% | +0.85 | 0% |

Consensus alone (B2) caught almost nothing: candidates share the same business assumptions, and the deterministic checks do the work. The remaining B3 wrong answer is `infeasible-03`, "which salesperson closed the most deals?". It's a known blind spot: nothing checks whether the data can answer the question at all. Report it as a limitation.

Live examples on the demo database:
- "What is our total revenue?" gives **clarify**, with options 3,241,298.23 (all) and 2,938,582.20 (excluding cancelled and refunded).
- Once the "completed only" definition is approved, the same question gives **confident** at 2,159,970.05. So does "Berapa jumlah jualan kita?", which also answers in Malay.
- Cost is about USD 0.0003–0.0014 per question.

## 6. Remaining tasks, in priority order

1. **Finish BIRD.** 297 of 500 are cached. Resume with `python -u -m backend.eval.generate --dataset bird --concurrency 12 --budget 15`, which takes about an hour; the cache makes it resumable. Then run `python -m backend.eval.evaluate --dataset bird --fit`, which fits `backend/app/verification/calibration.json` on the fit half and reports on the test half. Re-run `evaluate --dataset trap` afterwards, because calibration changes B3. Commit `results/*.json` and `calibration.json`.
2. **Landing page** (`src/views/LandingView.jsx`, `src/components/Hero.jsx`):
   - New hero: the tagline, and CTAs "Try Live Demo" and "Play Trust or Bust".
   - Replace `BenchmarkSection`/`AblationSection` (mock data in `src/mock/mockData.js`) with a results section fed by `GET /api/v1/arena/eval-summary`, with a risk–coverage chart using recharts.
   - State the old Spider 2.0-Lite result honestly: 72/178 vs 71/178, 16 improved and 15 degraded, no meaningful difference, which motivated the verification work.
3. **Report Studio** (`AIDashboardBuilder.jsx`, `report_agent.py`): outcome badges on KPI cards, and KPIs from a server-side aggregate instead of the 200-row preview (line ~124).
4. **Docs:** update the README (new pages, trust layer, evaluation commands, the safety note about `.env`) and add a status section to `PROJECT_DIRECTION.md`.
5. **Game polish (optional):** browser-test the penalty, stump, definition, results and exit-poll rounds; only the lobby and card rounds were screenshot-tested. Run a load test with about 50 phones. Consider hiding the arena from production navigation.
6. **Nice-to-have fixes:**
   - Opening `/demo` directly without a stored session shows "No data sources". This is a pre-existing race between the connections fetch and the reviewer auto-login.
   - The validator doesn't reject every unknown column; execution catches them.
   - Infeasible-question detection (the known blind spot).
7. **Human tasks, not for an agent:** team review of the trap set, the MUHREC ethics question, 8–12 interviews, a rehearsal with real phones, reviewing and running the production cleanup SQL, and moving `VITE_API_BASE_URL` out of `.env`.

## 7. Incidents this session (already reported to the user)

1. The first `pytest` run, before `conftest.py` existed, used the production `DATABASE_URL`. It created test accounts (`alex.chen@stripe.com`, `owner@example.com`, `other@example.com`, `connection-update-*@example.com`) and acted as `reviewer@slayql.demo`, including chat reports, admin updates and possibly credits. It also made paid OpenRouter calls. The cleanup SQL for the user is `deploy/cleanup_test_data_2026-09-24.sql`.
2. A browser test hit production because of `VITE_API_BASE_URL`. It made four reviewer sign-ins and ran "What is our total revenue?" twice in the reviewer account (about 2 credits). The user can delete those chats.

## 8. Useful commands

```bash
python -m pytest -q                                   # isolated tests (69 pass)
npm run build
# local API (never production):
DATABASE_URL= CONTROL_DB_PATH="$(pwd -W)/.pytest_tmp/ui/control.sqlite3" python -m uvicorn backend.app.main:app --port 8765
# local frontend pointed at it:
VITE_API_BASE_URL=http://localhost:3100/api/v1 SLAYQL_API_PROXY_TARGET=http://127.0.0.1:8765 npx vite --port 3100 --strictPort
# live single-question check (real model, local control DB): .pytest_tmp/live_smoke.py "question"
# browser screenshots with the localhost-only guard: python .pytest_tmp/ui/drive.py demo|arena
```

`.pytest_tmp/` is git-ignored scratch space and contains these helper scripts. Recreate them if they're missing.

## 9. Documents to read

- `docs/PROJECT_DIRECTION.md`: the direction, evaluation design (sections 5.6–5.7), business case and Malaysian context (section 6), CTO pitch (6.11), integration plan and page map (section 7), plan and risks. Its section 11 lists open decisions.
- `docs/MALAYSIA_MARKET_RESEARCH_AND_PITCH.md` and `docs/MALAYSIAN_MARKET_PITCH_STRATEGY_REVIEW.md`: sourced market evidence and the critique of unsupported claims.
- `docs/REPORTING_PLATFORM_IMPLEMENTATION_PLAN.md`: Report Studio and Power BI context (Power BI is frozen).
- `docs/REPORT_SKILLS.md`: fed to the report AI; the ten-chart rule has been removed.
- `docs/archive/`: superseded docs with fabricated numbers. **Don't quote them.**
