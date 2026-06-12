-- ─── ROOMS ───────────────────────────────────────────────────────────────────
INSERT INTO rooms (room_name, capacity, room_type) VALUES
  ('A101', 40, 'lecture'),
  ('B202', 30, 'lab')
ON CONFLICT DO NOTHING;

-- ─── SECTIONS ────────────────────────────────────────────────────────────────
INSERT INTO sections (year_level, language, group_label, default_room_id) VALUES
  (1, 'ENGLISH', 'G1', (SELECT id FROM rooms WHERE room_name = 'A101')),
  (1, 'FRENCH',  'G2', (SELECT id FROM rooms WHERE room_name = 'B202'))
ON CONFLICT DO NOTHING;

-- ─── SUBJECTS ────────────────────────────────────────────────────────────────
INSERT INTO subjects (code, name, credits, sessions_per_week) VALUES
  ('CS101', 'Introduction to Programming', 3.0, 2.0),
  ('CS102', 'Data Structures',             3.0, 2.0)
ON CONFLICT DO NOTHING;

-- ─── UPDATE EXISTING FULL-TIME INSTRUCTOR ────────────────────────────────────
UPDATE instructors
SET type = 'FULL_TIME'
WHERE user_id = 5;

-- ─── PART-TIME INSTRUCTOR ────────────────────────────────────────────────────
INSERT INTO users (email, password_hash, role, is_active, created_at) VALUES
  ('parttime@test.com', '$2b$12$KIXvWmFakeHashForSeedDataOnly1234567890abcde', 'INSTRUCTOR', true, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO instructors (user_id, name, type)
SELECT id, 'Dr. Part Timer', 'PART_TIME'
FROM users WHERE email = 'parttime@test.com'
ON CONFLICT DO NOTHING;

-- ─── COURSE INSTANCES ────────────────────────────────────────────────────────
-- 2 instances for full-time instructor
INSERT INTO course_instances (subject_id, section_id, instructor_id, parallel_group_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'CS101'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = 5),
  NULL, '2024-2', 'lecture'
ON CONFLICT DO NOTHING;

INSERT INTO course_instances (subject_id, section_id, instructor_id, parallel_group_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'CS101'),
  (SELECT id FROM sections WHERE group_label = 'G1'),
  (SELECT id FROM instructors WHERE user_id = 5),
  NULL, '2024-2', 'lecture'
ON CONFLICT DO NOTHING;

-- 2 instances for part-time instructor
INSERT INTO course_instances (subject_id, section_id, instructor_id, parallel_group_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'CS102'),
  (SELECT id FROM sections WHERE group_label = 'G2'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  NULL, '2024-2', 'lecture'
ON CONFLICT DO NOTHING;

INSERT INTO course_instances (subject_id, section_id, instructor_id, parallel_group_id, semester, session_type)
SELECT
  (SELECT id FROM subjects WHERE code = 'CS102'),
  (SELECT id FROM sections WHERE group_label = 'G2'),
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  NULL, '2024-2', 'lecture'
ON CONFLICT DO NOTHING;

-- ─── AVAILABILITY ─────────────────────────────────────────────────────────────
-- Full-time instructor: 4 slots (needs 3)
INSERT INTO availability (instructor_id, slot_id, preference, semester, status, submitted_at)
SELECT
  (SELECT id FROM instructors WHERE user_id = 5),
  ts.id,
  CASE WHEN ts.slot_num <= 2 THEN 'PREFERRED'::availabilitypreference ELSE 'AVAILABLE'::availabilitypreference END,
  '2024-2', 'pending', NOW()
FROM time_slots ts
WHERE ts.day = 'Monday' AND ts.slot_num IN (1, 2, 3, 4)
ON CONFLICT DO NOTHING;

-- Part-time instructor: 3 slots (needs 2)
INSERT INTO availability (instructor_id, slot_id, preference, semester, status, submitted_at)
SELECT
  (SELECT id FROM instructors WHERE user_id = (SELECT id FROM users WHERE email = 'parttime@test.com')),
  ts.id,
  CASE WHEN ts.slot_num = 1 THEN 'PREFERRED'::availabilitypreference ELSE 'AVAILABLE'::availabilitypreference END,
  '2024-2', 'pending', NOW()
FROM time_slots ts
WHERE ts.day = 'Tuesday' AND ts.slot_num IN (1, 2, 3)
ON CONFLICT DO NOTHING;