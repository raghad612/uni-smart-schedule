"""
Proposal lifecycle: state transitions (approve, reject) and clone.

These operate on the proposal as a whole. Per-assignment mutations live in
assignments.py.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.enums import ProposalStatus, AssignmentStatus
from app.schemas.proposals import ProposalResponse

router = APIRouter()


@router.post("/{proposal_id}/approve", response_model=ProposalResponse)
def approve_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Approve a proposal. Every other proposal for the same semester is
    automatically rejected so there's exactly one approved schedule per
    semester at any time."""
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == ProposalStatus.approved:
        raise HTTPException(status_code=400, detail="Proposal is already approved")

    db.query(ScheduleProposal).filter(
        ScheduleProposal.semester == proposal.semester,
        ScheduleProposal.id != proposal_id,
    ).update({"status": ProposalStatus.rejected})

    proposal.status = ProposalStatus.approved
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/{proposal_id}/reject", response_model=ProposalResponse)
def reject_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == ProposalStatus.approved:
        raise HTTPException(status_code=400, detail="Cannot reject an already approved proposal")

    proposal.status = ProposalStatus.rejected
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/{proposal_id}/clone", response_model=ProposalResponse)
def clone_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Clone a proposal as a new draft for safe manual editing.

    Carries over lock state on assignments. If the admin locked an assignment
    in the original, that decision survives the clone - otherwise cloning
    would silently strip their work.
    """
    original = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Proposal not found")

    clone = ScheduleProposal(
        semester=original.semester,
        status=ProposalStatus.draft,
        created_by=admin.id,
        notes=f"[CLONE of #{original.id}] {original.notes or ''}".strip(),
    )
    db.add(clone)
    db.flush()

    original_assignments = db.query(ScheduleAssignment).filter(
        ScheduleAssignment.proposal_id == proposal_id
    ).all()
    for a in original_assignments:
        db.add(ScheduleAssignment(
            proposal_id=clone.id,
            course_instance_id=a.course_instance_id,
            slot_id=a.slot_id,
            room_id=a.room_id,
            week_rotation=a.week_rotation,
            status=AssignmentStatus.proposed,
            locked=a.locked,
            locked_by=a.locked_by,
            locked_at=a.locked_at,
        ))

    original_conflicts = db.query(ConflictLog).filter(
        ConflictLog.proposal_id == proposal_id,
        ConflictLog.resolution == None,  # noqa: E711
    ).all()
    for c in original_conflicts:
        db.add(ConflictLog(
            proposal_id=clone.id,
            slot_id=c.slot_id,
            conflict_type=c.conflict_type,
            instructor_id=c.instructor_id,
            course_instance_id=c.course_instance_id,
            details=c.details,
        ))

    db.commit()
    db.refresh(clone)
    return clone