"""
proposals package
─────────────────

Replaces the previous monolithic app/api/proposals.py. The package keeps the
same public surface (router and conflicts_router) but splits the implementation
across focused modules:

  read.py         - GET endpoints (list, approved, locked-summary, single)
  lifecycle.py    - status transitions (approve, reject, clone)
  assignments.py  - mutations on individual assignments (move, create, lock)
  conflicts.py    - conflict reads and resolve
  _helpers.py     - small shared helpers (enrich_conflict)

main.py still imports the package as `from app.api import proposals` and uses
`proposals.router` / `proposals.conflicts_router` exactly as before.

Route registration order matters: literal-path GETs (/approved, /locked-summary)
MUST be registered before the parametrized GET /{proposal_id}, or FastAPI will
try to parse "approved" as an integer. All GETs live in read.py in the correct
order to keep that invariant local and visible.
"""
from fastapi import APIRouter

from .read import router as read_router
from .lifecycle import router as lifecycle_router
from .assignments import router as assignments_router
from .conflicts import (
    router as proposal_conflicts_router,
    conflicts_router,
)

# Combined router mounted at /proposals in main.py.
# Order of inclusion is significant: read_router contains the literal-path GETs
# (/approved, /locked-summary) and the parametrized GET /{proposal_id} in the
# right relative order, so it's safe to include the others after it.
router = APIRouter()
router.include_router(read_router)
router.include_router(lifecycle_router)
router.include_router(assignments_router)
router.include_router(proposal_conflicts_router)

# Mounted separately at /conflicts in main.py.
__all__ = ["router", "conflicts_router"]