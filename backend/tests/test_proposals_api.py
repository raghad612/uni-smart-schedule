"""
Tests for POST /proposals/{id}/assignments (manual placement of a missing
session) and the rotation/committed-slot rules shared with the move endpoint
via _check_slot_available.

Uses an isolated SQLite in-memory DB and overrides get_db + require_admin
so no Postgres / no JWT / no seed data is needed.
"""
import math
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.instructor import Instructor
from app.models.room import Room
from app.models.section import Section
from app.models.subject import Subject
from app.models.course_instance import CourseInstance
from app.models.time_slot import TimeSlot
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.enums import (
    UserRole, InstructorType, SectionLanguage, SessionType,
    ProposalStatus, AssignmentStatus, WeekRotation,
)


# ---------- fixtures ----------

@pytest.fixture
def db_session():
    """Fresh in-memory SQLite for each test."""
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
def client(db_session):
    """TestClient with get_db + require_admin overridden."""
    admin = User(
        email="admin@test.com",
        password_hash="x",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    def _get_db_override():
        try:
            yield db_session
        finally:
            pass

    def _require_admin_override():
        return admin

    app.dependency_overrides[get_db] = _get_db_override
    app.dependency_overrides[require_admin] = _require_admin_override
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def seed(db_session):
    """
    Minimal seed: 1 instructor with a user, 1 subject (2 sessions/week),
    1 section with default_room, 1 room, 1 course_instance for period "1",
    25 time slots (5 days x 5 nums), and 1 draft proposal for semester
    "2024-1".
    """
    instr_user = User(
        email="fadlallah@test.com", password_hash="x",
        role=UserRole.INSTRUCTOR, is_active=True,
    )
    db_session.add(instr_user)
    db_session.commit()
    db_session.refresh(instr_user)

    instructor = Instructor(
        user_id=instr_user.id,
        name="dr. fadlallah",
        type=InstructorType.FULL_TIME,
        is_active=True,
    )
    room = Room(room_name="B201", capacity=30, room_type="lecture")
    db_session.add_all([instructor, room])
    db_session.commit()
    db_session.refresh(instructor)
    db_session.refresh(room)

    section = Section(
        year_level=1,
        language=SectionLanguage.ENGLISH,
        group_label="Y1-EN",
        default_room_id=room.id,
    )
    subject = Subject(code="IN1106", name="Intro to CS", credits=3.0, sessions_per_week=2.0)
    db_session.add_all([section, subject])
    db_session.commit()
    db_session.refresh(section)
    db_session.refresh(subject)

    course_instance = CourseInstance(
        subject_id=subject.id,
        section_id=section.id,
        instructor_id=instructor.id,
        semester="1",
        session_type=SessionType.lecture,
    )
    db_session.add(course_instance)

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    slots = []
    for day in days:
        for n in range(1, 6):
            ts = TimeSlot(
                day=day, slot_num=n,
                start_time=f"{7+n}:00", end_time=f"{8+n}:00",
                period="morning" if n <= 2 else "afternoon",
            )
            slots.append(ts)
            db_session.add(ts)
    db_session.commit()
    db_session.refresh(course_instance)
    for s in slots:
        db_session.refresh(s)

    proposal = ScheduleProposal(
        semester="2024-1",
        status=ProposalStatus.draft,
        created_by=1,
        notes="test",
    )
    db_session.add(proposal)
    db_session.commit()
    db_session.refresh(proposal)

    return {
        "instructor": instructor,
        "room": room,
        "section": section,
        "subject": subject,
        "course_instance": course_instance,
        "slots": slots,
        "proposal": proposal,
        "db": db_session,
    }


# ---------- helpers ----------

def _post_assignment(client, proposal_id, **kwargs):
    payload = {
        "course_instance_id": kwargs.get("course_instance_id"),
        "slot_id": kwargs.get("slot_id"),
    }
    if "room_id" in kwargs:
        payload["room_id"] = kwargs["room_id"]
    if "week_rotation" in kwargs:
        payload["week_rotation"] = kwargs["week_rotation"]
    return client.post(f"/proposals/{proposal_id}/assignments", json=payload)


# ---------- success ----------

def test_create_assignment_success(client, seed):
    r = _post_assignment(
        client,
        seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["assignments"]) == 1
    a = body["assignments"][0]
    assert a["slot_id"] == seed["slots"][0].id
    assert a["room_id"] == seed["room"].id
    assert a["week_rotation"] == "ALWAYS"


def test_create_uses_section_default_room_when_not_supplied(client, seed):
    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 200
    assert r.json()["assignments"][0]["room_id"] == seed["room"].id


def test_create_with_explicit_room_overrides_default(client, seed):
    other_room = Room(room_name="Lab1", capacity=20, room_type="lab")
    seed["db"].add(other_room)
    seed["db"].commit()
    seed["db"].refresh(other_room)

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=other_room.id,
    )
    assert r.status_code == 200
    assert r.json()["assignments"][0]["room_id"] == other_room.id


