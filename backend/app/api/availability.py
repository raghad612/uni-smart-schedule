from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import require_admin, require_instructor
from app.models.availability import Availability
from app.models.instructor import Instructor
from app.models.user import User
from app.schemas.availability import AvailabilitySubmit, AvailabilityResponse

router = APIRouter()

@router.post("/", response_model=list[AvailabilityResponse], status_code=201)
def submit_availability(
    payload: AvailabilitySubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_instructor)
):
    instructor = db.query(Instructor).filter(Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")

    db.query(Availability).filter(
        Availability.instructor_id == instructor.id,
        Availability.semester == payload.semester,
        Availability.preference == payload.preference
    ).delete()

    for slot_id in payload.slot_ids:
        entry = Availability(
            instructor_id=instructor.id,
            slot_id=slot_id,
            preference=payload.preference,
            semester=payload.semester
        )
        db.add(entry)

    db.commit()

    return db.query(Availability).filter(
        Availability.instructor_id == instructor.id,
        Availability.semester == payload.semester
    ).all()


@router.get("/me", response_model=List[AvailabilityResponse])
def get_my_availability(
    semester: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_instructor)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    return db.query(Availability).filter(Availability.instructor_id == instructor_id).all()