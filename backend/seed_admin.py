from passlib.context import CryptContext
import subprocess

ctx = CryptContext(schemes=['bcrypt'])
h = ctx.hash('admin123')

sql = "INSERT INTO users (email, password_hash, role, is_active, created_at) VALUES ('admin@university.edu', '" + h + "', 'ADMIN', true, NOW());"

result = subprocess.run(
    ['docker', 'exec', '-i', 'uni-smart-schedule-db-1', 'psql', '-U', 'schedule_user', '-d', 'smart_schedule', '-c', sql],
    capture_output=True, text=True
)
print(result.stdout)
print(result.stderr)