# ---------- rejection: proposal lifecycle ----------

def test_create_rejected_when_proposal_approved(client, seed):
    seed["proposal"].status = ProposalStatus.approved
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 400
    assert "approved" in r.json()["detail"].lower()


def test_create_rejected_when_proposal_not_found(client, seed):
    r = _post_assignment(
        client, 99999,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 404


# ---------- rejection: semester mismatch ----------

def test_create_rejected_when_course_belongs_to_wrong_semester(client, seed):
    seed["course_instance"].semester = "2"  # proposal is "2024-1"
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 400
    msg = r.json()["detail"].lower()
    assert "semester" in msg and "period" in msg


# ---------- rejection: over-assignment ----------

def test_create_rejected_when_already_complete(client, seed):
    # Pre-populate 2 assignments (subject.sessions_per_week = 2.0 -> required = 2).
    for slot in seed["slots"][:2]:
        seed["db"].add(ScheduleAssignment(
            proposal_id=seed["proposal"].id,
            course_instance_id=seed["course_instance"].id,
            slot_id=slot.id,
            room_id=seed["room"].id,
            week_rotation=WeekRotation.ALWAYS,
            status=AssignmentStatus.proposed,
        ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][2].id,
    )
    assert r.status_code == 409
    assert "already has all" in r.json()["detail"].lower()


# ---------- rejection: missing room with no default ----------

def test_create_rejected_when_no_room_and_no_default(client, seed):
    seed["section"].default_room_id = None
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 400
    assert "room" in r.json()["detail"].lower()


# ---------- rotation / double-booking rules ----------

def test_create_rejected_instructor_double_booked_same_proposal(client, seed):
    # Place an ALWAYS assignment in slot 0, then try to add another for the
    # same instructor (different course_instance) in the same slot.
    other_subj = Subject(code="IN1107", name="Other", credits=3.0, sessions_per_week=1.0)
    seed["db"].add(other_subj)
    seed["db"].commit()
    seed["db"].refresh(other_subj)

    other_ci = CourseInstance(
        subject_id=other_subj.id,
        section_id=seed["section"].id,
        instructor_id=seed["instructor"].id,  # same instructor
        semester="1",
        session_type=SessionType.lecture,
    )
    seed["db"].add(other_ci)
    seed["db"].commit()
    seed["db"].refresh(other_ci)

    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=other_ci.id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "Fadlallah" in detail
    assert "this draft" in detail


def test_create_rejected_room_double_booked_same_proposal(client, seed):
    # Different instructor, same room, same slot -> reject for room collision.
    other_user = User(email="x@t.com", password_hash="x", role=UserRole.INSTRUCTOR, is_active=True)
    seed["db"].add(other_user)
    seed["db"].commit()
    seed["db"].refresh(other_user)

    other_instr = Instructor(
        user_id=other_user.id, name="dr. nana",
        type=InstructorType.FULL_TIME, is_active=True,
    )
    other_subj = Subject(code="IN1107", name="Other", credits=3.0, sessions_per_week=1.0)
    seed["db"].add_all([other_instr, other_subj])
    seed["db"].commit()
    seed["db"].refresh(other_instr)
    seed["db"].refresh(other_subj)

    other_ci = CourseInstance(
        subject_id=other_subj.id,
        section_id=seed["section"].id,
        instructor_id=other_instr.id,
        semester="1",
        session_type=SessionType.lecture,
    )
    seed["db"].add(other_ci)
    seed["db"].commit()
    seed["db"].refresh(other_ci)

    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=other_ci.id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
    )
    assert r.status_code == 409
    assert "B201" in r.json()["detail"]


