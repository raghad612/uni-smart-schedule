from sqlalchemy import String, Integer, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import InstructorType

class Instructor(Base):
    __tablename__ = "instructors"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[InstructorType] = mapped_column(SAEnum(InstructorType), nullable=False)
    max_sessions_per_day: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    required_sessions: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user = relationship("User", backref="instructor")