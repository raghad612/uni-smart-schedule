from pydantic import BaseModel
from typing import Optional


class InstructorCreate(BaseModel):
    name: str
    type: str
    required_sessions: int
    max_sessions_per_day: int
    user_id: Optional[int] = None


class InstructorUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    required_sessions: Optional[int] = None
    max_sessions_per_day: Optional[int] = None
    user_id: Optional[int] = None


class InstructorResponse(BaseModel):
    id: int
    name: str
    type: str
    required_sessions: int
    max_sessions_per_day: int
    user_id: Optional[int] = None

    class Config:
        from_attributes = True