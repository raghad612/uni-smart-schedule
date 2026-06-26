"""
Edge-case test data for the scheduling engine.

Creates a self-contained semester ("2026-1") in which running the engine
will produce every type of conflict + rotation behaviour we care about:

  Scenario A  Dr Alpha: too few availability slots vs sessions/week.
              Has 2 slots but needs 3.

  Scenario B  Dr Beta (PART_TIME) outranks Dr Gamma (FULL_TIME).
              Both compete for the same Tuesday slots in the same room.
              Beta wins, Gamma's course can't be placed.

  Scenario C  Dr Carol: offers 5 slots all on Wednesday but needs 3
              sessions. max_sessions_per_day=2 leaves 1 unplaceable.

  Scenario D  Dr Delta: only available slot is Mon-1, which is already
              committed by a pre-existing APPROVED proposal in the same
              semester (cross-proposal block via load_committed_slots).

  Scenario E  Dr Epsilon: subject with sessions_per_week=3.5. Engine
              places 3 ALWAYS + 1 WEEK_A successfully — verifies
              fractional-credit handling, and visually shows the WEEK_A
              badge in the grid.

  Scenario F  Dr Zeta: two 0.5-credit courses, both forced into the
              same slot on alternating weeks — verifies the engine
              correctly shares a slot between WEEK_A and WEEK_B,
              producing the dual-assignment cell render with both
              badges visible.

Re-running this script is safe: it wipes its own data first (anything
keyed by the edge markers below) and re-seeds from a clean slate. It
does NOT touch your existing real data.

Usage (from the backend/ folder with venv active):
    python -m scripts.seed_edge_cases
"""
import os
import sys

# Allow running as either `python -m scripts.seed_edge_cases` or
# `python scripts/seed_edge_cases.py` from the backend/ folder.
_here = os.path.dirname(os.path.abspath(__file__))
_backend = os.path.dirname(_here)
if _backend not in sys.path:
    sys.path.insert(0, _backend)

from app.core.database import SessionLocal
from app.models.user import User
from app.models.instructor import Instructor
from app.models.room import Room
from app.models.section import Section
from app.models.subject import Subject
from app.models.course_instance import CourseInstance
from app.models.availability import Availability
from app.models.time_slot import TimeSlot
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.enums import (
    UserRole, InstructorType, SectionLanguage, SessionType,
    AvailabilityPreference, ProposalStatus, AssignmentStatus,
    WeekRotation,
)


# ---- Markers used to identify edge-case data on subsequent re-runs ----
EDGE_SEMESTER_FULL = "2026-1"
EDGE_SEMESTER_PERIOD = "1"
EDGE_EMAIL_DOMAIN = "@edge.test"
EDGE_SUBJECT_PREFIX = "IN_EDGE_"
EDGE_SECTION_PREFIX = "EDGE_TEST_"
EDGE_ROOM_PREFIX = "EDGE_"


