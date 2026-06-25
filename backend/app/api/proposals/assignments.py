"""
Per-assignment mutations: move, create, lock.

All three return the full ProposalDetail after mutating so the frontend can
update its cache in one round-trip.
"""
import math
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.time_slot import TimeSlot
from app.models.course_instance import CourseInstance
from app.models.enums import ProposalStatus, AssignmentStatus, WeekRotation
from app.services.slot_availability import check_slot_available
from app.schemas.proposals import (
    ProposalDetail,
    MoveAssignment,
    CreateAssignment,
    LockAssignment,
)

from .read import get_proposal

router = APIRouter()


@router.put("/{proposal_id}/assignments/{assignment_id}", response_model=ProposalDetail)
def move_assignment(
    proposal_id: int,
    assignment_id: int,
    body: MoveAssignment,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Move an assignment to a different slot. Rejects moves that would create
    instructor or room double-booking (same-proposal OR cross-proposal approved),
    taking week_rotation into account (WEEK_A and WEEK_B can legitimately share
    a slot/room because they alternate). Cleans up double-booking conflicts after
    a successful move."""
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == ProposalStatus.approved:
        raise HTTPException(status_code=400, detail="Cannot edit an approved proposal")

    assignment = db.query(ScheduleAssignment).filter(
        ScheduleAssignment.id == assignment_id,
        ScheduleAssignment.proposal_id == proposal_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Lock guard: locked assignments are protected from accidental moves.
    # Admin must explicitly unlock first. The friendly message guides them
    # to the unlock action in the UI.
    if assignment.locked:
        raise HTTPException(
            status_code=400,
            detail=(
                "This assignment is locked. Click the lock icon on the assignment "
                "to unlock it first, then try moving again."
            ),
        )

    new_slot = db.query(TimeSlot).filter(TimeSlot.id == body.slot_id).first()
    if not new_slot:
        raise HTTPException(status_code=404, detail="Time slot not found")

    ci = db.query(CourseInstance).filter(CourseInstance.id == assignment.course_instance_id).first()

    effective_room_id = body.room_id if body.room_id else assignment.room_id
    moving_rotation = assignment.week_rotation or WeekRotation.ALWAYS

    err = check_slot_available(
        db=db,
        proposal_id=proposal_id,
        semester=proposal.semester,
        slot_id=body.slot_id,
        room_id=effective_room_id,
        instructor_id=ci.instructor_id,
        rotation=moving_rotation,
        exclude_assignment_id=assignment_id,
    )
    if err:
        raise HTTPException(status_code=409, detail=err)

    assignment.slot_id = body.slot_id
    if body.room_id:
        assignment.room_id = body.room_id

    db.query(ConflictLog).filter(
        ConflictLog.proposal_id == proposal_id,
        ConflictLog.conflict_type.in_(["instructor_double_booked", "room_double_booked"]),
    ).delete()

    db.commit()

    return get_proposal(proposal_id, db, admin)


@router.post("/{proposal_id}/assignments", response_model=ProposalDetail)
def create_assignment(
    proposal_id: int,
    body: CreateAssignment,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Place a new session manually (used when the engine couldn't fully assign
    a course and surfaced an incomplete_assignment conflict).

    Rejects:
      - approved proposals (read-only)
      - course_instances that don't belong to this proposal's semester period
      - missing default room (when caller doesn't supply room_id and the
        section has none)
      - over-assignment (course already has ceil(sessions_per_week) sessions)
      - same-proposal instructor/room double-booking (rotation-aware)
      - cross-proposal approved instructor/room collisions

    On success:
      - inserts a new ScheduleAssignment row (status = proposed)
      - removes stale instructor_double_booked / room_double_booked conflict rows
      - removes the incomplete_assignment conflict for this course if all
        required sessions are now placed, or updates its 'missing' count
        otherwise
    """
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == ProposalStatus.approved:
        raise HTTPException(status_code=400, detail="Cannot edit an approved proposal")

    ci = db.query(CourseInstance).filter(
        CourseInstance.id == body.course_instance_id
    ).first()
    if not ci:
        raise HTTPException(status_code=404, detail="Course instance not found")

    # Proposal semester is "YYYY-P" (e.g. "2024-2"); course_instance.semester
    # is just the period ("1" or "2"). Compare the period only.
    proposal_period = (
        proposal.semester.split("-")[-1] if "-" in proposal.semester else proposal.semester
    )
    if ci.semester != proposal_period:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This course belongs to semester period {ci.semester}, but this "
                f"proposal is for period {proposal_period}. Pick a course that belongs "
                f"to this semester."
            ),
        )

    slot = db.query(TimeSlot).filter(TimeSlot.id == body.slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Time slot not found")

    effective_room_id = body.room_id or (ci.section.default_room_id if ci.section else None)
    if effective_room_id is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No room specified and this section has no default room. "
                "Please pick a room."
            ),
        )

    # Over-assignment guard. ceil() matches how the engine derives session count:
    # 3.5 -> 4 placements (3 ALWAYS + 1 WEEK_A or WEEK_B).
    required = math.ceil(ci.subject.sessions_per_week) if ci.subject else 1
    existing_count = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.proposal_id == proposal_id,
            ScheduleAssignment.course_instance_id == body.course_instance_id,
        )
        .count()
    )
    if existing_count >= required:
        code = ci.subject.code if ci.subject else f"course #{ci.id}"
        raise HTTPException(
            status_code=409,
            detail=(
                f"{code} already has all {required} required session(s) assigned "
                f"in this proposal. Nothing to add."
            ),
        )

    rotation = body.week_rotation or WeekRotation.ALWAYS
    err = check_slot_available(
        db=db,
        proposal_id=proposal_id,
        semester=proposal.semester,
        slot_id=body.slot_id,
        room_id=effective_room_id,
        instructor_id=ci.instructor_id,
        rotation=rotation,
    )
    if err:
        raise HTTPException(status_code=409, detail=err)

    new_assignment = ScheduleAssignment(
        proposal_id=proposal_id,
        course_instance_id=body.course_instance_id,
        slot_id=body.slot_id,
        room_id=effective_room_id,
        week_rotation=rotation,
        status=AssignmentStatus.proposed,
    )
    db.add(new_assignment)
    db.flush()

    # Cleanup: stale generic conflicts get cleared (the engine recomputes them
    # next run anyway).
    db.query(ConflictLog).filter(
        ConflictLog.proposal_id == proposal_id,
        ConflictLog.conflict_type.in_(["instructor_double_booked", "room_double_booked"]),
    ).delete()

    # Cleanup: the incomplete_assignment row for THIS course is either gone
    # (if we just completed it) or its "X missing" count needs updating.
    new_total = existing_count + 1
    incomplete = (
        db.query(ConflictLog)
        .filter(
            ConflictLog.proposal_id == proposal_id,
            ConflictLog.course_instance_id == body.course_instance_id,
            ConflictLog.conflict_type == "incomplete_assignment",
        )
        .first()
    )
    if incomplete:
        if new_total >= required:
            db.delete(incomplete)
        else:
            missing = required - new_total
            code = ci.subject.code if ci.subject else f"course_instance #{ci.id}"
            incomplete.details = (
                f"{code} needs {required} session(s)/week, but only {new_total} "
                f"could be scheduled ({missing} missing). Assign the remaining "
                f"session(s) manually."
            )

    db.commit()
    return get_proposal(proposal_id, db, admin)


