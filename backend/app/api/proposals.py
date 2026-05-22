from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.time_slot import TimeSlot
from app.models.course_instance import CourseInstance
from app.models.room import Room
from app.models.enums import ProposalStatus
from app.schemas.proposals import (
    ProposalResponse,
    ProposalDetail,
    AssignmentResponse,
    ConflictResponse,
    ResolveConflict,
)

router = APIRouter()
conflicts_router = APIRouter()


@router.get("/", response_model=list[ProposalResponse])
def list_proposals(
    semester: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = db.query(ScheduleProposal)
    if semester:
        query = query.filter(ScheduleProposal.semester == semester)
    return query.order_by(ScheduleProposal.created_at.desc()).all()


@router.get("/{proposal_id}", response_model=ProposalDetail)
def get_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    raw_assignments = (
        db.query(ScheduleAssignment, TimeSlot)
        .join(TimeSlot, ScheduleAssignment.slot_id == TimeSlot.id)
        .options(
            joinedload(ScheduleAssignment.course_instance).joinedload(CourseInstance.instructor),
            joinedload(ScheduleAssignment.course_instance).joinedload(CourseInstance.subject),
            joinedload(ScheduleAssignment.room),
        )
        .filter(ScheduleAssignment.proposal_id == proposal_id)
        .all()
    )

    assignments = [
        AssignmentResponse(
            id=a.id,
            course_instance_id=a.course_instance_id,
            slot_id=a.slot_id,
            room_id=a.room_id,
            week_rotation=a.week_rotation,
            status=a.status,
            day=ts.day,
            slot_num=ts.slot_num,
            start_time=ts.start_time,
            end_time=ts.end_time,
            instructor_name=a.course_instance.instructor.name if a.course_instance and a.course_instance.instructor else None,
            subject_name=a.course_instance.subject.name if a.course_instance and a.course_instance.subject else None,
            room_name=a.room.room_name if a.room else None,
        )
        for a, ts in raw_assignments
    ]

    conflicts = (
        db.query(ConflictLog)
        .filter(ConflictLog.proposal_id == proposal_id)
        .all()
    )

    return ProposalDetail(
        id=proposal.id,
        semester=proposal.semester,
        status=proposal.status,
        notes=proposal.notes,
        created_at=proposal.created_at,
        assignments=assignments,
        conflicts=conflicts,
    )


@router.post("/{proposal_id}/approve", response_model=ProposalResponse)
def approve_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
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


@router.get("/{proposal_id}/conflicts", response_model=list[ConflictResponse])
def list_conflicts(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return db.query(ConflictLog).filter(ConflictLog.proposal_id == proposal_id).all()


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
    return conflict