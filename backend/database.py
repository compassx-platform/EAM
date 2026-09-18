from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from backend.config import settings

# Production PostgreSQL Engine Configuration
db_url = settings.sync_database_url

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _ensure_column(db: Session, table: str, column: str, ddl: str) -> None:
    """Idempotently adds a nullable column to an existing table in PostgreSQL if missing (never drops or modifies data)."""
    try:
        res = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            f"WHERE table_name = '{table}' AND column_name = '{column}'"
        )).fetchall()
        if not res:
            db.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
            db.commit()
    except Exception:
        db.rollback()

def ensure_schema_compatibility(db: Session) -> None:
    """Idempotently ensures backward compatibility schema columns exist without altering or dropping any data."""
    _ensure_column(db, "entity_field", "label", "label VARCHAR(100)")
    _ensure_column(db, "app_user", "person_id", "person_id VARCHAR(50)")

