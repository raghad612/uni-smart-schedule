from sqlalchemy import ForeignKey, Enum as SAEnum
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

    proposal = relationship("ScheduleProposal", backref="assignments")
    course_instance = relationship("CourseInstance", backref="assignments")
    slot = relationship("TimeSlot", backref="assignments")
    room = relationship("Room", backref="assignments")