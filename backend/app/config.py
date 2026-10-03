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
    
    # AI provider (OpenAI-compatible chat API): "opentk" (testing environment,
    # models deepseek-v4.1-flash and glm-5.3) or "together" (DeepSeek-V4-Flash-0731
    # and Kimi-K3). Models are defined in providers/llm_client.PROVIDERS.
    LLM_PROVIDER: str = "opentk"
    OPENTK_KEY: Optional[str] = None
    OPENTK_API_KEY: Optional[str] = None
    TOGETHER_API_KEY: Optional[str] = None
    TOGETHER_AI_KEY: Optional[str] = None
    # Empty means the provider's own URL.
    LLM_BASE_URL: str = ""
    # Default model; empty means the provider's first model.
    EXECUTION_MODEL: str = ""
    # Model for difficult work (High/Max effort, report planning); empty means the provider's second model.
    DEEP_MODEL: str = ""
    # Models to try when one fails before answering, e.g. "gpt-5.6-luna:deepseek-v4.1-flash,gpt-6.1-sol:glm-5.3".
    # Empty means the provider's built-in chains.
    FALLBACK_MODELS: str = ""
    # Models sent no reasoning switch, comma-separated. Some models think for a minute over a long
    # schema prompt when reasoning is switched on; listed models answer at their own default.
    NO_REASONING_MODELS: str = ""
    # Models whose every request asks for high reasoning effort (comma separated).
    HIGH_REASONING_MODELS: str = "gpt-6.1-sol"
    DEFAULT_MODEL: str = ""
    
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
    # Outgoing email (weekly report packs, answers from the review queue). Gmail by
    # default: SMTP_USER/SMTP_PASSWORD, or EMAIL/APP_PASS (a Google App Password).
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL: Optional[str] = None
    APP_PASS: Optional[str] = None
    SMTP_FROM_NAME: str = "SlayQL Reports"
    # Email askers when an analyst answers their question. Off unless switched on.
    EMAIL_NOTIFICATIONS: bool = False
    # Send scheduled report emails from this server (checked every 5 minutes).
    REPORT_SCHEDULER: bool = True
    # Where links in emails point.
    PUBLIC_APP_URL: str = "http://localhost:5173"
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

    # Built-in SlayQL Demo Database (read-only, shared). Unset: shown whenever its file exists,
    # including on the live server. Set ENABLE_DEMO_DATABASE=false to hide it.
    ENABLE_DEMO_DATABASE: Optional[bool] = None

    @property
    def demo_connections_enabled(self) -> bool:
        if self.ENABLE_DEMO_DATABASE is not None:
            return self.ENABLE_DEMO_DATABASE
        return Path(self.SQLITE_DEMO_PATH).exists()
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
