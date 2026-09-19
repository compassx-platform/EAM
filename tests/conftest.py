import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.database import Base, get_db
from backend.main import app
from tests.fixtures import load_test_fixtures

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite:///:memory:"
)

if TEST_DATABASE_URL.startswith("sqlite"):
    test_engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    test_engine = create_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
    )
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="function")
def test_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    
    # Load test fixtures
    load_test_fixtures(db)
    
    yield db
    
    db.close()
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture(scope="function")
def client(test_db, monkeypatch):
    monkeypatch.setattr("backend.main.SessionLocal", lambda: test_db)
    monkeypatch.setattr("backend.database.SessionLocal", lambda: test_db)
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
