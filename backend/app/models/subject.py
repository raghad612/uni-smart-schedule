from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    credits: Mapped[float] = mapped_column(Float, nullable=False)
    sessions_per_week: Mapped[float] = mapped_column(Float, nullable=False)