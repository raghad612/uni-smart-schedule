from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ConflictLog(Base):
    __tablename__ = "conflict_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("schedule_proposals.id"), nullable=False)
    slot_id: Mapped[int | None] = mapped_column(ForeignKey("time_slots.id"), nullable=True)
    conflict_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resolution: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    proposal = relationship("ScheduleProposal", backref="conflicts")
    slot = relationship("TimeSlot", backref="conflicts")
    resolver = relationship("User", backref="resolved_conflicts")