from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.enums import UserRole

db = SessionLocal()

admin = User(
    email='admin@test.com',
    password_hash=hash_password('test123'),
    role=UserRole.ADMIN,
    is_active=True
)
instructor = User(
    email='instructor@test.com',
    password_hash=hash_password('test123'),
    role=UserRole.INSTRUCTOR,
    is_active=True
)

db.add(admin)
db.add(instructor)
db.commit()
print('Test users inserted!')
db.close()