from sqlalchemy import String, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import SectionLanguage


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    year_level: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[SectionLanguage] = mapped_column(SAEnum(SectionLanguage), nullable=False)
    group_label: Mapped[str] = mapped_column(String(50), nullable=False)
    default_room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)

    default_room = relationship("Room", backref="sections")