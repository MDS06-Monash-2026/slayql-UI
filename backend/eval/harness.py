"""Shared pieces of the evaluation: datasets, per-database context and execution."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import backend.eval  # noqa: F401  (forces the local control database)
from backend.app.agent.pipeline import SlayQLPipeline
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.catalog.discovery import CatalogService, CatalogSchema
from backend.app.queries.executor import ExecutionResult, QueryExecutor
from backend.app.queries.validator import SqlValidator

EVAL_DIR = Path(__file__).resolve().parent
REPO = EVAL_DIR.parents[1]
CACHE_DIR = EVAL_DIR / "cache"
RESULTS_DIR = EVAL_DIR / "results"
TRAP_SET = EVAL_DIR / "datasets" / "trap_set.jsonl"
DEMO_DB = REPO / "backend" / "data" / "slayql_demo.sqlite3"
# AutoCount-style Malaysian distributor (backend/data/seed_autocount_sample.py).
DISTRIBUTOR_SET = EVAL_DIR / "datasets" / "distributor_set.jsonl"
DISTRIBUTOR_DB = REPO / "public" / "autocount-sample.db"
BIRD_DIR = EVAL_DIR / "data" / "minidev" / "MINIDEV"
BIRD_JSON = BIRD_DIR / "mini_dev_sqlite.json"

# Bump when prompts or generation settings change: cached generations then miss.
# v2: the validator no longer rejects CTEs and capitalised table names, and
# checks columns, so repair attempts respond to real errors only.
PROMPT_VERSION = "v2"
MAX_ROWS = 1000  # generous, so scoring compares complete results
TIMEOUT_SECONDS = 10.0


@dataclass
class Item:
    dataset: str
    id: str
    question: str
    db_path: Path
    expected: str  # answer | clarify | handoff
    gold_sql: str
    trap: str = "none"
    language: str = "en"
    difficulty: str = ""
    evidence: str = ""
    alternatives: List[str] = field(default_factory=list)
    author: str = "team"  # "team", or who wrote an externally authored held-out item
    accept: List[str] = field(default_factory=list)  # other SQL whose result is also a correct answer
    defined_gold: str = ""  # the one right answer once the starter-pack definitions are approved


def load_items(dataset: str, limit: Optional[int] = None) -> List[Item]:
    items: List[Item] = []
    if dataset in ("trap", "distributor"):
        source, db_path = (TRAP_SET, DEMO_DB) if dataset == "trap" else (DISTRIBUTOR_SET, DISTRIBUTOR_DB)
        if dataset == "distributor" and not DISTRIBUTOR_DB.exists():
            raise SystemExit("Run python -m backend.data.seed_autocount_sample first.")
        for line in source.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            items.append(Item(
                dataset=dataset, id=row["id"], question=row["question"], db_path=db_path,
                expected=row["expected"], gold_sql=row["gold_sql"], trap=row["trap"],
                language=row["language"], alternatives=row.get("alternatives", []),
                author=row.get("author", "team"), accept=row.get("accept", []),
                defined_gold=row.get("defined_gold", ""),
            ))
    elif dataset == "bird":
        if not BIRD_JSON.exists():
            raise SystemExit(f"BIRD Mini-Dev not found at {BIRD_JSON}. Download minidev.zip into backend/eval/data first.")
        for row in json.loads(BIRD_JSON.read_text(encoding="utf-8")):
            db_id = row["db_id"]
            items.append(Item(
                dataset="bird", id=str(row.get("question_id", len(items))), question=row["question"],
                db_path=BIRD_DIR / "dev_databases" / db_id / f"{db_id}.sqlite",
                expected="answer", gold_sql=row["SQL"], difficulty=row.get("difficulty", ""),
                evidence=row.get("evidence", "") or "",
            ))
    else:
        raise SystemExit(f"Unknown dataset {dataset}")
    return items[:limit] if limit else items


def split_of(item: Item) -> str:
    """Stable 50/50 split: 'fit' items calibrate the confidence model, 'test' items are reported."""
    digest = hashlib.sha1(f"{item.dataset}:{item.id}".encode()).digest()
    return "fit" if digest[0] % 2 == 0 else "test"


@lru_cache(maxsize=32)
def catalog_for(db_path: str) -> CatalogSchema:
    return CatalogService.get_sqlite_catalog(db_path)


def context_for(item: Item, catalog: CatalogSchema, with_evidence: bool) -> Dict[str, Any]:
    """Build the same generation context the live pipeline builds."""
    question = item.question
    if with_evidence and item.evidence:
        question = f"{question}\nHint: {item.evidence}"
    matches = RBPGraphEngine(catalog).match_schema_entities(question)
    return {
        "question": question,
        "tables": matches["expanded_chain"],
        "schema_context": SlayQLPipeline._schema_context(catalog, matches["expanded_chain"]),
        "retrieval_context": SlayQLPipeline._retrieval_context(matches),
        "grounding_hints": json.dumps(matches["grounded_values"], ensure_ascii=True, default=str),
    }


def make_runner(db_path: Path, catalog: CatalogSchema):
    """Validated read-only execution against one SQLite database."""
    async def run(sql: str) -> ExecutionResult:
        validation = SqlValidator.validate_and_sanitize(sql=sql, dialect="sqlite", catalog=catalog, max_rows=MAX_ROWS)
        if not validation.is_valid:
            return ExecutionResult(columns=[], column_types=[], rows=[], row_count=0, execution_time_ms=0,
                                   error=validation.error_message or "invalid SQL")
        return await QueryExecutor.execute_sqlite(str(db_path), validation.sanitized_sql, TIMEOUT_SECONDS, MAX_ROWS)
    return run


async def run_readings(item: Item) -> List[ExecutionResult]:
    """Every result that counts as right: the gold answer and accepted equivalents, or, for a
    question with several meanings, each valid reading (used to credit a stated assumption)."""
    sqls = [item.gold_sql] + (item.accept if item.expected == "answer" else item.alternatives)
    results = []
    for sql in sqls:
        if sql:
            result = await QueryExecutor.execute_sqlite(str(item.db_path), sql, TIMEOUT_SECONDS, 100000)
            if not result.error:
                results.append(result)
    return results


async def run_gold(item: Item) -> Optional[ExecutionResult]:
    """Gold SQL runs unvalidated (it may use features the validator restricts) but read-only."""
    if not item.gold_sql:
        return None
    return await QueryExecutor.execute_sqlite(str(item.db_path), item.gold_sql, TIMEOUT_SECONDS, 100000)


def cache_path(item: Item, model: str, k: int, with_evidence: bool, definitions: str = "") -> Path:
    key = f"{item.dataset}|{item.id}|{model}|{PROMPT_VERSION}|k{k}|ev{int(with_evidence)}"
    if definitions:
        key += f"|defs:{definitions}"
    digest = hashlib.sha1(key.encode()).hexdigest()[:20]
    return CACHE_DIR / item.dataset / f"{item.id}-{digest}.json"


async def pack_definitions(db_path: Path) -> List[Dict[str, Any]]:
    """The starter pack's recommended definitions for a database, shaped as approved definitions."""
    from backend.app.knowledge.suggestions import suggest_definitions

    catalog = catalog_for(str(db_path))
    suggestions = await suggest_definitions(catalog, make_runner(db_path, catalog))
    definitions = []
    for suggestion in suggestions:
        chosen = dict(suggestion["options"][suggestion["recommended"]]["definition"])
        chosen.update(id=f"pack_{chosen['term']}", status="approved", table=chosen["table_name"], column=chosen["column_name"])
        definitions.append(chosen)
    return definitions


def with_definitions(items: List[Item]) -> List[Item]:
    """Once meanings are approved, an ambiguous question has one right answer."""
    from dataclasses import replace

    return [replace(item, expected="answer", gold_sql=item.defined_gold, alternatives=[]) if item.defined_gold else item
            for item in items]
