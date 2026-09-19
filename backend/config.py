import os
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
    
    # PostgreSQL Connection Parameters (Production Grade)
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "eam_db"
    
    # Database: Optional direct override or assembled PostgreSQL DSN
    DATABASE_URL: str | None = os.getenv("DATABASE_URL", "sqlite:////tmp/app.db")
    
    # Secret Key & Auth
    SECRET_KEY: str = "compassx-workflow-secret-key-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Auto-expiry interval seconds for background worker (if running)
    EXPIRY_CHECK_INTERVAL_SECONDS: int = 30
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["*"]

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg2://", 1)
            elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

settings = Settings()