def test_create_week_a_on_always_same_slot_rejected(client, seed):
    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].commit()

    other_subj = Subject(code="IN1108", name="Half", credits=1.5, sessions_per_week=0.5)
    seed["db"].add(other_subj)
    seed["db"].commit()
    seed["db"].refresh(other_subj)
    other_ci = CourseInstance(
        subject_id=other_subj.id, section_id=seed["section"].id,
        instructor_id=seed["instructor"].id, semester="1",
        session_type=SessionType.lecture,
    )
    seed["db"].add(other_ci)
    seed["db"].commit()
    seed["db"].refresh(other_ci)

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=other_ci.id,
        slot_id=seed["slots"][0].id,
        week_rotation="WEEK_A",
    )
    assert r.status_code == 409


def test_create_week_a_on_week_b_same_slot_room_allowed(client, seed):
    # Two half-credit alternating courses can share the same slot, room and
    # even the same instructor when they're on opposite weeks.
    half_subj = Subject(code="HALF1", name="Half1", credits=0.5, sessions_per_week=0.5)
    other_subj = Subject(code="HALF2", name="Half2", credits=0.5, sessions_per_week=0.5)
    seed["db"].add_all([half_subj, other_subj])
    seed["db"].commit()
    seed["db"].refresh(half_subj); seed["db"].refresh(other_subj)

    ci_a = CourseInstance(
        subject_id=half_subj.id, section_id=seed["section"].id,
        instructor_id=seed["instructor"].id, semester="1",
        session_type=SessionType.lecture,
    )
    ci_b = CourseInstance(
        subject_id=other_subj.id, section_id=seed["section"].id,
        instructor_id=seed["instructor"].id, semester="1",
        session_type=SessionType.lecture,
    )
    seed["db"].add_all([ci_a, ci_b])
    seed["db"].commit()
    seed["db"].refresh(ci_a); seed["db"].refresh(ci_b)

    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=ci_a.id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.WEEK_A,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=ci_b.id,
        slot_id=seed["slots"][0].id,
        week_rotation="WEEK_B",
    )
    assert r.status_code == 200, r.text


# ---------- cross-proposal approved-schedule check ----------

