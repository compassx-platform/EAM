import pytest
from backend.config import Settings

def test_default_postgres_uri_assembly(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "ecg-pg-prod.postgres.database.azure.com")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "eam_db")
    monkeypatch.setenv("POSTGRES_USER", "pgadmin")
    monkeypatch.setenv("POSTGRES_PASSWORD", "mypassword123")
    monkeypatch.setenv("ENVIRONMENT", "development")

    settings = Settings()
    assert settings.DATABASE_URL is None
    assert settings.is_production is False
    assert (
        settings.sync_database_url
        == "postgresql+psycopg2://pgadmin:mypassword123@ecg-pg-prod.postgres.database.azure.com:5432/eam_db"
    )

def test_postgres_uri_password_escaping(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_USER", "pgadmin")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss:w/ord#1")
    monkeypatch.setenv("POSTGRES_HOST", "ecg-pg-prod.postgres.database.azure.com")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "eam_db")

    settings = Settings()
    assert "p%40ss%3Aw%2Ford%231" in settings.sync_database_url

def test_production_strictly_enforces_postgres_forbids_sqlite(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/app.db")

    settings = Settings()
    assert settings.is_production is True
    with pytest.raises(ValueError, match="SQLite database is not permitted in production"):
        _ = settings.sync_database_url

def test_production_allows_postgres_url(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://pgadmin:secret@ecg-pg-prod.postgres.database.azure.com:5432/eam_db",
    )

    settings = Settings()
    assert settings.is_production is True
    assert (
        settings.sync_database_url
        == "postgresql+psycopg2://pgadmin:secret@ecg-pg-prod.postgres.database.azure.com:5432/eam_db"
    )

def test_development_allows_sqlite_override(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/app.db")

    settings = Settings()
    assert settings.is_production is False
    assert settings.sync_database_url == "sqlite:////tmp/app.db"
