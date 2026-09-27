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
5. **AI spending so far is about USD 2 of the USD 20 cap.** Main items: BIRD generated twice (USD 0.70 and 0.68), the evidence run (about USD 0.40), earlier work (about USD 0.20), and trap-set and report tests at a few cents.

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

- **Trap set (52 items), B3 against B0:** wrong answers stated as fact 26.9% → 1.9%, 75% answered, no false alarms. English 27.8% → 0%; Bahasa Malaysia 26.7% → 6.7%.
- **BIRD test (233), c = 1:** 59.7% → 15.0%, 40.3% answered, 10.6% false alarms. At c = 4, 0% answered.
- **Learning:** 34.3% → 0.8% after 40 random reviews (3.0% when learning from hand-offs only).
- **Validator bug:** 126 of 443 BIRD queries were wrongly rejected before the fix; 11 after, all real errors.
- **Arena load test:** 50 phones, 11 rounds, 0 errors; state reached every phone within 24 ms (p95); votes took 0.5 s (p50) and 0.9 s (p95) on local SQLite.

## 6. Remaining work

1. **BIRD with evidence hints:** generation was running at handoff (`.pytest_tmp/bird_evidence.log`). When it finishes, run `python -m backend.eval.evaluate --dataset bird --with-evidence --fit`. It writes `results/bird-evidence.json` and `calibration-bird-evidence.json`. Add the result to REPORT_NARRATIVE section 5.2 for comparison with published BIRD numbers.
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
