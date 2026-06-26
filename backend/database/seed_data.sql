-- ============================================================
-- uni-smart-schedule  —  Full Test Seed Data
-- Run with:
--   docker exec -i uni-smart-schedule-db-1 psql -U schedule_user -d smart_schedule -f /dev/stdin < seed_data.sql
-- ============================================================
-- SAFE to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING
-- or explicit ID checks.
-- ============================================================

-- ============================================================
-- SECTION 1 — New subjects needed for full coverage
-- ============================================================
-- sessions_per_week = 0.5  →  runs every other week (WEEK_A or WEEK_B)
-- sessions_per_week = 1.0  →  runs every week (ALWAYS)
-- sessions_per_week = 2.0  →  two instances per week (2 rows in course_instances)

INSERT INTO subjects (code, name, credits, sessions_per_week) VALUES
  ('CS201', 'Algorithms and Complexity',    3,   2),   -- id auto
  ('CS202', 'Computer Architecture',        3,   2),
  ('CS301', 'Networks and Security',        3,   2),
  ('CS302', 'Web Development',              3,   2),
  ('CS401', 'Machine Learning',             3,   2),
  ('CS402', 'Cloud Computing',              3,   2),
  ('MA101', 'Discrete Mathematics',         3,   2),
  ('MA201', 'Probability and Statistics',   3,   2),
  -- 0.5 credit subjects  →  every-other-week sessions (WEEK_A / WEEK_B)
  ('WS101', 'Research Methodology',         0.5, 0.5),
  ('WS201', 'Technical Writing',            0.5, 0.5),
  ('WS301', 'Professional Ethics',          0.5, 0.5),
  ('WS401', 'Project Management',           0.5, 0.5)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SECTION 2 — Course instances for semester 2024-2
-- ============================================================
-- Layout per section:
--   Year 1  English (section_id=1)   Year 1 French (section_id=2)
--   Year 2  English (section_id=9)   Year 2 French (section_id=10)
--   Year 3  English (section_id=11)  Year 3 French (section_id=5)
--   Year 4  English (section_id=13)  Year 4 French (section_id=7)
--
-- sessions_per_week=2  →  insert 2 rows (engine assigns 2 different slots)
-- sessions_per_week=0.5 → insert 1 row, engine sets week_rotation=WEEK_A or WEEK_B
--
-- Instructor spread across sections (for cross-section blocking test):
--   Dr. Test Instructor (id=2)   FULL_TIME  required=4  → Year1E + Year3F + Year4F
--   Part Time           (id=3)   PART_TIME  required=2  → Year1F
--   Dr. Full Time       (id=4)   FULL_TIME  required=4  → Year2E + Year2F
--   dr raghad           (id=6)   FULL_TIME  required=4  → Year3F + Year3E
--   dr siham            (id=7)   PART_TIME  required=3  → Year1F + Year2F
--   Dr. Sarah Malik     (id=10)  FULL_TIME  required=5  → Year1E + Year2E + Year3E
--   Dr. Omar Haddad     (id=11)  FULL_TIME  required=6  → Year2E + Year3E + Year4E
--   Dr. Lina Nassar     (id=13)  PART_TIME  required=3  → Year4E + Year4F
--   Dr nana             (id=18)  FULL_TIME  required=5  → Year1F + Year2F + Year4F
--   Dr fadllah          (id=19)  FULL_TIME  required=9  → spread across Year2+Year3+Year4

-- ----------------------------------------------------------------
-- YEAR 1 ENGLISH  (section_id=1)
-- Already has: id=2 (CS101, instructor=2)
-- Need: more subjects so we can test 4+ sessions for Dr.Test + Dr.Sarah
-- ----------------------------------------------------------------
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 2, '2024-2' FROM subjects s WHERE s.code = 'CS101'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=1 AND subject_id=s.id AND instructor_id=2 AND semester='2024-2');

-- CS101 session 2 (sessions_per_week=2 means we need a second row)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 2, '2024-2' FROM subjects s WHERE s.code = 'CS101'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=1 AND subject_id=s.id AND instructor_id=2 AND semester='2024-2') < 2;

