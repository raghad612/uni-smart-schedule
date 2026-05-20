from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.time_slot import TimeSlot
from app.services.scheduling_engine import (
    load_data,
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


@router.post("/run")
def run_scheduling_engine(
    body: RunEngineRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Step 1 — load
    instructors, course_instances, availability = load_data(db, body.semester)

    if not course_instances:
        raise HTTPException(
            status_code=400,
            detail=f"No course instances found for semester '{body.semester}'"
        )

    # Step 2 — validate
    validation_errors = validate_availability(instructors, availability)
    if validation_errors:
        return {
            "proposal_id": None,
            "assignments_count": 0,
            "conflicts_count": 0,
            "conflicts": [],
            "validation_errors": validation_errors,
        }

    # Step 3 — sort
    sorted_instructors = sort_instructors(instructors)

    # Step 4 — assign
    assignments, assign_conflicts = assign_slots(
        sorted_instructors, course_instances, availability
    )

    # Step 5 — gap score
    time_slots = db.query(TimeSlot).all()
    gap_score = calculate_gap_score(assignments, time_slots)

    # Step 6 — optimise
    assignments = optimise_gaps(assignments, time_slots)

    # Step 7 — detect conflicts
    conflicts = detect_conflicts(assignments)
    conflicts.extend(assign_conflicts)

    # Step 8 — save
    notes = body.notes
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
        "validation_errors": [],
    }