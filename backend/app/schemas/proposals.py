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
    # Lock state - drives the amber styling + lock icon in the frontend, and
    # the optimizer-skip / move-rejection / carry-forward behavior on backend.
    locked: bool = False
    locked_by: Optional[int] = None
    locked_at: Optional[datetime] = None
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


class CreateAssignment(BaseModel):
    course_instance_id: int
    slot_id: int
    room_id: Optional[int] = None
    week_rotation: WeekRotation = WeekRotation.ALWAYS


class LockAssignment(BaseModel):
    """Toggle the lock state of an assignment. Body specifies target state
    (not action), making the endpoint idempotent: PUT { locked: true } twice
    is a no-op the second time."""
    locked: bool


class LockedSummaryResponse(BaseModel):
    """Feeds the AdminDashboard locked-sessions panel.

    Tells the admin which draft holds the locks that will carry forward on
    the next engine run, and how many there are. Returned with `locked_count=0`
    and `most_recent_draft_id=None` when nothing applies, so the frontend
    can simply not render the panel in that case.
    """
    semester: str
    most_recent_draft_id: Optional[int] = None
    most_recent_draft_created_at: Optional[datetime] = None
    locked_count: int = 0
    total_draft_count: int = 0