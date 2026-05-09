-- ============================================================
-- Smart Instructor Scheduling System — Full Database Schema
-- ============================================================

-- ENUM TYPES (must be created before the tables that use them)

CREATE TYPE user_role AS ENUM ('ADMIN', 'INSTRUCTOR');

CREATE TYPE instructor_type AS ENUM ('FULL_TIME', 'PART_TIME');

CREATE TYPE availability_preference AS ENUM ('PREFERRED', 'AVAILABLE', 'BUSY');

CREATE TYPE availability_status AS ENUM ('pending', 'used', 'ignored');

CREATE TYPE section_language AS ENUM ('ENGLISH', 'FRENCH');

CREATE TYPE proposal_status AS ENUM ('draft', 'proposed', 'approved', 'rejected');

CREATE TYPE assignment_status AS ENUM ('proposed', 'approved', 'rejected');

CREATE TYPE week_rotation AS ENUM ('ALWAYS', 'WEEK_A', 'WEEK_B');

CREATE TYPE slot_period AS ENUM ('morning', 'afternoon');

CREATE TYPE session_type AS ENUM ('lecture', 'lab', 'td');

-- ============================================================
-- TABLE 1: users
-- ============================================================
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'INSTRUCTOR',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: instructors
-- ============================================================
CREATE TABLE instructors (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 VARCHAR(255) NOT NULL,
    type                 instructor_type NOT NULL DEFAULT 'FULL_TIME',
    max_sessions_per_day INTEGER NOT NULL DEFAULT 2,
    required_sessions    INTEGER NOT NULL DEFAULT 10
);

-- ============================================================
-- TABLE 3: rooms
-- ============================================================
CREATE TABLE rooms (
    id          SERIAL PRIMARY KEY,
    room_name   VARCHAR(100) UNIQUE NOT NULL,
    capacity    INTEGER NOT NULL DEFAULT 30,
    room_type   VARCHAR(50) NOT NULL DEFAULT 'lecture',
    description TEXT
);
-- ============================================================
-- TABLE 4: sections
-- ============================================================
CREATE TABLE sections (
    id              SERIAL PRIMARY KEY,
    year_level      INTEGER NOT NULL,
    language        section_language NOT NULL DEFAULT 'ENGLISH',
    group_label     VARCHAR(50) NOT NULL,
    default_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL
);

-- ============================================================
-- TABLE 5: subjects
-- ============================================================
CREATE TABLE subjects (
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(50) UNIQUE NOT NULL,
    name              VARCHAR(255) NOT NULL,
    credits           FLOAT NOT NULL DEFAULT 1.0,
    sessions_per_week FLOAT NOT NULL DEFAULT 1.0
);

-- ============================================================
-- TABLE 6: parallel_groups
-- ============================================================
CREATE TABLE parallel_groups (
    id       SERIAL PRIMARY KEY,
    label    VARCHAR(100) NOT NULL,
    semester VARCHAR(50) NOT NULL,
    notes    TEXT
);

-- ============================================================
-- TABLE 7: course_instances
-- ============================================================
CREATE TABLE course_instances (
    id                SERIAL PRIMARY KEY,
    subject_id        INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    section_id        INTEGER NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    instructor_id     INTEGER NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
    parallel_group_id INTEGER REFERENCES parallel_groups(id) ON DELETE SET NULL,
    semester          VARCHAR(50) NOT NULL,
    session_type      session_type NOT NULL DEFAULT 'lecture'
);

-- ============================================================
-- TABLE 8: time_slots
-- ============================================================
CREATE TABLE time_slots (
    id         SERIAL PRIMARY KEY,
    day        VARCHAR(10) NOT NULL,
    slot_num   INTEGER NOT NULL CHECK (slot_num BETWEEN 1 AND 5),
    period     slot_period NOT NULL,
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL,
    UNIQUE (day, slot_num)
);

-- ============================================================
-- TABLE 9: availability
-- ============================================================
CREATE TABLE availability (
    id            SERIAL PRIMARY KEY,
    instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    slot_id       INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE RESTRICT,
    preference    availability_preference NOT NULL DEFAULT 'AVAILABLE',
    semester      VARCHAR(50) NOT NULL,
    status        availability_status NOT NULL DEFAULT 'pending',
    submitted_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (instructor_id, slot_id, semester)
);

-- ============================================================
-- TABLE 10: schedule_proposals
-- ============================================================
CREATE TABLE schedule_proposals (
    id         SERIAL PRIMARY KEY,
    semester   VARCHAR(50) NOT NULL,
    status     proposal_status NOT NULL DEFAULT 'draft',
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes      TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 11: schedule_assignments
-- ============================================================
CREATE TABLE schedule_assignments (
    id                 SERIAL PRIMARY KEY,
    proposal_id        INTEGER NOT NULL REFERENCES schedule_proposals(id) ON DELETE CASCADE,
    course_instance_id INTEGER NOT NULL REFERENCES course_instances(id) ON DELETE RESTRICT,
    slot_id            INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE RESTRICT,
    room_id            INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    week_rotation      week_rotation NOT NULL DEFAULT 'ALWAYS',
    status             assignment_status NOT NULL DEFAULT 'proposed'
);

-- ============================================================
-- TABLE 12: conflict_log
-- ============================================================
CREATE TABLE conflict_log (
    id            SERIAL PRIMARY KEY,
    proposal_id   INTEGER NOT NULL REFERENCES schedule_proposals(id) ON DELETE CASCADE,
    slot_id       INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE RESTRICT,
    conflict_type VARCHAR(100) NOT NULL,
    resolution    TEXT,
    resolved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    detected_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEED: time_slots (25 rows — 5 days × 5 sessions)
-- ============================================================
INSERT INTO time_slots (day, slot_num, period, start_time, end_time) VALUES
('Monday',    1, 'morning',   '08:00', '09:30'),
('Monday',    2, 'morning',   '09:45', '11:15'),
('Monday',    3, 'morning',   '11:30', '13:00'),
('Monday',    4, 'afternoon', '13:45', '15:15'),
('Monday',    5, 'afternoon', '15:30', '17:00'),
('Tuesday',   1, 'morning',   '08:00', '09:30'),
('Tuesday',   2, 'morning',   '09:45', '11:15'),
('Tuesday',   3, 'morning',   '11:30', '13:00'),
('Tuesday',   4, 'afternoon', '13:45', '15:15'),
('Tuesday',   5, 'afternoon', '15:30', '17:00'),
('Wednesday', 1, 'morning',   '08:00', '09:30'),
('Wednesday', 2, 'morning',   '09:45', '11:15'),
('Wednesday', 3, 'morning',   '11:30', '13:00'),
('Wednesday', 4, 'afternoon', '13:45', '15:15'),
('Wednesday', 5, 'afternoon', '15:30', '17:00'),
('Thursday',  1, 'morning',   '08:00', '09:30'),
('Thursday',  2, 'morning',   '09:45', '11:15'),
('Thursday',  3, 'morning',   '11:30', '13:00'),
('Thursday',  4, 'afternoon', '13:45', '15:15'),
('Thursday',  5, 'afternoon', '15:30', '17:00'),
('Friday',    1, 'morning',   '08:00', '09:30'),
('Friday',    2, 'morning',   '09:45', '11:15'),
('Friday',    3, 'morning',   '11:30', '13:00'),
('Friday',    4, 'afternoon', '13:45', '15:15'),
('Friday',    5, 'afternoon', '15:30', '17:00');