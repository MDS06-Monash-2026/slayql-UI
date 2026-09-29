"""Isolate the test suite from the developer's .env.

Settings read .env, which can point DATABASE_URL at the production control
database and hold real provider keys. Environment variables take precedence
over .env, so they are set here before any backend module is imported.
"""

import os
import shutil
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet

_REPO_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="slayql-tests-"))

# The demo tests re-seed this file, so work on a copy instead of the committed one.
_TEST_DEMO_PATH = _TEST_DATA_DIR / "slayql_demo.sqlite3"
shutil.copyfile(_REPO_DATA_DIR / "slayql_demo.sqlite3", _TEST_DEMO_PATH)

_ISOLATED_ENV = {
    # An empty DATABASE_URL makes the control store fall back to local SQLite.
    "DATABASE_URL": "",
    "DEMO_POSTGRES_URL": "",
    "CONTROL_DB_PATH": str(_TEST_DATA_DIR / "slayql_control.sqlite3"),
    "CONNECTION_DATA_DIR": str(_TEST_DATA_DIR / "connections"),
    "SQLITE_DEMO_PATH": str(_TEST_DEMO_PATH),
    "FIELD_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    # No paid provider calls from tests. A "mock_" key makes the LLM
    # client return its fallback SQL offline; other providers use local fallbacks.
    "TOGETHER_API_KEY": "mock_tests",
    "TOGETHER_AI_KEY": "",
    "OPENAI_API_KEY": "",
    "ANTHROPIC_API_KEY": "",
    "DEEPSEEK_API_KEY": "",
    "GEMINI_API_KEY": "",
}

os.environ.update(_ISOLATED_ENV)

import pytest
from backend.app.verification import confidence

@pytest.fixture(autouse=True)
def _isolate_confidence_calibration(monkeypatch):
    monkeypatch.setattr(confidence, "CALIBRATION_PATH", _TEST_DATA_DIR / "nonexistent_calibration.json")
