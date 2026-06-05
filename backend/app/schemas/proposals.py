from pydantic import BaseModel
from datetime import datetime
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
    start_time: str
    end_time: str
    instructor_name: Optional[str] = None
    instructor_id: Optional[int] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    room_name: Optional[str] = None
    model_config = {"from_attributes": True}


class ConflictResponse(BaseModel):
    id: int
    slot_id: Optional[int]
    conflict_type: str
    instructor_id: Optional[int] = None
    course_instance_id: Optional[int] = None
    details: Optional[str] = None
    resolution: Optional[str]
    resolved_by: Optional[int]
    detected_at: datetime
    # Enriched fields joined from related tables
    instructor_name: Optional[str] = None
    subject_name: Optional[str] = None
    section_label: Optional[str] = None
    slot_label: Optional[str] = None
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


class MoveAssignment(BaseModel):
    slot_id: int
    room_id: Optional[int] = None