# Handoff: SlayQL trust-layer work

Updated 27 September 2026. Read this first. Then read [`REPORT_NARRATIVE.md`](REPORT_NARRATIVE.md) for the measured results and the storyline, and [`PROJECT_DIRECTION.md`](PROJECT_DIRECTION.md) for the business case.

## 1. Project in one paragraph

SlayQL is a Monash FYP (GitHub org `MDS06-Monash-2026`, repo `slayql-UI`): a React/Vite + FastAPI text-to-SQL app. It is positioned as **"the AI analyst that knows when it's wrong"**. The schema-linking engine is researched in the separate `C-CaSE` repo (251/547 on Spider 2.0-Lite).

Every answer in this app passes through a trust layer: deterministic checks, comparison of candidate queries, and a calibrated confidence. The result is one of four outcomes: confident, caveat, clarify or hand-off. Around the trust layer are:

- an analyst **review queue**, whose decisions recalibrate confidence for each data source;
- a **definitions library**;
- **Report Studio**, where every KPI and chart is a checked query;
- **Trust or Bust**, a live audience game that doubles as a small user study.

## 2. Safety rules: must follow

1. **`.env` points at production.** `DATABASE_URL` is the production Supabase control database, and `VITE_API_BASE_URL` points the dev frontend at the live site.
   - Run the backend with `DATABASE_URL=` and a temporary `CONTROL_DB_PATH`.
   - Run the frontend with `VITE_API_BASE_URL=http://localhost:<port>/api/v1`.
   - Browser automation must block every non-localhost request (the guard is in `.pytest_tmp/ui/*.py`).
   - Tests (`backend/tests/conftest.py`) and the evaluation harness (`backend/eval/__init__.py`) isolate themselves.
2. **Pushing `main` deploys to the VPS** (`.github/workflows/deploy-vps.yml`). Work on `feature/trust-layer`.
3. **Windows:** stopping a shell does not stop its Python child. Find a server by its port (`netstat -ano | grep :8765`), check its command line, then `taskkill //PID <pid> //F`. Never kill every Python process: long evaluation runs may be going.
4. **Every published number must come from `backend/eval/results/`** (or the `C-CaSE` run folders, for the engine). The archived docs contain fabricated figures: never quote them.
5. **AI spending so far is about USD 2 of the USD 20 cap.** Main items: BIRD generated twice (USD 0.70 and 0.68), the evidence run (USD 0.50), earlier work (about USD 0.20), and trap-set and report tests at a few cents.

## 2a. AI provider (29 September 2026)

- `backend/app/providers/llm_client.py` talks to any OpenAI-compatible chat API. `LLM_PROVIDER` chooses the provider and model pair:
  - **`opentk`** (the development default): `OPENTK_KEY`, `https://opentk.ai/v1`, models `deepseek-v4.1-flash` (default) and `glm-5.3`.
  - **`together`**: `TOGETHER_API_KEY` (or `TOGETHER_AI_KEY`), models `deepseek-ai/DeepSeek-V4-Flash-0731` and `moonshotai/Kimi-K3`.
- The user's model choice runs; any other model ID falls back to the provider's default.
- **Cost:** Together is costed from its published prices in `PROVIDERS`. OpenTK publishes none, so its cost shows 0, only tokens are tracked, and the eval `--budget` cap cannot stop a run (use `--limit`).
- Reasoning arrives in `reasoning_content` (or inline `<think>` tags) and is kept out of answers.
- Verified live on 29 September:
  - OpenTK: both models, the full Report Studio path (model plan, 9 checked figures, grounded summary), and the eval harness.
  - Together: both models, after credit was added.
- **Before deploying**, set `LLM_PROVIDER` and the matching key in the VPS environment. The live site's environment still has only the old OpenRouter key, so deploying without this would switch AI off in production.
- Every result in `backend/eval/results/` was generated through OpenRouter (`deepseek/deepseek-v4-flash`) before the switch.

## 3. Branch state

`feature/trust-layer`, not pushed, 17 commits ahead of `main`. New since the last handoff:

| Commit | What |
| --- | --- |
| `13cb5de` | Coverage check (relabelled data the database does not have); Spider figure 251/547; stale mock benchmark data removed |
| `7455b00` | Validator fix (CTEs and capitalised tables were rejected); column validation; review-queue learning; 12 Bahasa Malaysia items; consensus ignores extra columns; `/demo` race fix |
| `ef0dd8e` | Report Studio rebuilt as trusted reports; filter-value check |
| `b131a73` | SQL Server connector; flag columns (`Cancelled = 'T'`); AutoCount-style sample database |
| `d8f6e5a` | BIRD regenerated and re-scored (harness v2); approved definitions raise confidence; arena load test |
| `f1681d5` | Learning curve on the landing page; fair benchmark settings on the big screen |

Tests: `python -m pytest -q` passes 87. `npm run build` passes.

## 4. File map (new or changed)

