"""Offline evaluation harness.

Importing this package first forces a local, temporary control database, so
evaluation runs can never write to a DATABASE_URL configured in .env.
Provider keys from .env are kept: generation uses the same model as the demo.
"""
import os
import tempfile

os.environ["DATABASE_URL"] = ""
# Results must come from the model under test: retry it, never fall back to another model.
os.environ["LLM_STRICT_MODEL"] = "1"
os.environ["DEMO_POSTGRES_URL"] = ""
os.environ["CONTROL_DB_PATH"] = os.path.join(tempfile.mkdtemp(prefix="slayql-eval-"), "control.sqlite3")
