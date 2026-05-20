from pydantic import BaseModel
from typing import Optional

class SectionCreate(BaseModel):
    year_level: int
    language: str
    group_label: str
    default_room_id: Optional[int] = None

class SectionUpdate(BaseModel):
    year_level: Optional[int] = None
    language: Optional[str] = None
    group_label: Optional[str] = None
    default_room_id: Optional[int] = None

class SectionResponse(BaseModel):
    id: int
    year_level: int
    language: str
    group_label: str
    default_room_id: Optional[int] = None

    class Config:
        from_attributes = True