**Backend**
- `backend/app/verification/checks.py`: grain, definition (status and flag columns), period, `check_filter_values`, `check_grounding` (coverage), sanity.
- `backend/app/verification/learning.py`: per-data-source confidence refitted from review decisions, MAP-regularised towards the default prior. It needs 20 labels with at least 5 right and 5 wrong. Stored in the `workspace_calibrations` table.
- `backend/app/verification/confidence.py`: new feature `approved_definition` (prior weight 1.2).
- `backend/app/queries/validator.py`: CTE-aware, case-insensitive table lookup, column checks, T-SQL.
- `backend/app/workbench/trusted_report.py` and `insights.py`: plan → checked execution → computed findings → grounded narrative. `refresh` re-runs with no AI calls. The old `report_agent.py` and `report_pipeline.py` are deleted.
- `backend/app/connections/runtime.py`: `sqlglot_dialect()`, SQL Server URL and fast catalog (`build_sqlserver_catalog`).
- `backend/data/seed_autocount_sample.py` writes `public/autocount-sample.db`.
- Endpoints:
  - `POST /connections/{id}/reports` (NDJSON stream), `/reports/refresh`, `/reports/revise`;
  - `GET /connections/{id}/calibration`;
  - `/arena/eval-summary` now includes `learning`.

**Frontend**
- `src/components/report/`: `ReportStudio`, `ReportCanvas`, `ReportChart`, `chartTheme` (validated palette).
- `src/components/trust/LearningPanel.jsx` on `/review`.
- `ArenaScreenView`: the results and A/B rounds quote the trap set, and BIRD at c = 1.

**Evaluation**
- `backend/eval/harness.py`: `PROMPT_VERSION = "v2"`. Old v1 caches remain in `cache/` but are unused.
- `backend/eval/learning_curve.py` → `results/learning-bird.json`.
- `backend/eval/arena_load_test.py`.
- External held-out items: `datasets/external_items.jsonl` (see `docs/HELD_OUT_QUESTIONS.md`), reported by author.

**Docs:** `REPORT_NARRATIVE.md`, `DEMO_DAY_RUNBOOK.md`, `INTERVIEW_GUIDE.md`, `HELD_OUT_QUESTIONS.md`; updated `PROJECT_DIRECTION.md` and the README.

## 5. Results (all measured; details and caveats in REPORT_NARRATIVE.md)

- **Trap set (52 items), B3 against B0:** wrong answers stated as fact 26.9% → 0%, 73.1% answered, no false alarms; all 5 unanswerable questions handed off (English and Bahasa Malaysia).
- **BIRD test (233), c = 1:** 59.7% → 15.9%, 42.1% answered, 7.6% false alarms (checks alone: 0% false alarms). At c = 4, 0% answered. With evidence hints: accuracy 49.0%; at c = 1, 48.1% → 27.9% with 67.4% answered.
- **Learning:** 33.9% → 1.6% after 40 random reviews and 0% after 80 (10.3% after 40 when learning from hand-offs only).
- **Distributor set (22 AutoCount-style questions, OpenTK):** wrong answers stated as fact 45.5% → 0%; 40.9% answered at c = 4 (25% false alarms), 77.3% at c = 1 (8.3% false alarms). All infeasible questions handed off.
- **Validator bug:** 126 of 443 BIRD queries were wrongly rejected before the fix; 11 after, all real errors.
- **Arena load test:** 50 phones, 11 rounds, 0 errors; state reached every phone within 24 ms (p95); votes took 0.5 s (p50) and 0.9 s (p95) on local SQLite.

## 6. Remaining work

1. **BIRD with evidence hints: done.** `results/bird-evidence.json`: accuracy 49.0%; at c = 1, 48.1% → 27.9% of test questions stated wrongly as fact. Generation cost USD 0.50.
2. **Production cleanup** (`deploy/cleanup_test_data_2026-09-24.sql`): not run. The agent's attempt was blocked by the permission system because it touches the production database. Run it in the Supabase SQL editor (step 1 previews, step 2 deletes in a transaction), or use `.pytest_tmp/prod_cleanup.py preview` then `delete` (it commits only if the deleted counts match the preview).
3. **Merge to `main` and deploy.** The deploy adds the `pymssql` requirement and the `workspace_calibrations` table (created automatically). Check `/api/v1/health` afterwards, then run the load test against the live site the evening before demo day.
4. **Human tasks:** interviews (`INTERVIEW_GUIDE.md`); external held-out questions (`HELD_OUT_QUESTIONS.md`); team review of the trap set; a rehearsal with real phones (`DEMO_DAY_RUNBOOK.md`); moving `VITE_API_BASE_URL` out of `.env`.
5. **Known gaps:**
   - a question whose SQL silently drops the asked-for concept (`ms-15`);
   - counting rows instead of distinct entities (the arena's deliberate verifier-miss card);
   - SQL Server untested against a live server;
   - no Firebird connector.

## 7. Useful commands

```bash
python -m pytest -q
npm run build
# local API and frontend (never production)
DATABASE_URL= CONTROL_DB_PATH="$(pwd -W)/.pytest_tmp/ui/control.sqlite3" python -m uvicorn backend.app.main:app --port 8765
VITE_API_BASE_URL=http://localhost:3100/api/v1 SLAYQL_API_PROXY_TARGET=http://127.0.0.1:8765 npx vite --port 3100 --strictPort
# screenshots, localhost only
python .pytest_tmp/ui/report.py "<question>" <name> [dark]
python .pytest_tmp/ui/arena_rounds.py
# evaluation (generation is paid and cached; evaluation is free)
python -m backend.eval.generate --dataset trap
python -m backend.eval.evaluate --dataset trap
python -m backend.eval.evaluate --dataset bird --fit
python -m backend.eval.learning_curve --dataset bird
python -m backend.eval.arena_load_test --base http://127.0.0.1:8765 --players 50
```
