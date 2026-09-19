from urllib.parse import quote_plus
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "CompassX EAM (Enterprise Asset Management)"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Environment mode (e.g. development, production, test)
    ENVIRONMENT: str = "development"

    # PostgreSQL Connection Parameters (Production Grade)
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "eam_db"
    
    # Database: Optional direct override or assembled PostgreSQL DSN
    DATABASE_URL: str | None = None
    
    # Secret Key & Auth
    SECRET_KEY: str = "compassx-workflow-secret-key-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Auto-expiry interval seconds for background worker (if running)
    EXPIRY_CHECK_INTERVAL_SECONDS: int = 30
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["*"]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in ("production", "prod")

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            if self.is_production and url.startswith("sqlite"):
                raise ValueError(
                    "SQLite database is not permitted in production environment (ENVIRONMENT=production). "
                    "A PostgreSQL database connection is strictly required."
                )
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg2://", 1)
            elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url
        
        # Build PostgreSQL URI directly from POSTGRES_* environment variables
        pw = quote_plus(self.POSTGRES_PASSWORD) if self.POSTGRES_PASSWORD else ""
        user = quote_plus(self.POSTGRES_USER) if self.POSTGRES_USER else ""
        return f"postgresql+psycopg2://{user}:{pw}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

settings = Settings()



