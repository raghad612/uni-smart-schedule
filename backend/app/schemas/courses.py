from pydantic import BaseModel
from typing import Optional

class CourseInstanceCreate(BaseModel):
    subject_id: int
    section_id: int
    instructor_id: int
    parallel_group_id: Optional[int] = None
    semester: str
    session_type: str = "lecture"

class CourseInstanceUpdate(BaseModel):
    instructor_id: Optional[int] = None
    parallel_group_id: Optional[int] = None
    session_type: Optional[str] = None

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