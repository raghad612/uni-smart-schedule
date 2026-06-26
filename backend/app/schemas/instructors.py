from pydantic import BaseModel
from typing import Optional


class InstructorCreate(BaseModel):
    name: str
    type: str
    user_id: Optional[int] = None


class InstructorUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    user_id: Optional[int] = None


class InstructorResponse(BaseModel):
    id: int
    name: str
    type: str
    user_id: Optional[int] = None
    required_sessions: Optional[int] = None
    is_active: bool = True

    class Config:
        from_attributes = True