def test_create_rejected_when_committed_by_approved_proposal(client, seed):
    # An APPROVED proposal in the same semester pins this instructor to slot 0.
    # Trying to place him there in the new draft must be rejected with a
    # friendly cross-proposal message.
    approved = ScheduleProposal(
        semester="2024-1", status=ProposalStatus.approved, created_by=1, notes="prev",
    )
    seed["db"].add(approved)
    seed["db"].commit()
    seed["db"].refresh(approved)

    # The "other" CI is what's committed in the approved proposal - same
    # instructor, different course.
    other_subj = Subject(code="IN1109", name="Old Course", credits=3.0, sessions_per_week=1.0)
    seed["db"].add(other_subj)
    seed["db"].commit()
    seed["db"].refresh(other_subj)
    other_ci = CourseInstance(
        subject_id=other_subj.id, section_id=seed["section"].id,
        instructor_id=seed["instructor"].id, semester="1",
        session_type=SessionType.lecture,
    )
    seed["db"].add(other_ci)
    seed["db"].commit()
    seed["db"].refresh(other_ci)

    seed["db"].add(ScheduleAssignment(
        proposal_id=approved.id,
        course_instance_id=other_ci.id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.approved,
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "Fadlallah" in detail
    assert "approved 2024-1" in detail


# ---------- conflict cleanup ----------

def test_create_removes_incomplete_assignment_conflict_when_complete(client, seed):
    # Subject needs 2 sessions/week. Pre-place 1 + an incomplete_assignment row.
    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].add(ConflictLog(
        proposal_id=seed["proposal"].id,
        conflict_type="incomplete_assignment",
        instructor_id=seed["instructor"].id,
        course_instance_id=seed["course_instance"].id,
        details="IN1106 needs 2 session(s)/week, but only 1 could be scheduled (1 missing).",
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][1].id,
    )
    assert r.status_code == 200

    remaining = seed["db"].query(ConflictLog).filter(
        ConflictLog.proposal_id == seed["proposal"].id,
        ConflictLog.conflict_type == "incomplete_assignment",
    ).count()
    assert remaining == 0


def test_create_updates_incomplete_assignment_details_when_still_missing(client, seed):
    # Make the subject need 3 sessions so adding 1 still leaves 1 missing.
    seed["subject"].sessions_per_week = 3.0
    seed["db"].commit()

    seed["db"].add(ScheduleAssignment(
        proposal_id=seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
        room_id=seed["room"].id,
        week_rotation=WeekRotation.ALWAYS,
        status=AssignmentStatus.proposed,
    ))
    seed["db"].add(ConflictLog(
        proposal_id=seed["proposal"].id,
        conflict_type="incomplete_assignment",
        instructor_id=seed["instructor"].id,
        course_instance_id=seed["course_instance"].id,
        details="IN1106 needs 3 session(s)/week, but only 1 could be scheduled (2 missing).",
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][1].id,
    )
    assert r.status_code == 200

    updated = seed["db"].query(ConflictLog).filter(
        ConflictLog.proposal_id == seed["proposal"].id,
        ConflictLog.conflict_type == "incomplete_assignment",
    ).first()
    assert updated is not None
    assert "only 2" in updated.details
    assert "1 missing" in updated.details


def test_create_clears_stale_double_book_conflicts(client, seed):
    # Stale double-book conflicts should be wiped on successful create
    # (they'll be re-derived next engine run).
    seed["db"].add(ConflictLog(
        proposal_id=seed["proposal"].id,
        conflict_type="instructor_double_booked",
        details="stale",
        slot_id=seed["slots"][3].id,
    ))
    seed["db"].commit()

    r = _post_assignment(
        client, seed["proposal"].id,
        course_instance_id=seed["course_instance"].id,
        slot_id=seed["slots"][0].id,
    )
    assert r.status_code == 200

    remaining = seed["db"].query(ConflictLog).filter(
        ConflictLog.proposal_id == seed["proposal"].id,
        ConflictLog.conflict_type == "instructor_double_booked",
    ).count()
    assert remaining == 0

# ---------- Phase 3: lock endpoint ----------

def _place_and_get_assignment_id(client, seed, slot_index=0, week_rotation=None):
    """Helper: create one assignment and return its id."""
    kwargs = {
        "course_instance_id": seed["course_instance"].id,
        "slot_id": seed["slots"][slot_index].id,
    }
    if week_rotation:
        kwargs["week_rotation"] = week_rotation
    r = _post_assignment(client, seed["proposal"].id, **kwargs)
    assert r.status_code == 200, r.text
    return r.json()["assignments"][0]["id"]


def test_lock_assignment_success(client, seed):
    """PUT { locked: true } sets locked=True and stamps locked_by + locked_at."""
    aid = _place_and_get_assignment_id(client, seed)

    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 200, r.text

    assignments = r.json()["assignments"]
    locked_assignment = next(a for a in assignments if a["id"] == aid)
    assert locked_assignment["locked"] is True
    assert locked_assignment["locked_by"] is not None
    assert locked_assignment["locked_at"] is not None


def test_unlock_assignment_success(client, seed):
    """PUT { locked: false } clears locked_by and locked_at back to None."""
    aid = _place_and_get_assignment_id(client, seed)

    # Lock first
    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 200

    # Unlock
    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": False},
    )
    assert r.status_code == 200, r.text

    locked_assignment = next(a for a in r.json()["assignments"] if a["id"] == aid)
    assert locked_assignment["locked"] is False
    assert locked_assignment["locked_by"] is None
    assert locked_assignment["locked_at"] is None


