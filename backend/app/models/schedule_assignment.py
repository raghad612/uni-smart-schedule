from datetime import datetime
from sqlalchemy import ForeignKey, Enum as SAEnum, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import WeekRotation, AssignmentStatus


class ScheduleAssignment(Base):
    __tablename__ = "schedule_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("schedule_proposals.id"), nullable=False)
    course_instance_id: Mapped[int] = mapped_column(ForeignKey("course_instances.id"), nullable=False)
    slot_id: Mapped[int] = mapped_column(ForeignKey("time_slots.id"), nullable=False)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    week_rotation: Mapped[WeekRotation] = mapped_column(SAEnum(WeekRotation), default=WeekRotation.ALWAYS, nullable=False)
    status: Mapped[AssignmentStatus] = mapped_column(SAEnum(AssignmentStatus), default=AssignmentStatus.proposed, nullable=False)

    # Lock semantics:
    # - `locked=True` protects this assignment from being moved by the gap
    #   optimizer, from being moved by the admin without explicit unlock, and
    #   carries the assignment forward when the engine generates a new
    #   proposal for the same semester (inheritance from most recent draft).
    # - `locked_by` / `locked_at` are audit-only; the behavior key is `locked`.
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false', default=False)
    locked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    proposal = relationship("ScheduleProposal", backref="assignments")
    course_instance = relationship("CourseInstance", backref="assignments")
    slot = relationship("TimeSlot", backref="assignments")
    room = relationship("Room", backref="assignments")