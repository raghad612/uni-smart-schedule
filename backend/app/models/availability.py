from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, String, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import AvailabilityPreference, AvailabilityStatus


class Availability(Base):
    __tablename__ = "availability"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("instructors.id"), nullable=False)
    slot_id: Mapped[int] = mapped_column(ForeignKey("time_slots.id"), nullable=False)
    preference: Mapped[AvailabilityPreference] = mapped_column(SAEnum(AvailabilityPreference), nullable=False)
    semester: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[AvailabilityStatus] = mapped_column(SAEnum(AvailabilityStatus), default=AvailabilityStatus.pending, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    instructor = relationship("Instructor", backref="availability")
    slot = relationship("TimeSlot", backref="availability")