def clear_edge_data(db):
    """Remove anything previously seeded by this script. Safe to call repeatedly.

    Deletion is FK-safe: proposals -> assignments -> conflicts first (since
    those reference course_instances), then availability, course_instances,
    sections/subjects, instructors, users, rooms.
    """
    # ---- Proposals + everything that depends on them ----
    edge_proposal_ids = [
        p.id for p in db.query(ScheduleProposal)
        .filter(ScheduleProposal.semester == EDGE_SEMESTER_FULL)
        .all()
    ]
    if edge_proposal_ids:
        db.query(ConflictLog).filter(
            ConflictLog.proposal_id.in_(edge_proposal_ids)
        ).delete(synchronize_session=False)
        db.query(ScheduleAssignment).filter(
            ScheduleAssignment.proposal_id.in_(edge_proposal_ids)
        ).delete(synchronize_session=False)
        db.query(ScheduleProposal).filter(
            ScheduleProposal.id.in_(edge_proposal_ids)
        ).delete(synchronize_session=False)

    # ---- Find edge users / instructors / subjects / sections by marker ----
    edge_user_ids = [
        u.id for u in db.query(User)
        .filter(User.email.like(f"%{EDGE_EMAIL_DOMAIN}"))
        .all()
    ]
    edge_instructor_ids = [
        i.id for i in db.query(Instructor)
        .filter(Instructor.user_id.in_(edge_user_ids))
        .all()
    ] if edge_user_ids else []
    edge_subject_ids = [
        s.id for s in db.query(Subject)
        .filter(Subject.code.like(f"{EDGE_SUBJECT_PREFIX}%"))
        .all()
    ]
    edge_section_ids = [
        s.id for s in db.query(Section)
        .filter(Section.group_label.like(f"{EDGE_SECTION_PREFIX}%"))
        .all()
    ]

    # ---- Availability rows for edge instructors ----
    if edge_instructor_ids:
        db.query(Availability).filter(
            Availability.instructor_id.in_(edge_instructor_ids)
        ).delete(synchronize_session=False)

    # ---- Course_instances for edge subjects OR edge instructors ----
    if edge_subject_ids or edge_instructor_ids:
        db.query(CourseInstance).filter(
            (CourseInstance.subject_id.in_(edge_subject_ids or [-1]))
            | (CourseInstance.instructor_id.in_(edge_instructor_ids or [-1]))
        ).delete(synchronize_session=False)

    # ---- Sections / subjects / instructors / users / rooms ----
    if edge_section_ids:
        db.query(Section).filter(
            Section.id.in_(edge_section_ids)
        ).delete(synchronize_session=False)
    if edge_subject_ids:
        db.query(Subject).filter(
            Subject.id.in_(edge_subject_ids)
        ).delete(synchronize_session=False)
    if edge_instructor_ids:
        db.query(Instructor).filter(
            Instructor.id.in_(edge_instructor_ids)
        ).delete(synchronize_session=False)
    if edge_user_ids:
        db.query(User).filter(
            User.id.in_(edge_user_ids)
        ).delete(synchronize_session=False)
    db.query(Room).filter(
        Room.room_name.like(f"{EDGE_ROOM_PREFIX}%")
    ).delete(synchronize_session=False)

    db.commit()


def _make_user(db, email):
    """Edge instructors need a user row (FK), but they're never logged into."""
    u = User(
        email=email,
        password_hash="x_edge_test_no_login",
        role=UserRole.INSTRUCTOR,
        is_active=False,
    )
    db.add(u)
    db.flush()
    return u


def _make_instructor(db, email, name, instr_type):
    u = _make_user(db, email)
    i = Instructor(user_id=u.id, name=name, type=instr_type, is_active=True)
    db.add(i)
    db.flush()
    return i


def _add_availability(db, instructor, slot_lookup, days_slots,
                      preference=AvailabilityPreference.PREFERRED):
    """days_slots: iterable of (day_name, slot_num) tuples."""
    for day, slot_num in days_slots:
        db.add(Availability(
            instructor_id=instructor.id,
            slot_id=slot_lookup[(day, slot_num)],
            preference=preference,
            semester=EDGE_SEMESTER_FULL,
        ))


