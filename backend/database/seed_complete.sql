-- ============================================================
-- seed_complete.sql — Full test dataset for demo
-- ============================================================

-- ─── USERS ───────────────────────────────────────────────────────────────────
INSERT INTO users (email, password_hash, role, is_active, created_at) VALUES
  ('admin@test.com',      '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iUTu', 'ADMIN',      true, NOW()),
  ('fulltime@test.com',   '$2b$12$R4mEQE1b2N/4FcsbmNUlfO4cApA2cniBiYptAPZcXOUBoLRQ4YM2u', 'INSTRUCTOR', true, NOW()),
  ('parttime@test.com',   '$2b$12$R4mEQE1b2N/4FcsbmNUlfO4cApA2cniBiYptAPZcXOUBoLRQ4YM2u', 'INSTRUCTOR', true, NOW())
ON CONFLICT (email) DO NOTHING;

-- ─── ROOMS ───────────────────────────────────────────────────────────────────
INSERT INTO rooms (room_name, capacity, room_type) VALUES
  ('A101', 40, 'lecture'),
  ('A102', 40, 'lecture'),
  ('B201', 30, 'lab')
ON CONFLICT (room_name) DO NOTHING;

-- ─── SECTIONS ────────────────────────────────────────────────────────────────
INSERT INTO sections (year_level, language, group_label, default_room_id) VALUES
  (4, 'ENGLISH', 'G1', (SELECT id FROM rooms WHERE room_name = 'A101')),
  (4, 'FRENCH',  'G2', (SELECT id FROM rooms WHERE room_name = 'A102'));

-- ─── SUBJECTS ────────────────────────────────────────────────────────────────
INSERT INTO subjects (code, name, credits, sessions_per_week) VALUES
  ('IN410', 'Computer Networks',       3.0, 2.0),
  ('IN440', 'Operating Systems',       3.0, 2.0),
  ('IN411', 'Software Engineering',    3.0, 2.0),
  ('IN444', 'Database Systems',        3.0, 2.0),
  ('IN441', 'Artificial Intelligence', 3.0, 2.0)
ON CONFLICT (code) DO NOTHING;

-- ─── INSTRUCTORS ─────────────────────────────────────────────────────────────
INSERT INTO instructors (user_id, name, type)
SELECT id, 'Dr. Full Time', 'FULL_TIME'
FROM users WHERE email = 'fulltime@test.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO instructors (user_id, name, type)
SELECT id, 'Dr. Part Time', 'PART_TIME'
FROM users WHERE email = 'parttime@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- ─── COURSE INSTANCES ────────────────────────────────────────────────────────
-- Full-time instructor: 4 course instances
INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN410'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  '2024-2', 'lecture';

INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN440'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  '2024-2', 'lecture';

INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN411'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  '2024-2', 'lecture';

INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN444'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  '2024-2', 'lecture';

-- Part-time instructor: 2 course instances
INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN441'),
  (SELECT id FROM sections WHERE group_label = 'G2'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  '2024-2', 'lecture';

INSERT INTO course_instances (subject_id, section_id, instructor_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'IN444'),
  (SELECT id FROM sections WHERE group_label = 'G2'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  '2024-2', 'lecture';

-- ─── AVAILABILITY ────────────────────────────────────────────────────────────
-- Full-time instructor: 5 slots across 2 days (needs 4)
INSERT INTO availability (instructor_id, slot_id, preference, semester, status, submitted_at)
SELECT
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  ts.id,
  CASE WHEN ts.slot_num <= 2 THEN 'PREFERRED' ELSE 'AVAILABLE' END,
  '2024-2', 'pending', NOW()
FROM time_slots ts
WHERE ts.day = 'Monday' AND ts.slot_num IN (1, 2, 3)
ON CONFLICT (instructor_id, slot_id, semester) DO NOTHING;

INSERT INTO availability (instructor_id, slot_id, preference, semester, status, submitted_at)
SELECT
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'fulltime@test.com')),
  ts.id,
  'AVAILABLE',
  '2024-2', 'pending', NOW()
FROM time_slots ts
WHERE ts.day = 'Tuesday' AND ts.slot_num IN (1, 2)
ON CONFLICT (instructor_id, slot_id, semester) DO NOTHING;

-- Part-time instructor: 3 slots (needs 2)
INSERT INTO availability (instructor_id, slot_id, preference, semester, status, submitted_at)
SELECT
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  ts.id,
  CASE WHEN ts.slot_num = 1 THEN 'PREFERRED' ELSE 'AVAILABLE' END,
  '2024-2', 'pending', NOW()
FROM time_slots ts
WHERE ts.day = 'Wednesday' AND ts.slot_num IN (1, 2, 3)
ON CONFLICT (instructor_id, slot_id, semester) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
SELECT 'users'            AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'instructors',       COUNT(*) FROM instructors
UNION ALL
SELECT 'rooms',             COUNT(*) FROM rooms
UNION ALL
SELECT 'subjects',          COUNT(*) FROM subjects
UNION ALL
SELECT 'sections',          COUNT(*) FROM sections
UNION ALL
SELECT 'course_instances',  COUNT(*) FROM course_instances
UNION ALL
SELECT 'availability',      COUNT(*) FROM availability
UNION ALL
SELECT 'time_slots',        COUNT(*) FROM time_slots;