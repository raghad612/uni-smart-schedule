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
    # Step 1 - load
    instructors, course_instances, availability = load_data(db, body.semester)

    # Filter to specific section if provided
    section_label = ""
    if body.section_id is not None:
        section = db.query(Section).filter(Section.id == body.section_id).first()
        if not section:
            raise HTTPException(status_code=404, detail=f"Section {body.section_id} not found")
        course_instances = [ci for ci in course_instances if ci.section_id == body.section_id]
        section_label = f"Year {section.year_level} {section.language} ({section.group_label})"

    if not course_instances:
        raise HTTPException(
            status_code=400,
            detail=f"No course instances found for semester '{body.semester}'"
            + (f" in section '{section_label}'" if section_label else "")
        )

    # Step 2 - load already-committed slots from approved proposals
    # so the engine won't reuse a slot an instructor is already teaching in
    instructor_committed, room_committed = load_committed_slots(db, body.semester)

    # Step 3 - validate (warnings only, do not halt)
    validation_errors = validate_availability(instructors, availability, course_instances)

    # Step 4 - sort
    sorted_instructors = sort_instructors(instructors)

    # Step 5 - assign (respecting committed slots)
    assignments, assign_conflicts = assign_slots(
        sorted_instructors,
        course_instances,
        availability,
        instructor_committed=instructor_committed,
        room_committed=room_committed,
    )

    # Step 6 - gap score
    time_slots = db.query(TimeSlot).all()
    gap_score = calculate_gap_score(assignments, time_slots)

    # Step 7 - optimise
    assignments = optimise_gaps(assignments, time_slots)

    # Step 8 - detect conflicts
    conflicts = detect_conflicts(assignments)
    conflicts.extend(assign_conflicts)

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
    }