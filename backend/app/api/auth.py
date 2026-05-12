from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong password")
    token = create_access_token(data={"user_id": user.id, "role": user.role.value})
    return TokenResponse(access_token=token, token_type="bearer", role=user.role.value)