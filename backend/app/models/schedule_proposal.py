from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, String, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import ProposalStatus


class ScheduleProposal(Base):
    __tablename__ = "schedule_proposals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    semester: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[ProposalStatus] = mapped_column(SAEnum(ProposalStatus), default=ProposalStatus.draft, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    creator = relationship("User", backref="proposals")