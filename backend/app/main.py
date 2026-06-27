from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import scheduling
from app.api import auth
from app.api import proposals
from app.api import instructors
from app.api import availability
from app.api import admin
from app.api import rooms
from app.api import sections
from app.api import courses
from app.api import subjects

app = FastAPI(
    title="Smart Instructor Scheduling System",
    version="1.0.0"
)

# Parse comma-separated origins from env, stripping whitespace and ignoring blanks
allowed_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
app.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
app.include_router(sections.router, prefix="/sections", tags=["sections"])
app.include_router(courses.router, prefix="/courses", tags=["courses"])
app.include_router(subjects.router, prefix="/subjects", tags=["subjects"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