-- MA101 Discrete Math  → Dr. Sarah Malik (id=10)  session 1
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'MA101'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=1 AND subject_id=s.id AND semester='2024-2');

-- MA101 session 2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'MA101'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=1 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS202 Computer Architecture  → Dr. Full Time (id=4)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=1 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=1 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS101 Research Methodology (0.5 credit, every-other-week)  → Dr. Sarah Malik
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 1, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'WS101'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=1 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 1 FRENCH  (section_id=2)
-- Already has: id=9,10 (CS102×2, instructor=3), id=20 (IN410, instructor=7)
-- ----------------------------------------------------------------
-- CS201 Algorithms  → dr siham (id=7)  session 1
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 2, s.id, 7, '2024-2' FROM subjects s WHERE s.code = 'CS201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=2 AND subject_id=s.id AND semester='2024-2');

-- MA101  → Dr nana (id=18)  session 1
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 2, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'MA101'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=2 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 2, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'MA101'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=2 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS101 Research Methodology (0.5 credit)  → Part Time (id=3)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 2, s.id, 3, '2024-2' FROM subjects s WHERE s.code = 'WS101'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=2 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 2 ENGLISH  (section_id=9)
-- ----------------------------------------------------------------
-- CS201 Algorithms  → Dr. Omar Haddad (id=11)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS201'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS202 Computer Architecture  → Dr. Sarah Malik (id=10)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2') < 2;

-- MA201 Probability  → Dr. Full Time (id=4)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'MA201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'MA201'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS201 Technical Writing (0.5 credit)  → Dr. Sarah Malik (id=10)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 9, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'WS201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=9 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 2 FRENCH  (section_id=10)
-- ----------------------------------------------------------------
-- CS201 Algorithms  → Dr fadllah (id=19)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS201'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS202 Computer Architecture  → Dr. Full Time (id=4)  session 1+2
-- NOTE: Dr. Full Time also teaches CS202 in Year1E and MA201 in Year2E
-- This is intentional — tests cross-section blocking
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 4, '2024-2' FROM subjects s WHERE s.code = 'CS202'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2') < 2;

-- MA201  → Dr nana (id=18)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'MA201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'MA201'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS201 Technical Writing (0.5 credit)  → dr siham (id=7)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 10, s.id, 7, '2024-2' FROM subjects s WHERE s.code = 'WS201'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=10 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 3 ENGLISH  (section_id=11)
-- ----------------------------------------------------------------
-- CS301 Networks and Security  → Dr. Omar Haddad (id=11)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS301'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS301'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2') < 2;

-- IN444 Database Systems  → dr raghad (id=6)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 6, '2024-2' FROM subjects s WHERE s.code = 'IN444'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 6, '2024-2' FROM subjects s WHERE s.code = 'IN444'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS302 Web Development  → Dr. Sarah Malik (id=10)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'CS302'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'CS302'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS301 Professional Ethics (0.5 credit)  → Dr. Omar Haddad (id=11)
-- Omar also teaches CS301 in Year3E — same section, different subject. Valid.
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 11, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'WS301'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=11 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 3 FRENCH  (section_id=5)
-- Already has: id=11 (CS101, instructor=2), id=19 (IN444, instructor=6)
-- ----------------------------------------------------------------
-- CS301 Networks and Security  → Dr fadllah (id=19)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 5, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS301'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=5 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 5, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS301'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=5 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS302 Web Development  → dr raghad (id=6)  session 1+2
-- NOTE: raghad also teaches IN444 in Year3E — cross-section blocking test
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 5, s.id, 6, '2024-2' FROM subjects s WHERE s.code = 'CS302'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=5 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 5, s.id, 6, '2024-2' FROM subjects s WHERE s.code = 'CS302'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=5 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS301 Professional Ethics (0.5 credit)  → Dr. Test Instructor (id=2)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 5, s.id, 2, '2024-2' FROM subjects s WHERE s.code = 'WS301'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=5 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 4 ENGLISH  (section_id=13)
-- ----------------------------------------------------------------
-- CS401 Machine Learning  → Dr. Omar Haddad (id=11)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS401'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 11, '2024-2' FROM subjects s WHERE s.code = 'CS401'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS402 Cloud Computing  → Dr fadllah (id=19)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS402'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS402'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2') < 2;

