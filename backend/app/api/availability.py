from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import require_admin, require_instructor
from app.models.availability import Availability
from app.models.instructor import Instructor
from app.models.user import User
from app.schemas.availability import (
    AvailabilitySubmit,
    AvailabilityResponse,
    AvailabilityBulkSubmit,
)

router = APIRouter()

ALLOWED_PREFERENCES = {"PREFERRED", "AVAILABLE", "BUSY"}


@router.post("/", response_model=list[AvailabilityResponse], status_code=201)
def submit_availability(
    payload: AvailabilitySubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """
    Legacy single-preference submission.
    Replaces all rows for (instructor, semester, preference) with the supplied slot_ids.
    Kept for backward compatibility. New clients should use PUT /availability/.
    """
    instructor = db.query(Instructor).filter(Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")

    try:
        db.query(Availability).filter(
            Availability.instructor_id == instructor.id,
            Availability.semester == payload.semester,
            Availability.preference == payload.preference,
        ).delete(synchronize_session=False)

        for slot_id in payload.slot_ids:
            db.add(Availability(
                instructor_id=instructor.id,
                slot_id=slot_id,
                preference=payload.preference,
                semester=payload.semester,
            ))

        db.commit()
    except Exception:
        db.rollback()
        raise

    return db.query(Availability).filter(
        Availability.instructor_id == instructor.id,
        Availability.semester == payload.semester,
    ).all()


@router.put("/", response_model=list[AvailabilityResponse])
def replace_availability(
    payload: AvailabilityBulkSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """
    Replace-on-submit: atomically clear ALL availability rows for
    (instructor, semester) and insert the supplied entries.

    This is the correct semantics for "instructor saves their grid":
    one submission = one source of truth for that semester.
    """
    instructor = db.query(Instructor).filter(Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")

    # Validate preferences before any DB work
    for entry in payload.entries:
        if entry.preference not in ALLOWED_PREFERENCES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid preference '{entry.preference}'. Allowed: {sorted(ALLOWED_PREFERENCES)}",
            )

    # Reject duplicate slot_ids in one submission (would silently overwrite)
    seen_slots = set()
    for entry in payload.entries:
        if entry.slot_id in seen_slots:
            raise HTTPException(
                status_code=422,
                detail=f"Duplicate slot_id {entry.slot_id} in submission",
            )
        seen_slots.add(entry.slot_id)

    try:
        db.query(Availability).filter(
            Availability.instructor_id == instructor.id,
            Availability.semester == payload.semester,
        ).delete(synchronize_session=False)

        for entry in payload.entries:
            db.add(Availability(
                instructor_id=instructor.id,
                slot_id=entry.slot_id,
                preference=entry.preference,
                semester=payload.semester,
            ))

        db.commit()
    except Exception:
        db.rollback()
        raise

    return db.query(Availability).filter(
        Availability.instructor_id == instructor.id,
        Availability.semester == payload.semester,
    ).all()


@router.get("/me", response_model=List[AvailabilityResponse])
def get_my_availability(
    semester: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    instructor = db.query(Instructor).filter(Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")

    query = db.query(Availability).filter(Availability.instructor_id == instructor.id)
    if semester:
        query = query.filter(Availability.semester == semester)
    return query.all()


@router.get("/{instructor_id}", response_model=List[AvailabilityResponse])
def get_instructor_availability(
    instructor_id: int,
    semester: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Admin view of one instructor's availability.
    If `semester` is supplied, only rows for that semester are returned.
    Without it, returns all rows (legacy behavior, kept for any older callers).
    """
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")

    query = db.query(Availability).filter(Availability.instructor_id == instructor_id)
    if semester:
        query = query.filter(Availability.semester == semester)
    return query.all()