@router.put("/{proposal_id}/assignments/{assignment_id}/lock", response_model=ProposalDetail)
def lock_assignment(
    proposal_id: int,
    assignment_id: int,
    body: LockAssignment,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Toggle the lock state of an assignment.

    Locking an assignment:
      - Prevents the gap optimizer from swapping it during engine re-runs
      - Prevents accidental admin moves (must explicitly unlock first)
      - Carries the assignment forward when a new proposal is generated for
        the same semester (inheritance from the most recent draft)

    Idempotent: PUT { locked: true } twice is a no-op the second time. The
    body specifies target state, not action, so the frontend can blindly
    send `{ locked: !current }` without branching.

    `locked_by` and `locked_at` are populated for audit. Any admin can
    lock/unlock any assignment (no cross-admin gating); the audit columns
    just record who did what when.
    """
    proposal = db.query(ScheduleProposal).filter(ScheduleProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == ProposalStatus.approved:
        raise HTTPException(
            status_code=400,
            detail="Cannot change lock state on an approved proposal.",
        )

    assignment = db.query(ScheduleAssignment).filter(
        ScheduleAssignment.id == assignment_id,
        ScheduleAssignment.proposal_id == proposal_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if body.locked:
        assignment.locked = True
        assignment.locked_by = admin.id
        assignment.locked_at = datetime.utcnow()
    else:
        assignment.locked = False
        assignment.locked_by = None
        assignment.locked_at = None

    db.commit()
    return get_proposal(proposal_id, db, admin)