def seed(db):
    print(f"Clearing previous edge-case data for semester '{EDGE_SEMESTER_FULL}'...")
    clear_edge_data(db)

    time_slots = db.query(TimeSlot).all()
    if not time_slots:
        print("ERROR: time_slots table is empty. Run your main seed script first")
        print("       so the 25 base time slots exist before running this one.")
        sys.exit(1)
    slot_lookup = {(ts.day, ts.slot_num): ts.id for ts in time_slots}
    print(f"  Using {len(time_slots)} existing time slots.")

    # ---- Rooms ----
    print("Creating rooms, sections, subjects...")
    room_a = Room(room_name=f"{EDGE_ROOM_PREFIX}A101", capacity=30, room_type="lecture")
    room_b = Room(room_name=f"{EDGE_ROOM_PREFIX}A102", capacity=30, room_type="lecture")
    db.add_all([room_a, room_b])
    db.flush()

    # ---- Sections ----
    # Main section: scenarios A, B, C, D, E
    # Alt section:  scenario F only (Zeta uses a different room to avoid the
    #               room collision with everyone else)
    section_main = Section(
        year_level=2,
        language=SectionLanguage.ENGLISH,
        group_label=f"{EDGE_SECTION_PREFIX}MAIN",
        default_room_id=room_a.id,
    )
    section_alt = Section(
        year_level=2,
        language=SectionLanguage.ENGLISH,
        group_label=f"{EDGE_SECTION_PREFIX}ZETA",
        default_room_id=room_b.id,
    )
    db.add_all([section_main, section_alt])
    db.flush()

    # ---- Subjects (one per scenario) ----
    subj_a  = Subject(code=f"{EDGE_SUBJECT_PREFIX}A",  name="Scenario A - Too few slots",         credits=3.0, sessions_per_week=3.0)
    subj_b1 = Subject(code=f"{EDGE_SUBJECT_PREFIX}B1", name="Scenario B - Wins priority (PT)",    credits=2.0, sessions_per_week=2.0)
    subj_b2 = Subject(code=f"{EDGE_SUBJECT_PREFIX}B2", name="Scenario B - Loses priority (FT)",   credits=2.0, sessions_per_week=2.0)
    subj_c  = Subject(code=f"{EDGE_SUBJECT_PREFIX}C",  name="Scenario C - All on one day",        credits=3.0, sessions_per_week=3.0)
    subj_d  = Subject(code=f"{EDGE_SUBJECT_PREFIX}D",  name="Scenario D - Slot already committed", credits=1.0, sessions_per_week=1.0)
    subj_e  = Subject(code=f"{EDGE_SUBJECT_PREFIX}E",  name="Scenario E - Fractional 3.5/wk",     credits=4.0, sessions_per_week=3.5)
    subj_f1 = Subject(code=f"{EDGE_SUBJECT_PREFIX}F1", name="Scenario F - Half credit (Week A)",  credits=0.5, sessions_per_week=0.5)
    subj_f2 = Subject(code=f"{EDGE_SUBJECT_PREFIX}F2", name="Scenario F - Half credit (Week B)",  credits=0.5, sessions_per_week=0.5)
    db.add_all([subj_a, subj_b1, subj_b2, subj_c, subj_d, subj_e, subj_f1, subj_f2])
    db.flush()

    # ---- Instructors ----
    print("Creating instructors...")
    alpha   = _make_instructor(db, f"alpha{EDGE_EMAIL_DOMAIN}",   "Dr. Alpha",   InstructorType.PART_TIME)
    beta    = _make_instructor(db, f"beta{EDGE_EMAIL_DOMAIN}",    "Dr. Beta",    InstructorType.PART_TIME)
    gamma   = _make_instructor(db, f"gamma{EDGE_EMAIL_DOMAIN}",   "Dr. Gamma",   InstructorType.FULL_TIME)
    carol   = _make_instructor(db, f"carol{EDGE_EMAIL_DOMAIN}",   "Dr. Carol",   InstructorType.FULL_TIME)
    delta   = _make_instructor(db, f"delta{EDGE_EMAIL_DOMAIN}",   "Dr. Delta",   InstructorType.FULL_TIME)
    epsilon = _make_instructor(db, f"epsilon{EDGE_EMAIL_DOMAIN}", "Dr. Epsilon", InstructorType.FULL_TIME)
    zeta    = _make_instructor(db, f"zeta{EDGE_EMAIL_DOMAIN}",    "Dr. Zeta",    InstructorType.FULL_TIME)

    # ---- Course instances (all in period "1") ----
    print("Creating course_instances...")
    db.add_all([
        CourseInstance(subject_id=subj_a.id,  section_id=section_main.id, instructor_id=alpha.id,   semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_b1.id, section_id=section_main.id, instructor_id=beta.id,    semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_b2.id, section_id=section_main.id, instructor_id=gamma.id,   semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_c.id,  section_id=section_main.id, instructor_id=carol.id,   semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_d.id,  section_id=section_main.id, instructor_id=delta.id,   semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_e.id,  section_id=section_main.id, instructor_id=epsilon.id, semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_f1.id, section_id=section_alt.id,  instructor_id=zeta.id,    semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
        CourseInstance(subject_id=subj_f2.id, section_id=section_alt.id,  instructor_id=zeta.id,    semester=EDGE_SEMESTER_PERIOD, session_type=SessionType.lecture),
    ])
    db.flush()

    # ---- Availability (engineered per scenario) ----
    print("Creating availability...")
    days_all = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

    # Alpha: only 2 slots (needs 3) - Scenario A
    _add_availability(db, alpha,   slot_lookup, [("Monday", 1), ("Monday", 2)])
    # Beta: 2 Tuesday slots (needs 2, wins them all)
    _add_availability(db, beta,    slot_lookup, [("Tuesday", 1), ("Tuesday", 2)])
    # Gamma: same 2 Tuesday slots (needs 2, loses to Beta) - Scenario B
    _add_availability(db, gamma,   slot_lookup, [("Tuesday", 1), ("Tuesday", 2)])
    # Carol: all 5 Wednesday slots (needs 3, max 2/day blocks last) - Scenario C
    _add_availability(db, carol,   slot_lookup, [("Wednesday", n) for n in range(1, 6)])
    # Delta: only Mon-1 (which is committed by approved proposal) - Scenario D
    _add_availability(db, delta,   slot_lookup, [("Monday", 1)])
    # Epsilon: all 25 slots (needs 4 placements, spreads across days) - Scenario E
    _add_availability(db, epsilon, slot_lookup, [(d, n) for d in days_all for n in range(1, 6)])
    # Zeta: only Fri-1 (two 0.5 courses share via WEEK_A/WEEK_B) - Scenario F
    _add_availability(db, zeta,    slot_lookup, [("Friday", 1)])
    db.flush()

    # ---- Pre-existing APPROVED proposal (sets up Scenario D) ----
    print("Creating pre-existing APPROVED proposal (for Scenario D)...")
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    if not admin:
        print("WARNING: no ADMIN user found - the proposal needs a created_by user.")
        print("         Falling back to the first user in the database.")
        admin = db.query(User).order_by(User.id.asc()).first()
        if not admin:
            print("ERROR: no users at all - run the main seed first.")
            sys.exit(1)

    approved = ScheduleProposal(
        semester=EDGE_SEMESTER_FULL,
        status=ProposalStatus.approved,
        created_by=admin.id,
        notes=(
            "[EDGE-CASE TEST DATA] Pre-existing approved schedule. "
            "Pins Dr Delta to Monday slot 1 to exercise the cross-proposal "
            "committed-slot check. Safe to delete."
        ),
    )
    db.add(approved)
    db.flush()

    db.add(ScheduleAssignment(
        proposal_id=approved.id,
        course_instance_id=db.query(CourseInstance).filter(
            CourseInstance.instructor_id == delta.id,
            CourseInstance.subject_id == subj_d.id,
        ).first().id,
        slot_id=slot_lookup[("Monday", 1)],
        room_id=room_a.id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.approved,
    ))
    db.commit()

    # ---- Summary ----
    print()
    print("=" * 70)
    print(f"DONE. Edge-case data for semester '{EDGE_SEMESTER_FULL}' is in place.")
    print("=" * 70)
    print()
    print("Next steps:")
    print()
    print("  1. Log in as admin (admin@university.edu / admin123).")
    print(f"  2. Run the engine for semester '{EDGE_SEMESTER_FULL}' from the dashboard,")
    print("     WITHOUT picking a section (so all 8 edge course_instances run).")
    print("  3. Open the resulting DRAFT proposal in View & Edit Schedule.")
    print()
    print("Expected in the resulting draft:")
    print("  - Missing Sessions panel shows 4 entries:")
    print("      * Dr Alpha   IN_EDGE_A   (2 missing) -- Scenario A")
    print("      * Dr Gamma   IN_EDGE_B2  (2 missing) -- Scenario B")
    print("      * Dr Carol   IN_EDGE_C   (1 missing) -- Scenario C")
    print("      * Dr Delta   IN_EDGE_D   (1 missing) -- Scenario D")
    print("  - Dr Epsilon's IN_EDGE_E appears with 3 ALWAYS sessions + 1 WEEK_A badge")
    print("  - Friday slot 1 cell shows TWO assignments for Dr Zeta with WEEK_A/WEEK_B badges")
    print()
    print("To verify the cross-proposal error message:")
    print("  - Click 'Place' on Dr Delta's row.")
    print("  - Click Monday slot 1 in the grid.")
    print("  - A red toast should say something like:")
    print("      'Dr. Delta is already scheduled in this slot in the approved")
    print("       2026-1 schedule (teaching another section)...'")
    print()


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()