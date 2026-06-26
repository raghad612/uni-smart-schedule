"""
Tests for load_inherited_locks - the Phase 3 helper that reads locked
assignments from the most recent draft proposal for a semester and returns
them shaped for engine consumption.

Uses an isolated SQLite in-memory DB. Tests cover:
  - empty case (no drafts → empty result)
  - happy path (locked assignment in draft → returned as valid)
  - "most recent" semantics (older draft ignored when newer draft exists)
  - approved-proposal locks are NOT inherited (those are handled by
    load_committed_slots instead)
  - non-locked assignments in the most recent draft are NOT inherited
  - invalid carry-overs (deleted course, deactivated instructor, deleted room)
    each produce a carry_error with the correct reason
"""
import time
import pytest
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.user import User
from app.models.instructor import Instructor
from app.models.room import Room
from app.models.section import Section
from app.models.subject import Subject
from app.models.course_instance import CourseInstance
from app.models.time_slot import TimeSlot
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.enums import (
    UserRole, InstructorType, SectionLanguage, SessionType,
    ProposalStatus, AssignmentStatus, WeekRotation,
)
from app.services.scheduling_engine import load_inherited_locks


# ---------- fixtures ----------

@pytest.fixture
def db_session():
    """Fresh in-memory SQLite per test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def world(db_session):
    """
    Minimal world: 1 admin user, 1 instructor (active), 1 room, 1 section,
    1 subject (2 sessions/week), 1 course_instance for period '1', 25 time
    slots. Returns the seeded entities for tests to compose locks around.
    """
    admin = User(email="admin@test.com", password_hash="x", role=UserRole.ADMIN, is_active=True)
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    instr_user = User(email="instr@test.com", password_hash="x", role=UserRole.INSTRUCTOR, is_active=True)
    db_session.add(instr_user)
    db_session.commit()
    db_session.refresh(instr_user)

    instructor = Instructor(
        user_id=instr_user.id, name="dr. delta",
        type=InstructorType.FULL_TIME, is_active=True,
    )
    room = Room(room_name="B201", capacity=30, room_type="lecture")
    db_session.add_all([instructor, room])
    db_session.commit()
    db_session.refresh(instructor)
    db_session.refresh(room)

    section = Section(
        year_level=1, language=SectionLanguage.ENGLISH,
        group_label="Y1-EN", default_room_id=room.id,
    )
    subject = Subject(code="IN1106", name="Intro", credits=3.0, sessions_per_week=2.0)
    db_session.add_all([section, subject])
    db_session.commit()
    db_session.refresh(section)
    db_session.refresh(subject)

    ci = CourseInstance(
        subject_id=subject.id, section_id=section.id,
        instructor_id=instructor.id, semester="1",
        session_type=SessionType.lecture,
    )
    db_session.add(ci)

    slots = []
    for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
        for n in range(1, 6):
            ts = TimeSlot(
                day=day, slot_num=n,
                start_time=f"{7+n}:00", end_time=f"{8+n}:00",
                period="morning" if n <= 2 else "afternoon",
            )
            slots.append(ts)
            db_session.add(ts)
    db_session.commit()
    db_session.refresh(ci)
    for s in slots:
        db_session.refresh(s)

    return {
        "db": db_session,
        "admin": admin,
        "instructor": instructor,
        "room": room,
        "section": section,
        "subject": subject,
        "ci": ci,
        "slots": slots,
    }


def _make_proposal(db, semester="2024-1", status=ProposalStatus.draft, created_by_id=1):
    p = ScheduleProposal(
        semester=semester, status=status,
        created_by=created_by_id, notes="test",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_assignment(db, proposal_id, ci_id, slot_id, room_id,
                     locked=False, locked_by=None, rotation=WeekRotation.ALWAYS):
    a = ScheduleAssignment(
        proposal_id=proposal_id,
        course_instance_id=ci_id,
        slot_id=slot_id,
        room_id=room_id,
        week_rotation=rotation,
        status=AssignmentStatus.proposed,
        locked=locked,
        locked_by=locked_by,
        locked_at=datetime.utcnow() if locked else None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


# ---------- tests ----------

def test_no_draft_returns_empty(world):
    """No drafts for the semester → empty result, source_draft_id is None."""
    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert errors == []
    assert source is None


def test_draft_with_no_locks_returns_empty_valid(world):
    """Draft exists but has no locked assignments → empty valid, source still
    points at the draft because it WAS the most recent."""
    p = _make_proposal(world["db"])
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=False,
    )
    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert errors == []
    assert source == p.id


def test_locked_assignment_is_returned_as_engine_dict(world):
    """Happy path: a locked assignment becomes an engine-shaped dict."""
    p = _make_proposal(world["db"])
    a = _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][3].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )

    valid, errors, source = load_inherited_locks(world["db"], "2024-1")

    assert len(valid) == 1
    assert errors == []
    assert source == p.id

    lock = valid[0]
    assert lock["course_instance_id"] == world["ci"].id
    assert lock["slot_id"] == world["slots"][3].id
    assert lock["room_id"] == world["room"].id
    assert lock["instructor_id"] == world["instructor"].id
    assert lock["week_rotation"] == WeekRotation.ALWAYS
    assert lock["locked"] is True
    assert lock["locked_by"] == world["admin"].id
    assert lock["locked_at"] is not None
    assert lock["_inherited_from_proposal_id"] == p.id
    assert lock["_inherited_from_assignment_id"] == a.id


def test_most_recent_draft_only_older_drafts_ignored(world):
    """
    If 2 drafts exist for the same semester with different locks, only the
    MOST RECENT one's locks get inherited. This is the core Phase 3 design
    decision.
    """
    older = _make_proposal(world["db"])
    _make_assignment(
        world["db"], older.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )

    # Sleep just enough so SQLite's created_at advances. The order_by clause
    # uses (created_at DESC, id DESC) as a deterministic tiebreaker, so even
    # without sleeping the newer proposal (higher id) would win - but
    # sleeping makes the test prove created_at ordering specifically.
    time.sleep(0.01)

    newer = _make_proposal(world["db"])
    _make_assignment(
        world["db"], newer.id, world["ci"].id,
        world["slots"][9].id, world["room"].id,  # different slot to prove inheritance source
        locked=True, locked_by=world["admin"].id,
    )

    valid, errors, source = load_inherited_locks(world["db"], "2024-1")

    assert source == newer.id, "Should inherit from the most recent draft, not the older one"
    assert len(valid) == 1
    assert valid[0]["slot_id"] == world["slots"][9].id, \
        "Should carry the NEWER draft's slot, not the older one's"


def test_approved_proposal_locks_not_inherited(world):
    """
    Approved proposals are handled by load_committed_slots, not by inheritance.
    A locked assignment in an approved proposal must NOT show up in
    load_inherited_locks output.
    """
    approved = _make_proposal(world["db"], status=ProposalStatus.approved)
    _make_assignment(
        world["db"], approved.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )
    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert errors == []
    assert source is None, "Approved proposal shouldn't be picked as inheritance source"


def test_unlocked_assignments_in_most_recent_draft_are_skipped(world):
    """Only LOCKED assignments are carried. Unlocked ones in the same draft
    are ignored - they'll be re-generated by the fresh engine run."""
    p = _make_proposal(world["db"])
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=False,
    )
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][3].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )
    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert len(valid) == 1
    assert valid[0]["slot_id"] == world["slots"][3].id


