from sqlalchemy import Integer, String, Time, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.enums import SlotPeriod


class TimeSlot(Base):
    __tablename__ = "time_slots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    day: Mapped[str] = mapped_column(String(20), nullable=False)
    slot_num: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[SlotPeriod] = mapped_column(SAEnum(SlotPeriod), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)