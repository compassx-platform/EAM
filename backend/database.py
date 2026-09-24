from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from backend.config import settings

# Database Engine Configuration (PostgreSQL / SQLite)
db_url = settings.sync_database_url
if not settings.is_production and not settings.DATABASE_URL:
    db_url = "sqlite:////tmp/eam.db"

if db_url.startswith("sqlite"):
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
        echo=False,
        future=True,
    )
else:
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
    """Idempotently adds a nullable column to an existing table in PostgreSQL/SQLite if missing (never drops or modifies data)."""
    try:
        bind = db.get_bind()
        if bind.dialect.name == "sqlite":
            with bind.connect() as conn:
                res = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                col_names = [r[1] for r in res]
                if column not in col_names:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
                    conn.commit()
        else:
            res = db.execute(text(
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{table}' AND column_name = '{column}'"
            )).fetchall()
            if not res:
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
                db.commit()
    except Exception:
        pass

def ensure_schema_compatibility(db: Session) -> None:
    """Idempotently ensures backward compatibility schema columns exist without altering or dropping any data."""
    _ensure_column(db, "entity_field", "label", "label VARCHAR(100)")
    _ensure_column(db, "app_user", "person_id", "person_id VARCHAR(50)")
    _ensure_column(db, "entity_form", "version_number", "version_number INTEGER DEFAULT 1")
    _ensure_column(db, "entity_form", "version_label", "version_label VARCHAR(50) DEFAULT 'v1'")
    _ensure_column(db, "entity_type_definition", "version_number", "version_number INTEGER DEFAULT 1")
    _ensure_column(db, "entity_type_definition", "version_label", "version_label VARCHAR(50) DEFAULT 'v1'")

