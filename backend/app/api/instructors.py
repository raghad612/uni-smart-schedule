from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import require_admin, get_current_user
from app.models.instructor import Instructor
from app.models.user import User
from app.models.course_instance import CourseInstance
from app.schemas.instructors import InstructorCreate, InstructorUpdate, InstructorResponse
from app.services.scheduling_engine import compute_required_sessions
from typing import List, Optional

router = APIRouter()


def _attach_required_sessions(db: Session, instructors: list, period: Optional[str]):
    """
    Computes and attaches `required_sessions` (derived from the courses each
    instructor teaches in the given period) onto each Instructor ORM object,
    so InstructorResponse can serialize it.

    period: "1" or "2" (matches course_instances.semester). If not provided,
    required_sessions is left as None.
    """
    if not period:
        for instructor in instructors:
            instructor.required_sessions = None
        return

    course_instances = db.query(CourseInstance).filter(
        CourseInstance.semester == period
    ).all()
    required_map = compute_required_sessions(course_instances)

    for instructor in instructors:
        instructor.required_sessions = required_map.get(instructor.id, 0)


@router.get("/", response_model=List[InstructorResponse])
def list_instructors(
    period: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(Instructor).join(User, Instructor.user_id == User.id)
    if not include_inactive:
        query = query.filter(Instructor.is_active == True)
    instructors = query.all()
    _attach_required_sessions(db, instructors, period)
    return instructors

@router.post("/", response_model=InstructorResponse, status_code=201)
def create_instructor(
    payload: InstructorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        existing = db.query(Instructor).filter(Instructor.user_id == payload.user_id).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"User account is already linked to instructor '{existing.name}'. Each user can only be linked to one instructor profile."
            )
    instructor = Instructor(**payload.model_dump())
    db.add(instructor)
    db.commit()
    db.refresh(instructor)
    instructor.required_sessions = None
    return instructor

@router.get("/me", response_model=InstructorResponse)
def get_my_instructor_profile(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    instructor = db.query(Instructor).filter(Instructor.user_id == current_user.id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile not found")
    _attach_required_sessions(db, [instructor], period)
    return instructor

@router.get("/{instructor_id}", response_model=InstructorResponse)
def get_instructor(
    instructor_id: int,
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    if current_user.role.value == "INSTRUCTOR" and current_user.id != instructor.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    _attach_required_sessions(db, [instructor], period)
    return instructor

@router.put("/{instructor_id}", response_model=InstructorResponse)
def update_instructor(
    instructor_id: int,
    payload: InstructorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(instructor, field, value)
    db.commit()
    db.refresh(instructor)
    instructor.required_sessions = None
    return instructor

@router.delete("/{instructor_id}", status_code=204)
def deactivate_instructor(
    instructor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")

    instructor.is_active = False

    if instructor.user_id:
        user = db.query(User).filter(User.id == instructor.user_id).first()
        if user:
            user.is_active = False

    db.commit()