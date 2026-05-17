from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.section import Section
from app.models.room import Room
from app.models.user import User
from app.schemas.sections import SectionCreate, SectionUpdate, SectionResponse

router = APIRouter()


@router.get("/", response_model=List[SectionResponse])
def list_sections(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return db.query(Section).all()


@router.post("/", response_model=SectionResponse, status_code=201)
def create_section(
    payload: SectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if payload.default_room_id:
        room = db.query(Room).filter(Room.id == payload.default_room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
    section = Section(**payload.model_dump())
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.get("/{section_id}", response_model=SectionResponse)
def get_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.put("/{section_id}", response_model=SectionResponse)
def update_section(
    section_id: int,
    payload: SectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if payload.default_room_id:
        room = db.query(Room).filter(Room.id == payload.default_room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(section, field, value)
    db.commit()
    db.refresh(section)
    return section