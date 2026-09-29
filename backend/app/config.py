from pathlib import Path
from typing import List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    APP_NAME: str = "SlayQL API"
    APP_ENV: str = "demo"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    
    # Base URLs and CORS
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "*"
    ]
    
    # AI provider: Together AI (OpenAI-compatible). TOGETHER_AI_KEY is accepted
    # as an alias for TOGETHER_API_KEY.
    TOGETHER_API_KEY: Optional[str] = None
    TOGETHER_AI_KEY: Optional[str] = None
    LLM_BASE_URL: str = "https://api.together.xyz/v1"
    # Default model; users may pick any model in providers/llm_client.CURATED_MODELS.
    EXECUTION_MODEL: str = "deepseek-ai/DeepSeek-V4-Flash-0731"
    DEFAULT_MODEL: str = "deepseek-ai/DeepSeek-V4-Flash-0731"
    
    # Direct Provider Keys (fallback or direct use)
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    
    # Database Settings
    SQLITE_DEMO_PATH: str = str(DATA_DIR / "slayql_demo.sqlite3")
    CONTROL_DB_PATH: str = str(DATA_DIR / "slayql_control.sqlite3")
    CONNECTION_DATA_DIR: str = str(DATA_DIR / "connections")
    FIELD_ENCRYPTION_KEY: Optional[str] = None
    # Backend-only persistence. This URL is never registered as a query source.
    DATABASE_URL: Optional[str] = None
    BACKEND_DATABASE_SCHEMA: str = "slayql"
    # Optional legacy query demo. User-added sources are stored separately.
    DEMO_POSTGRES_URL: Optional[str] = None
    
    # Execution & Safety Limits
    MAX_ACTIVE_RUNS: int = 5
    QUERY_TIMEOUT_SECONDS: float = 10.0
    MAX_RESULT_ROWS: int = 200
    # Trust layer: a wrong answer costs this many times a correct one is worth;
    # answers are given only when P(correct) > c / (1 + c).
    VERIFY_DEFAULT_PENALTY: float = 4.0
    # Mask personal-data columns before values or rows are sent to AI providers.
    PRIVACY_MODE: bool = False
    ARENA_MAX_STUMP_PER_PARTICIPANT: int = 3
    MAX_CONNECTION_UPLOAD_BYTES: int = 250 * 1024 * 1024

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug_mode(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "production", "prod"}:
                return False
            if normalized in {"development", "dev", "debug"}:
                return True
        return value

    @field_validator("DATABASE_URL", "DEMO_POSTGRES_URL", mode="before")
    @classmethod
    def normalize_optional_database_url(cls, value):
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @property
    def demo_connections_enabled(self) -> bool:
        return not bool(self.DATABASE_URL)
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
