INSERT INTO users (email, password_hash, role, is_active, created_at)
VALUES (
  'admin@test.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iUTu',
  'ADMIN',
  true,
  NOW()
);

INSERT INTO users (email, password_hash, role, is_active, created_at)
VALUES (
  'instructor@test.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iUTu',
  'INSTRUCTOR',
  true,
  NOW()
);