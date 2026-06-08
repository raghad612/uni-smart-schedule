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
from app.schemas.proposals import (
    ProposalResponse,
    ProposalDetail,
    AssignmentResponse,
    ConflictResponse,
    ResolveConflict,
    MoveAssignment,
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
    """Move an assignment to a different slot. Rechecks conflicts after move."""
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
    conflict_check = (
        db.query(ScheduleAssignment)
        .join(CourseInstance, ScheduleAssignment.course_instance_id == CourseInstance.id)
        .filter(
            ScheduleAssignment.proposal_id == proposal_id,
            ScheduleAssignment.slot_id == body.slot_id,
            CourseInstance.instructor_id == ci.instructor_id,
            ScheduleAssignment.id != assignment_id,
        )
        .first()
    )
    if conflict_check:
        raise HTTPException(
            status_code=409,
            detail="Instructor is already assigned in that slot within this proposal"
        )

    assignment.slot_id = body.slot_id
    if body.room_id:
        assignment.room_id = body.room_id

    db.query(ConflictLog).filter(
        ConflictLog.proposal_id == proposal_id,
        ConflictLog.conflict_type.in_(["instructor_double_booked", "room_double_booked"]),
    ).delete()

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