"""
Read endpoints: list proposals, fetch approved, locked-summary, fetch single.

Route order matters and is preserved deliberately here:
  GET  /              (list)
  GET  /approved      (literal, before /{id})
  GET  /locked-summary (literal, before /{id})
  GET  /{proposal_id} (parametrized, MUST come last among GETs)

If any of those literal-path routes are moved below /{proposal_id}, FastAPI
will try to parse them as integer ids and 422.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import require_admin, get_current_user
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.time_slot import TimeSlot
from app.models.course_instance import CourseInstance
from app.models.enums import ProposalStatus
from app.schemas.proposals import (
    ProposalResponse,
    ProposalDetail,
    AssignmentResponse,
    LockedSummaryResponse,
)

from ._helpers import enrich_conflict

router = APIRouter()


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


@router.get("/approved", response_model=Optional[ProposalDetail])
def get_approved_proposal(
    semester: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the approved proposal for a semester. Accessible by both admins and instructors."""
    proposal = db.query(ScheduleProposal).filter(
        ScheduleProposal.semester == semester,
        ScheduleProposal.status == ProposalStatus.approved,
    ).first()

    if not proposal:
        return None

    raw_assignments = (
        db.query(ScheduleAssignment, TimeSlot)
        .join(TimeSlot, ScheduleAssignment.slot_id == TimeSlot.id)
        .options(
            joinedload(ScheduleAssignment.course_instance).joinedload(CourseInstance.instructor),
            joinedload(ScheduleAssignment.course_instance).joinedload(CourseInstance.subject),
            joinedload(ScheduleAssignment.room),
        )
        .filter(ScheduleAssignment.proposal_id == proposal.id)
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
            instructor_id=a.course_instance.instructor_id if a.course_instance else None,
            instructor_name=a.course_instance.instructor.name if a.course_instance and a.course_instance.instructor else None,
            subject_name=a.course_instance.subject.name if a.course_instance and a.course_instance.subject else None,
            subject_code=a.course_instance.subject.code if a.course_instance and a.course_instance.subject else None,
            room_name=a.room.room_name if a.room else None,
            locked=a.locked,
            locked_by=a.locked_by,
            locked_at=a.locked_at,
        )
        for a, ts in raw_assignments
    ]

    return ProposalDetail(
        id=proposal.id,
        semester=proposal.semester,
        status=proposal.status,
        notes=proposal.notes,
        created_at=proposal.created_at,
        assignments=assignments,
        conflicts=[],
    )


@router.get("/locked-summary", response_model=LockedSummaryResponse)
def get_locked_summary(
    semester: str = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Return a one-card summary for the dashboard: which draft (if any) currently
    holds locks that would carry forward on the next engine run, and how many.

    Registered BEFORE the /{proposal_id} route so FastAPI doesn't try to
    interpret "locked-summary" as an integer proposal id.
    """
    drafts = (
        db.query(ScheduleProposal)
        .filter(
            ScheduleProposal.semester == semester,
            ScheduleProposal.status == ProposalStatus.draft,
        )
        .order_by(ScheduleProposal.created_at.desc(), ScheduleProposal.id.desc())
        .all()
    )

    if not drafts:
        return LockedSummaryResponse(
            semester=semester,
            most_recent_draft_id=None,
            most_recent_draft_created_at=None,
            locked_count=0,
            total_draft_count=0,
        )

    most_recent = drafts[0]
    locked_count = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.proposal_id == most_recent.id,
            ScheduleAssignment.locked == True,  # noqa: E712
        )
        .count()
    )

    return LockedSummaryResponse(
        semester=semester,
        most_recent_draft_id=most_recent.id,
        most_recent_draft_created_at=most_recent.created_at,
        locked_count=locked_count,
        total_draft_count=len(drafts),
    )


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
            instructor_id=a.course_instance.instructor_id if a.course_instance else None,
            instructor_name=a.course_instance.instructor.name if a.course_instance and a.course_instance.instructor else None,
            subject_name=a.course_instance.subject.name if a.course_instance and a.course_instance.subject else None,
            subject_code=a.course_instance.subject.code if a.course_instance and a.course_instance.subject else None,
            room_name=a.room.room_name if a.room else None,
            locked=a.locked,
            locked_by=a.locked_by,
            locked_at=a.locked_at,
        )
        for a, ts in raw_assignments
    ]

    raw_conflicts = (
        db.query(ConflictLog)
        .filter(ConflictLog.proposal_id == proposal_id)
        .all()
    )
    conflicts = [enrich_conflict(c, db) for c in raw_conflicts]

    return ProposalDetail(
        id=proposal.id,
        semester=proposal.semester,
        status=proposal.status,
        notes=proposal.notes,
        created_at=proposal.created_at,
        assignments=assignments,
        conflicts=conflicts,
    )