from pydantic import BaseModel
from datetime import datetime, time
from typing import Optional
from app.models.enums import ProposalStatus, AssignmentStatus, WeekRotation


class ProposalResponse(BaseModel):
    id: int
    semester: str
    status: ProposalStatus
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentResponse(BaseModel):
    id: int
    course_instance_id: int
    slot_id: int
    room_id: Optional[int]
    week_rotation: WeekRotation
    status: AssignmentStatus
    day: str
    slot_num: int
    start_time: time
    end_time: time

    model_config = {"from_attributes": True}


class ConflictResponse(BaseModel):
    id: int
    slot_id: Optional[int]
    conflict_type: str
    resolution: Optional[str]
    resolved_by: Optional[int]
    detected_at: datetime

    model_config = {"from_attributes": True}


class ProposalDetail(BaseModel):
    id: int
    semester: str
    status: ProposalStatus
    notes: Optional[str]
    created_at: datetime
    assignments: list[AssignmentResponse]
    conflicts: list[ConflictResponse]

    model_config = {"from_attributes": True}


class ResolveConflict(BaseModel):
    resolution: str