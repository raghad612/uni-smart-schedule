from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.subject import Subject
from app.models.user import User
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class SubjectCreate(BaseModel):
    code: str
    name: str
    credits: float
    sessions_per_week: float


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    credits: Optional[float] = None
    sessions_per_week: Optional[float] = None


class SubjectResponse(BaseModel):
    id: int
    code: str
    name: str
    credits: float
    sessions_per_week: float

    class Config:
        from_attributes = True


@router.get("/", response_model=List[SubjectResponse])
def list_subjects(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return db.query(Subject).all()


@router.post("/", response_model=SubjectResponse, status_code=201)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    existing = db.query(Subject).filter(Subject.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=409, detail="Subject with this code already exists")
    subject = Subject(**payload.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/{subject_id}", response_model=SubjectResponse)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


@router.put("/{subject_id}", response_model=SubjectResponse)
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, field, value)
    db.commit()
    db.refresh(subject)
    return subject