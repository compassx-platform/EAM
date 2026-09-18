# CompassX EAM — Enterprise Asset Management & Workflow Engine

An end-to-end, event-sourced, CQRS-structured Enterprise Asset Management (EAM) application designed for the CompassX platform with a hard-separated deterministic business-rule gate layer.

Built strictly according to the **[CompassX Workflow Engine — v1 Spec](compassx-workflow-engine-spec.md)** and styled using the **CompassX Design System**.

---

## 1. Architectural Highlights

1. **Event Sourcing & Append-Only Log**:
   - Every state transition appends an immutable event (`<entity>_event`) containing the event type, actor identity, actor type (`human` | `system`), timestamps, gate execution trace, and payload deltas.
   - Materialized `<entity>` tables act as a query-side cache, 100% rebuildable via projector event replay.
2. **CQRS Command Pipeline**:
   - Single command write path: `POST /api/{entity_type}/create` and `POST /api/{entity_type}/transition`.
   - Optimistic concurrency control via `last_event_id` compare-and-swap (rejects concurrent races with `409 Conflict: stale_write`).
3. **Closed, Fixed-Implementation Gate Layer**:
   - Hard-separated from workflow orchestration: Workflows only reference gate IDs.
   - 5 Closed Gate Types:
     - `role_check`: Asserts actor holds required RBAC role (e.g. Safety Officer, Supervisor).
     - `numeric_threshold`: Compares entity custom field (e.g. `estimated_cost ≤ 15000`).
     - `field_not_empty`: Validates custom field presence (e.g. `hazards_identified`).
     - `date_check`: Evaluates date comparisons (e.g. `expiry_date < now`).
     - `related_entity_status_check`: Cross-entity interlocking (e.g. WorkOrder `linked_permit_id` &rarr; Permit `status = 'Active'`).
   - Configurable failure policies: `block` (fail-closed) vs `allow` (fail-open advisory).
4. **Draft, Versioning & Validation Engine**:
   - Versioned immutable definitions (`workorder_v1`, `permit_v1`).
   - §6 graph rule validator enforcing state reachability, non-ambiguous transitions, and valid gate references.
5. **System Actor & Auto-Expiry**:
   - Periodic worker & manual trigger transitioning active permits past `expiry_date` with `actor_type="system"`.
6. **CompassX Design System UI**:
   - Interactive visual state-machine Canvas, Condition Builder, Try-It Simulator, Entity List/Detail views with dynamic transition buttons, and User/Role Switcher.

---

## 2. Quickstart & Running Locally

### Backend (FastAPI + PostgreSQL)

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Configure PostgreSQL environment (or set via .env)
export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/eam_db"

# 3. Run database migrations
alembic upgrade head

# 4. Run backend server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
```

Backend endpoints will be available at:
- **API Root / Docs**: `http://localhost:8080/docs`
- **Health check**: `http://localhost:8080/api/system/health`

### Frontend (React + Vite + Tailwind)

```bash
# 1. Install frontend dependencies
cd frontend
npm install

# 2. Run development server with API proxying
npm run dev

# 3. Build for production
npm run build
```

Frontend will be available at `http://localhost:5173`.

---

## 3. Automated Test Suite

Run pytest test suite verifying all condition logic, optimistic concurrency, draft validation, projector rebuilds, and workflow execution against PostgreSQL:

```bash
PYTHONPATH=. pytest -v tests
```

---

## 4. Production Database & RBAC

The application starts with a clean production schema on PostgreSQL. Administrative users, roles, workflows, entity types, and forms can be configured directly via the Admin API and UI.

