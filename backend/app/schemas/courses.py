from pydantic import BaseModel, field_validator
from typing import Optional


class CourseInstanceCreate(BaseModel):
    subject_id: int
    section_id: int
    instructor_id: int
    parallel_group_id: Optional[int] = None
    semester: str
    session_type: str = "lecture"

    @field_validator('semester')
    @classmethod
    def semester_must_be_period(cls, v):
        if v not in ("1", "2"):
            raise ValueError("semester must be '1' or '2'")
        return v


class CourseInstanceUpdate(BaseModel):
    subject_id: Optional[int] = None
    instructor_id: Optional[int] = None
    session_type: Optional[str] = None
    parallel_group_id: Optional[int] = None


class CourseInstanceResponse(BaseModel):
    id: int
    subject_id: int
    section_id: int
    instructor_id: int
    parallel_group_id: Optional[int] = None
    semester: str
    session_type: str

    class Config:
        from_attributes = True