-- IN441 Artificial Intelligence  → Dr. Sarah Malik (id=10)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'IN441'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 10, '2024-2' FROM subjects s WHERE s.code = 'IN441'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2') < 2;

-- Dr. Lina Nassar (PART_TIME id=13) teaches in Year4E
-- IN411 Software Engineering  → Dr. Lina Nassar  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 13, '2024-2' FROM subjects s WHERE s.code = 'IN411'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 13, '2024-2' FROM subjects s WHERE s.code = 'IN411'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS401 Project Management (0.5 credit)  → Dr. Lina Nassar (id=13)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 13, s.id, 13, '2024-2' FROM subjects s WHERE s.code = 'WS401'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=13 AND subject_id=s.id AND semester='2024-2');

-- ----------------------------------------------------------------
-- YEAR 4 FRENCH  (section_id=7)
-- Already has: id=18 (IN410, instructor=2)
-- ----------------------------------------------------------------
-- CS401 Machine Learning  → Dr fadllah (id=19)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS401'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 19, '2024-2' FROM subjects s WHERE s.code = 'CS401'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2') < 2;

-- CS402 Cloud Computing  → Dr nana (id=18)  session 1+2
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'CS402'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 18, '2024-2' FROM subjects s WHERE s.code = 'CS402'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2') < 2;

-- Dr. Lina Nassar (PART_TIME id=13) also teaches Year4F
-- IN411 Software Engineering  → Dr. Lina Nassar
-- NOTE: Lina teaches IN411 in BOTH Year4E and Year4F — cross-section blocking test
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 13, '2024-2' FROM subjects s WHERE s.code = 'IN411'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2');

INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 13, '2024-2' FROM subjects s WHERE s.code = 'IN411'
  AND (SELECT COUNT(*) FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2') < 2;

-- WS401 Project Management (0.5 credit)  → Dr. Test Instructor (id=2)
INSERT INTO course_instances (section_id, subject_id, instructor_id, semester)
SELECT 7, s.id, 2, '2024-2' FROM subjects s WHERE s.code = 'WS401'
  AND NOT EXISTS (SELECT 1 FROM course_instances WHERE section_id=7 AND subject_id=s.id AND semester='2024-2');

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT '=== SUBJECTS ===' as info;
SELECT id, code, name, credits, sessions_per_week FROM subjects ORDER BY id;

SELECT '=== COURSE INSTANCES PER SECTION (2024-2) ===' as info;
SELECT
  sec.group_label,
  sub.code,
  sub.name,
  sub.sessions_per_week,
  inst.name as instructor,
  inst.type as instructor_type,
  COUNT(ci.id) as rows_inserted
FROM course_instances ci
JOIN sections sec ON ci.section_id = sec.id
JOIN subjects sub ON ci.subject_id = sub.id
JOIN instructors inst ON ci.instructor_id = inst.id
WHERE ci.semester = '2024-2'
GROUP BY sec.group_label, sub.code, sub.name, sub.sessions_per_week, inst.name, inst.type
ORDER BY sec.year_level, sec.language, sub.code;

SELECT '=== INSTRUCTOR LOAD (2024-2) ===' as info;
SELECT
  inst.name,
  inst.type,
  CEIL(SUM(sub.sessions_per_week))::int as required_sessions,
  COUNT(ci.id) as course_instance_rows,
  STRING_AGG(DISTINCT sec.group_label, ', ' ORDER BY sec.group_label) as sections
FROM instructors inst
JOIN course_instances ci ON ci.instructor_id = inst.id
JOIN sections sec ON ci.section_id = sec.id
JOIN subjects sub ON ci.subject_id = sub.id
WHERE ci.semester = '2024-2'
GROUP BY inst.id, inst.name, inst.type
ORDER BY inst.type, required_sessions DESC;