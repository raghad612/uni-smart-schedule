from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.enums import UserRole
from app.core.security import hash_password
from pydantic import BaseModel

router = APIRouter()


class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "INSTRUCTOR"


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/users/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return db.query(User).all()


@router.post("/users/", response_model=UserResponse, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    try:
        role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{payload.role}'. Must be ADMIN or INSTRUCTOR"
        )

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=409, detail="User already deactivated")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user