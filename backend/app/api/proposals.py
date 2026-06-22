import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import require_admin, get_current_user
from app.models.user import User
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.time_slot import TimeSlot
from app.models.course_instance import CourseInstance
from app.models.instructor import Instructor
from app.models.subject import Subject
from app.models.section import Section
from app.models.room import Room
from app.models.enums import ProposalStatus, AssignmentStatus, WeekRotation
from app.services.scheduling_engine import _rotations_overlap, load_committed_slots
from app.schemas.proposals import (
    ProposalResponse,
    ProposalDetail,
    AssignmentResponse,
    ConflictResponse,
    ResolveConflict,
    MoveAssignment,
    CreateAssignment,
)

router = APIRouter()
conflicts_router = APIRouter()


def _enrich_conflict(conflict: ConflictLog, db: Session) -> ConflictResponse:
    """Build a ConflictResponse with human-readable instructor/subject/slot info."""
    instructor_name = None
    subject_name = None
    section_label = None
    slot_label = None

    if conflict.instructor_id:
        instr = db.query(Instructor).filter(Instructor.id == conflict.instructor_id).first()
        if instr:
            instructor_name = instr.name.title()

    if conflict.course_instance_id:
        ci = db.query(CourseInstance).filter(CourseInstance.id == conflict.course_instance_id).first()
        if ci:
            subj = db.query(Subject).filter(Subject.id == ci.subject_id).first()
            if subj:
                subject_name = subj.name
            sec = db.query(Section).filter(Section.id == ci.section_id).first()
            if sec:
                section_label = sec.group_label

    if conflict.slot_id:
        ts = db.query(TimeSlot).filter(TimeSlot.id == conflict.slot_id).first()
        if ts:
            slot_label = f"{ts.day} {ts.start_time}–{ts.end_time}"

    return ConflictResponse(
        id=conflict.id,
        slot_id=conflict.slot_id,
        conflict_type=conflict.conflict_type,
        instructor_id=conflict.instructor_id,
        course_instance_id=conflict.course_instance_id,
        details=conflict.details,
        resolution=conflict.resolution,
        resolved_by=conflict.resolved_by,
        detected_at=conflict.detected_at,
        instructor_name=instructor_name,
        subject_name=subject_name,
        section_label=section_label,
        slot_label=slot_label,
    )


def _check_slot_available(
    db: Session,
    proposal_id: int,
    semester: str,
    slot_id: int,
    room_id: Optional[int],
    instructor_id: int,
    rotation: WeekRotation,
    exclude_assignment_id: Optional[int] = None,
) -> Optional[str]:
    """
    Decides whether (instructor_id, room_id, slot_id, rotation) can be placed
    inside the given proposal without clashing with anything.

    Returns:
        None  -- slot is free, caller may proceed.
        str   -- user-friendly explanation of WHY it's blocked, ready to surface
                 in an HTTP 409 (caller is responsible for raising). Includes
                 the instructor name / room name / semester label so the admin
                 immediately sees what's wrong and how to react.

    Checks two layers:
      1. Other assignments in THIS proposal (same draft) at the same slot,
         taking week_rotation into account (WEEK_A and WEEK_B alternate, so
         they can legitimately share a slot/room/instructor).
      2. Cross-proposal commitments from APPROVED proposals in the same
         semester (via load_committed_slots). These are conservatively
         blocked regardless of rotation, matching how the engine treats them
         during draft generation.

    Pass exclude_assignment_id when checking a MOVE so the assignment being
    moved doesn't count itself as a conflict.
    """
    rotation = rotation or WeekRotation.ALWAYS

    # ---- Layer 1: same-proposal occupants ----
    query = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.proposal_id == proposal_id,
            ScheduleAssignment.slot_id == slot_id,
        )
    )
    if exclude_assignment_id is not None:
        query = query.filter(ScheduleAssignment.id != exclude_assignment_id)

    for other in query.all():
        other_rotation = other.week_rotation or WeekRotation.ALWAYS
        if not _rotations_overlap(rotation, other_rotation):
            continue  # WEEK_A vs WEEK_B - alternates, share is fine
        other_ci = db.query(CourseInstance).filter(
            CourseInstance.id == other.course_instance_id
        ).first()
        if other_ci and other_ci.instructor_id == instructor_id:
            instr = db.query(Instructor).filter(Instructor.id == instructor_id).first()
            name = instr.name.title() if instr else f"Instructor #{instructor_id}"
            return (
                f"{name} is already teaching another course in this slot in this draft. "
                f"Pick a different time slot, or move the other course first."
            )
        if room_id and other.room_id == room_id:
            room = db.query(Room).filter(Room.id == room_id).first()
            room_name = room.room_name if room else f"Room #{room_id}"
            return (
                f"Room {room_name} is already booked in this slot in this draft. "
                f"Pick a different room or a different time slot."
            )

    # ---- Layer 2: cross-proposal approved commitments ----
    instructor_committed, room_committed = load_committed_slots(db, semester)
    if slot_id in instructor_committed.get(instructor_id, set()):
        instr = db.query(Instructor).filter(Instructor.id == instructor_id).first()
        name = instr.name.title() if instr else f"Instructor #{instructor_id}"
        return (
            f"{name} is already scheduled in this slot in the approved {semester} "
            f"schedule (teaching another section). Try a different time slot where "
            f"they are available."
        )
    if room_id and slot_id in room_committed.get(room_id, set()):
        room = db.query(Room).filter(Room.id == room_id).first()
        room_name = room.room_name if room else f"Room #{room_id}"
        return (
            f"Room {room_name} is already booked in this slot in the approved "
            f"{semester} schedule. Pick a different room or a different time slot."
        )

    return None


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
        )
        for a, ts in raw_assignments
    ]

    raw_conflicts = (
        db.query(ConflictLog)
        .filter(ConflictLog.proposal_id == proposal_id)
        .all()
    )
    conflicts = [_enrich_conflict(c, db) for c in raw_conflicts]

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

    raw = db.query(ConflictLog).filter(ConflictLog.proposal_id == proposal_id).all()
    return [_enrich_conflict(c, db) for c in raw]


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

    new_slot = db.query(TimeSlot).filter(TimeSlot.id == body.slot_id).first()
    if not new_slot:
        raise HTTPException(status_code=404, detail="Time slot not found")

    ci = db.query(CourseInstance).filter(CourseInstance.id == assignment.course_instance_id).first()

    effective_room_id = body.room_id if body.room_id else assignment.room_id
    moving_rotation = assignment.week_rotation or WeekRotation.ALWAYS

    err = _check_slot_available(
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
    err = _check_slot_available(
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


@router.post("/{proposal_id}/clone", response_model=ProposalResponse)
def clone_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Clone a proposal as a new draft for safe manual editing."""
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
        ))

    original_conflicts = db.query(ConflictLog).filter(
        ConflictLog.proposal_id == proposal_id,
        ConflictLog.resolution == None,
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
    return _enrich_conflict(conflict, db)