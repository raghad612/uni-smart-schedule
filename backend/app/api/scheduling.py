from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.time_slot import TimeSlot
from app.models.section import Section
from app.services.scheduling_engine import (
    load_data,
    load_committed_slots,
    load_inherited_locks,
    validate_availability,
    sort_instructors,
    assign_slots,
    calculate_gap_score,
    optimise_gaps,
    detect_conflicts,
    save_proposal,
)

router = APIRouter()


class RunEngineRequest(BaseModel):
    semester: str
    notes: str = ""
    simulation: bool = False
    section_id: Optional[int] = None


@router.post("/run")
def run_scheduling_engine(
    body: RunEngineRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Extract period ("1" or "2") from full semester string ("2024-2" → "2")
    parts = body.semester.split("-")
    if len(parts) != 2 or parts[1] not in ("1", "2"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid semester format '{body.semester}'. Expected format: YYYY-1 or YYYY-2"
        )
    period = parts[1]

    # Step 1 - load
    # semester (full) → filters availability and proposals
    # period ("1"/"2") → filters course_instances
    instructors, course_instances, availability = load_data(db, body.semester, period)

    # Filter to specific section if provided
    section_label = ""
    if body.section_id is not None:
        section = db.query(Section).filter(Section.id == body.section_id).first()
        if not section:
            raise HTTPException(status_code=404, detail=f"Section {body.section_id} not found")
        course_instances = [ci for ci in course_instances if ci.section_id == body.section_id]
        section_label = f"Year {section.year_level} {section.language.value} ({section.group_label})"

    if not course_instances:
        raise HTTPException(
            status_code=400,
            detail=f"No course instances found for semester period '{period}'"
            + (f" in section '{section_label}'" if section_label else "")
        )

  # Step 2 - load committed slots from approved proposals this semester
    instructor_committed, room_committed = load_committed_slots(db, body.semester)

    # Step 2b - time slots, needed for gap scoring AND for the assignment
    # step's day-spread logic (max 2 sessions/day per course)
    time_slots = db.query(TimeSlot).all()

    # Step 2c - Phase 3 / Option B: inherit locks from most recent draft.
    # Locked sessions from the previous draft for this semester are carried
    # forward as hard constraints in the new proposal.
    inherited_locks, carry_errors, source_draft_id = load_inherited_locks(
        db, body.semester
    )

    # Inherited locks become hard constraints for OTHER courses too - we
    # merge their (instructor, slot) and (room, slot) pairs into the
    # committed maps so no other course tries to use them. This is identical
    # to how approved-proposal slots are treated.
    for lock in inherited_locks:
        instructor_committed.setdefault(lock["instructor_id"], set()).add(lock["slot_id"])
        if lock.get("room_id"):
            room_committed.setdefault(lock["room_id"], set()).add(lock["slot_id"])

    # Step 3 - validate
    validation_errors = validate_availability(instructors, availability, course_instances)

    # Step 4 - sort
    sorted_instructors = sort_instructors(instructors, course_instances)

    # Step 5 - assign (with inherited locks pre-placed)
    assignments, assign_conflicts = assign_slots(
        sorted_instructors,
        course_instances,
        availability,
        time_slots=time_slots,
        instructor_committed=instructor_committed,
        room_committed=room_committed,
        inherited_locks=inherited_locks,
    )

    # Step 6 - gap score
    gap_score = calculate_gap_score(assignments, time_slots)

    # Step 7 - optimise (safely - never moves an instructor outside their availability)
    assignments = optimise_gaps(
        assignments,
        time_slots,
        availability,
        instructor_committed=instructor_committed,
        room_committed=room_committed,
    )

    # Step 8 - detect conflicts
    conflicts = detect_conflicts(assignments)
    conflicts.extend(assign_conflicts)

    # Phase 3: surface any locks that couldn't be carried forward (deleted
    # course, deactivated instructor, deleted room). These show up in the
    # new proposal as `lock_carried_invalid` conflict rows so the admin
    # sees exactly which previously-locked sessions need re-attention.
    for err in carry_errors:
        conflicts.append({
            "conflict_type": "lock_carried_invalid",
            "course_instance_id": err.get("course_instance_id"),
            "instructor_id": err.get("instructor_id"),
            "slot_id": err.get("slot_id"),
            "details": err.get("details"),
        })

    # Step 9 - save
    notes = body.notes
    if section_label:
        notes = f"[{section_label}] {notes}".strip()
    if body.simulation:
        notes = f"[SIMULATION] {notes}".strip()

    proposal_id = save_proposal(
        db=db,
        assignments=assignments,
        conflicts=conflicts,
        semester=body.semester,
        created_by=admin.id,
        notes=notes,
    )

    return {
        "proposal_id": proposal_id,
        "assignments_count": len(assignments),
        "conflicts_count": len(conflicts),
        "gap_score": gap_score,
        "conflicts": conflicts,
        "validation_errors": validation_errors,
        "section_label": section_label,
        # Phase 3: inheritance summary for the frontend to show admins
        # exactly what carried over and what didn't.
        "inherited_locks_count": len(inherited_locks),
        "inherited_locks_invalid_count": len(carry_errors),
        "inherited_from_proposal_id": source_draft_id,
    }