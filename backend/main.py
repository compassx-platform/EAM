import os
import time
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import settings
from backend.database import SessionLocal, engine, Base, ensure_schema_compatibility
from backend.services.expiry_worker import check_and_expire_permits
from backend.routers import (
    auth_router,
    fields_router,
    conditions_router,
    workflows_router,
    entities_router,
    system_router,
    forms_router,
    actions_router,
    lists_router,
    entity_types_router,
    persons_router,
    groups_router,
    roles_router,
    tasks_router,
)

async def periodic_expiry_checker():
    """Background task to automatically expire permits past their expiry_date (Section 7.4)"""
    while True:
        try:
            db = SessionLocal()
            try:
                check_and_expire_permits(db)
            finally:
                db.close()
        except Exception:
            pass
        await asyncio.sleep(settings.EXPIRY_CHECK_INTERVAL_SECONDS)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database schema tables exist non-destructively without altering or deleting existing data
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            ensure_schema_compatibility(db)
        finally:
            db.close()
    except Exception as exc:
        print(f"[CompassX] Database startup initialization notice: {exc}")


    # Start background expiry task
    expiry_task = asyncio.create_task(periodic_expiry_checker())
    yield
    # Shutdown
    expiry_task.cancel()

app = FastAPI(
    title="CompassX Workflow Engine & Manager",
    description="Event-Sourced Generic Workflow Engine with Centralized Reusable Conditions",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers under API prefix
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(fields_router, prefix=settings.API_PREFIX)
app.include_router(conditions_router, prefix=settings.API_PREFIX)
app.include_router(workflows_router, prefix=settings.API_PREFIX)
app.include_router(forms_router, prefix=settings.API_PREFIX)
app.include_router(actions_router, prefix=settings.API_PREFIX)
app.include_router(lists_router, prefix=settings.API_PREFIX)
app.include_router(entity_types_router, prefix=settings.API_PREFIX)
app.include_router(persons_router, prefix=settings.API_PREFIX)
app.include_router(groups_router, prefix=settings.API_PREFIX)
app.include_router(roles_router, prefix=settings.API_PREFIX)
app.include_router(tasks_router, prefix=settings.API_PREFIX)
app.include_router(system_router, prefix=settings.API_PREFIX)
app.include_router(entities_router)  # Includes /api/{entity_type}/...

# Static file serving for React frontend (App Module container support)
static_dirs = [
    os.path.join(os.path.dirname(__file__), "static"),
    os.path.join(os.path.dirname(__file__), "dist"),
    os.path.join(os.path.dirname(__file__), "../frontend/dist"),
]
dist_path = None
for s_dir in static_dirs:
    if os.path.exists(s_dir) and os.path.exists(os.path.join(s_dir, "index.html")):
        dist_path = s_dir
        break

if dist_path:
    assets_dir = os.path.join(dist_path, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", tags=["Frontend"])
    def serve_frontend(full_path: str):
        file_path = os.path.join(dist_path, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    @app.get("/", tags=["Root"])
    def root():
        return {
            "message": "CompassX Workflow Engine & Manager API is running",
            "docs": "/docs",
            "health": f"{settings.API_PREFIX}/system/health",
            "spec": "CompassX Workflow Engine v1 Spec",
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
