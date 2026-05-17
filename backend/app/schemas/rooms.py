from pydantic import BaseModel
from typing import Optional

class RoomCreate(BaseModel):
    room_name: str
    capacity: int
    room_type: str
    description: Optional[str] = None

class RoomUpdate(BaseModel):
    room_name: Optional[str] = None
    capacity: Optional[int] = None
    room_type: Optional[str] = None
    description: Optional[str] = None

class RoomResponse(BaseModel):
    id: int
    room_name: str
    capacity: int
    room_type: str
    description: Optional[str] = None

    class Config:
        from_attributes = True