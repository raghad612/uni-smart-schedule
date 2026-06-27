from pydantic import BaseModel
from typing import List, Optional


class AvailabilitySubmit(BaseModel):
    slot_ids: List[int]
    preference: str
    semester: str


class AvailabilityResponse(BaseModel):
    id: int
    instructor_id: int
    slot_id: int
    preference: str
    semester: str
    status: Optional[str] = None

    class Config:
        from_attributes = True


class AvailabilitySlotEntry(BaseModel):
    slot_id: int
    preference: str  # 'PREFERRED' | 'AVAILABLE' | 'BUSY'


class AvailabilityBulkSubmit(BaseModel):
    semester: str
    entries: List[AvailabilitySlotEntry]