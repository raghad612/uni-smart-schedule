from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.enums import SessionType


class CourseInstance(Base):
    __tablename__ = "course_instances"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id"), nullable=False)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("instructors.id"), nullable=False)
    parallel_group_id: Mapped[int | None] = mapped_column(ForeignKey("parallel_groups.id"), nullable=True)
    semester: Mapped[str] = mapped_column(String(20), nullable=False)
    session_type: Mapped[SessionType] = mapped_column(SAEnum(SessionType), nullable=False)

    subject = relationship("Subject", backref="course_instances")
    section = relationship("Section", backref="course_instances")
    instructor = relationship("Instructor", backref="course_instances")
    parallel_group = relationship("ParallelGroup", backref="course_instances")
