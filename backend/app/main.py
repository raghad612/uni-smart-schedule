from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import scheduling
from app.api import auth
from app.api import proposals
from app.api import instructors
from app.api import availability
from app.api import admin

app = FastAPI(
    title="Smart Instructor Scheduling System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(scheduling.router, prefix="/scheduling", tags=["scheduling"])
app.include_router(proposals.router, prefix="/proposals", tags=["proposals"])
app.include_router(proposals.conflicts_router, prefix="/conflicts", tags=["conflicts"])
app.include_router(instructors.router, prefix="/instructors", tags=["instructors"])
app.include_router(availability.router, prefix="/availability", tags=["availability"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

@app.get("/health")
def health_check():
    return {"status": "ok"}