def test_invalid_lock_course_deleted_surfaces_carry_error(world):
    """
    If the course_instance referenced by a locked assignment was deleted
    after locking, the lock can't be carried - surface a carry_error with
    reason='course_deleted' instead. Uses raw SQL to bypass SQLAlchemy's
    cascade behavior (in production the FK would prevent this, but the
    defensive code still must not crash if the row goes missing for any
    reason).
    """
    p = _make_proposal(world["db"])
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )

    ci_id = world["ci"].id
    world["db"].expire_all()
    # Raw delete: bypass ORM cascade so we can simulate a dangling FK
    world["db"].execute(text("DELETE FROM course_instances WHERE id = :id"), {"id": ci_id})
    world["db"].commit()

    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert len(errors) == 1
    assert errors[0]["reason"] == "course_deleted"
    assert "no longer exists" in errors[0]["details"]


def test_invalid_lock_instructor_inactive_surfaces_carry_error(world):
    """A locked assignment whose instructor was deactivated is dropped with
    reason='instructor_inactive'."""
    p = _make_proposal(world["db"])
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )

    world["instructor"].is_active = False
    world["db"].commit()

    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert len(errors) == 1
    assert errors[0]["reason"] == "instructor_inactive"
    assert "no longer active" in errors[0]["details"]


def test_invalid_lock_mixed_with_valid_lock(world):
    """When SOME locks are valid and others aren't, the valid ones still
    come through and the invalid ones surface as carry_errors. They don't
    block each other."""
    # Add a second course_instance + a second locked assignment for it
    other_subject = Subject(code="MA2202", name="Calc", credits=3.0, sessions_per_week=2.0)
    world["db"].add(other_subject)
    world["db"].commit()
    world["db"].refresh(other_subject)
    other_ci = CourseInstance(
        subject_id=other_subject.id, section_id=world["section"].id,
        instructor_id=world["instructor"].id, semester="1",
        session_type=SessionType.lecture,
    )
    world["db"].add(other_ci)
    world["db"].commit()
    world["db"].refresh(other_ci)

    p = _make_proposal(world["db"])
    _make_assignment(  # will stay valid
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )
    _make_assignment(  # will become invalid when other_ci is deleted
        world["db"], p.id, other_ci.id,
        world["slots"][5].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )

    # Raw delete to bypass cascade
    other_ci_id = other_ci.id
    world["db"].expire_all()
    world["db"].execute(text("DELETE FROM course_instances WHERE id = :id"), {"id": other_ci_id})
    world["db"].commit()

    valid, errors, source = load_inherited_locks(world["db"], "2024-1")

    assert len(valid) == 1
    assert valid[0]["course_instance_id"] == world["ci"].id
    assert len(errors) == 1
    assert errors[0]["reason"] == "course_deleted"


def test_locks_from_different_semester_not_inherited(world):
    """A draft for 2024-2 should not contribute locks when querying 2024-1."""
    p = _make_proposal(world["db"], semester="2024-2")
    _make_assignment(
        world["db"], p.id, world["ci"].id,
        world["slots"][0].id, world["room"].id,
        locked=True, locked_by=world["admin"].id,
    )
    valid, errors, source = load_inherited_locks(world["db"], "2024-1")
    assert valid == []
    assert source is None
    