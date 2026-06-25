"""
Conflict endpoints. Two routers because they live at different mount points:

  router            - GET /proposals/{id}/conflicts (mounted at /proposals)
  conflicts_router  - POST /conflicts/{id}/resolve (mounted at /conflicts)

Keeping them in the same module makes sense because they share the
enrich_conflict helper and the conceptual domain.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.conflict_log import ConflictLog
from app.schemas.proposals import ConflictResponse, ResolveConflict

from ._helpers import enrich_conflict

router = APIRouter()
conflicts_router = APIRouter()


@router.get("/{proposal_id}/conflicts", response_model=list[ConflictResponse])
def list_conflicts(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    raw = db.query(ConflictLog).filter(ConflictLog.proposal_id == proposal_id).all()
    return [enrich_conflict(c, db) for c in raw]


@conflicts_router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
def resolve_conflict(
    conflict_id: int,
    body: ResolveConflict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conflict = db.query(ConflictLog).filter(ConflictLog.id == conflict_id).first()
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict not found")
    if conflict.resolution:
        raise HTTPException(status_code=400, detail="Conflict is already resolved")

    conflict.resolution = body.resolution
    conflict.resolved_by = admin.id
    db.commit()
    db.refresh(conflict)
    return enrich_conflict(conflict, db)