def test_lock_endpoint_idempotent(client, seed):
    """Calling lock twice with same value is a no-op success the second time."""
    aid = _place_and_get_assignment_id(client, seed)

    r1 = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r1.status_code == 200

    r2 = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r2.status_code == 200

    second_state = next(a for a in r2.json()["assignments"] if a["id"] == aid)
    assert second_state["locked"] is True
    assert second_state["locked_by"] is not None


def test_lock_rejected_when_proposal_approved(client, seed):
    """Approved proposals are immutable - lock endpoint must refuse."""
    aid = _place_and_get_assignment_id(client, seed)

    seed["proposal"].status = ProposalStatus.approved
    seed["db"].commit()

    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 400
    assert "approved" in r.json()["detail"].lower()


def test_lock_rejected_when_assignment_not_in_proposal(client, seed):
    """Mismatched proposal_id/assignment_id returns 404 (no silent crosstalk)."""
    aid = _place_and_get_assignment_id(client, seed)

    # Create a second proposal, route the lock call through THAT proposal_id
    other_proposal = ScheduleProposal(
        semester="2024-1",
        status=ProposalStatus.draft,
        created_by=1,
        notes="other",
    )
    seed["db"].add(other_proposal)
    seed["db"].commit()
    seed["db"].refresh(other_proposal)

    r = client.put(
        f"/proposals/{other_proposal.id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 404


def test_locked_assignment_cannot_be_moved(client, seed):
    """A locked assignment refuses move with friendly 'unlock first' message."""
    aid = _place_and_get_assignment_id(client, seed)

    # Lock it
    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 200

    # Try to move - should fail with 400 and helpful message
    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}",
        json={"slot_id": seed["slots"][5].id},
    )
    assert r.status_code == 400, r.text
    detail = r.json()["detail"].lower()
    assert "locked" in detail
    assert "unlock" in detail


def test_lock_state_preserved_by_clone_proposal(client, seed):
    """Cloning a proposal preserves locked state, locked_by, locked_at."""
    aid = _place_and_get_assignment_id(client, seed)

    # Lock the assignment
    r = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )
    assert r.status_code == 200
    original_locked_by = next(a for a in r.json()["assignments"] if a["id"] == aid)["locked_by"]

    # Clone the proposal
    r = client.post(f"/proposals/{seed['proposal'].id}/clone")
    assert r.status_code == 200, r.text
    clone_id = r.json()["id"]

    # Fetch the clone and verify lock state was carried over
    r = client.get(f"/proposals/{clone_id}")
    assert r.status_code == 200
    clone_assignments = r.json()["assignments"]
    assert len(clone_assignments) == 1
    cloned = clone_assignments[0]
    assert cloned["locked"] is True
    assert cloned["locked_by"] == original_locked_by
    assert cloned["locked_at"] is not None


def test_place_then_lock_then_move_blocked(client, seed):
    """Full sequence: create → lock → move blocked → unlock → move succeeds."""
    aid = _place_and_get_assignment_id(client, seed)

    # Lock
    client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": True},
    )

    # Move blocked
    r_blocked = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}",
        json={"slot_id": seed["slots"][5].id},
    )
    assert r_blocked.status_code == 400

    # Unlock
    client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}/lock",
        json={"locked": False},
    )

    # Move now succeeds
    r_ok = client.put(
        f"/proposals/{seed['proposal'].id}/assignments/{aid}",
        json={"slot_id": seed["slots"][5].id},
    )
    assert r_ok.status_code == 200, r_ok.text
    moved = next(a for a in r_ok.json()["assignments"] if a["id"] == aid)
    assert moved["slot_id"] == seed["slots"][5].id