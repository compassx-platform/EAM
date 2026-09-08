import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "CompassX EAM (Enterprise Asset Management)"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Database: Default to sqlite for local standalone runtime, or PostgreSQL when DATABASE_URL is set
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./workflow_manager.db")
    
    # Secret Key & Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "compassx-workflow-secret-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Auto-expiry interval seconds for background worker (if running)
    EXPIRY_CHECK_INTERVAL_SECONDS: int = int(os.getenv("EXPIRY_CHECK_INTERVAL_SECONDS", "30"))
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["*"]
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
