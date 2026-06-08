from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.course_instance import CourseInstance
from app.models.instructor import Instructor
from app.models.section import Section
from app.models.subject import Subject
from app.models.user import User
from app.models.schedule_assignment import ScheduleAssignment
from app.schemas.courses import CourseInstanceCreate, CourseInstanceUpdate, CourseInstanceResponse

router = APIRouter()


@router.get("/", response_model=List[CourseInstanceResponse])
def list_courses(
    semester: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(CourseInstance)
    if semester:
        # Accept either "1"/"2" directly, or extract period from "2024-2" format
        period = semester.split("-")[-1] if "-" in semester else semester
        if period in ("1", "2"):
            query = query.filter(CourseInstance.semester == period)
    return query.all()


@router.post("/", response_model=CourseInstanceResponse, status_code=201)
def create_course(
    payload: CourseInstanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if not db.query(Subject).filter(Subject.id == payload.subject_id).first():
        raise HTTPException(status_code=404, detail="Subject not found")
    if not db.query(Section).filter(Section.id == payload.section_id).first():
        raise HTTPException(status_code=404, detail="Section not found")
    if not db.query(Instructor).filter(Instructor.id == payload.instructor_id).first():
        raise HTTPException(status_code=404, detail="Instructor not found")
    course = CourseInstance(**payload.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseInstanceResponse)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    course = db.query(CourseInstance).filter(CourseInstance.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course instance not found")
    return course


@router.put("/{course_id}", response_model=CourseInstanceResponse)
def update_course(
    course_id: int,
    payload: CourseInstanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    course = db.query(CourseInstance).filter(CourseInstance.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course instance not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    db.commit()
    db.refresh(course)
    return course


@router.delete("/{course_id}", status_code=204)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    course = db.query(CourseInstance).filter(CourseInstance.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course instance not found")
    linked = db.query(ScheduleAssignment).filter(
        ScheduleAssignment.course_instance_id == course_id
    ).first()
    if linked:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a course instance that has existing schedule assignments"
        )
    db.delete(course)
    db.commit()