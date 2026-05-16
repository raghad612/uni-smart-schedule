from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import require_admin, get_current_user
from app.models.instructor import Instructor
from app.models.user import User
from app.schemas.instructors import InstructorCreate, InstructorUpdate, InstructorResponse
from typing import List

router = APIRouter()

@router.get("/", response_model=List[InstructorResponse])
def list_instructors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return db.query(Instructor).all()

@router.post("/", response_model=InstructorResponse, status_code=201)
def create_instructor(
    payload: InstructorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    instructor = Instructor(**payload.model_dump())
    db.add(instructor)
    db.commit()
    db.refresh(instructor)
    return instructor

@router.get("/{instructor_id}", response_model=InstructorResponse)
def get_instructor(
    instructor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    instructor = db.query(Instructor).filter(Instructor.id == instructor_id).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    if current_user.role.value == "INSTRUCTOR" and current_user.id != instructor.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
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
    user = db.query(User).filter(User.id == instructor.user_id).first()
    if user:
        user.is_active = False
    db.commit()