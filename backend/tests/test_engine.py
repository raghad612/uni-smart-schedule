from app.services.scheduling_engine import (
    calculate_gap_score,
    sort_instructors,
    detect_conflicts,
    assign_slots,
    _rotations_overlap,
    _has_conflict,
)
from app.models.enums import InstructorType, AvailabilityPreference, WeekRotation
# ─── MOCK CLASSES ─────────────────────────────────────────────────────────────

class MockInstructor:
    def __init__(self, id, type):
        self.id = id
        self.type = type


class MockSubject:
    def __init__(self, sessions_per_week, code="TEST"):
        self.sessions_per_week = sessions_per_week
        self.code = code


class MockSection:
    def __init__(self, default_room_id=None):
        self.default_room_id = default_room_id


class MockCourseInstance:
    def __init__(self, instructor_id, sessions_per_week, id=1, code="TEST", room_id=None):
        self.id = id
        self.instructor_id = instructor_id
        self.subject = MockSubject(sessions_per_week, code)
        self.section = MockSection(room_id)


class MockAvailabilityRow:
    def __init__(self, id, instructor_id, slot_id, preference):
        self.id = id
        self.instructor_id = instructor_id
        self.slot_id = slot_id
        self.preference = preference


class MockTimeSlot:
    def __init__(self, id, day, slot_num):
        self.id = id
        self.day = day
        self.slot_num = slot_num


# ─── TEST 1: GAP SCORE ────────────────────────────────────────────────────────

def test_gap_score_perfect():
    """Consecutive slots on the same day = gap of 0."""
    time_slots = [
        MockTimeSlot(1, "Monday", 1),
        MockTimeSlot(2, "Monday", 2),
        MockTimeSlot(3, "Monday", 3),
    ]
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10},
        {"instructor_id": 1, "slot_id": 2, "course_instance_id": 11},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 12},
    ]
    assert calculate_gap_score(assignments, time_slots) == 0


def test_gap_score_with_gap():
    """Slots 1, 3, 5 on same day = gap of 2."""
    time_slots = [
        MockTimeSlot(1, "Monday", 1),
        MockTimeSlot(3, "Monday", 3),
        MockTimeSlot(5, "Monday", 5),
    ]
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11},
        {"instructor_id": 1, "slot_id": 5, "course_instance_id": 12},
    ]
    # gap = (5 - 1) - (3 - 1) = 4 - 2 = 2
    assert calculate_gap_score(assignments, time_slots) == 2


def test_gap_score_single_session_per_day():
    """One session per day = no gap possible."""
    time_slots = [
        MockTimeSlot(1, "Monday", 1),
        MockTimeSlot(6, "Tuesday", 1),
    ]
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10},
        {"instructor_id": 1, "slot_id": 6, "course_instance_id": 11},
    ]
    assert calculate_gap_score(assignments, time_slots) == 0


# ─── TEST 2: PRIORITY SORT ────────────────────────────────────────────────────

def test_sort_part_time_before_full_time():
    """PART_TIME instructors must come before FULL_TIME."""
    instructors = [
        MockInstructor(1, InstructorType.FULL_TIME),
        MockInstructor(2, InstructorType.PART_TIME),
        MockInstructor(3, InstructorType.FULL_TIME),
        MockInstructor(4, InstructorType.PART_TIME),
    ]
    course_instances = [
        MockCourseInstance(1, 4),
        MockCourseInstance(2, 2),
        MockCourseInstance(3, 3),
        MockCourseInstance(4, 3),
    ]
    result = sort_instructors(instructors, course_instances)
    types = [i.type for i in result]
    part_time_indices = [i for i, t in enumerate(types) if t == InstructorType.PART_TIME]
    full_time_indices = [i for i, t in enumerate(types) if t == InstructorType.FULL_TIME]
    assert max(part_time_indices) < min(full_time_indices)


def test_sort_within_group_by_required_sessions_desc():
    """Within each type group, more required_sessions (derived from courses) comes first."""
    instructors = [
        MockInstructor(1, InstructorType.PART_TIME),
        MockInstructor(2, InstructorType.PART_TIME),
        MockInstructor(3, InstructorType.FULL_TIME),
        MockInstructor(4, InstructorType.FULL_TIME),
    ]
    course_instances = [
        MockCourseInstance(1, 2),
        MockCourseInstance(2, 4),
        MockCourseInstance(3, 3),
        MockCourseInstance(4, 5),
    ]
    result = sort_instructors(instructors, course_instances)
    # First two should be PART_TIME with id=2 (4 sessions) before id=1 (2 sessions)
    assert result[0].id == 2
    assert result[1].id == 1
    # Last two should be FULL_TIME with id=4 (5 sessions) before id=3 (3 sessions)
    assert result[2].id == 4
    assert result[3].id == 3


def test_sort_with_fractional_sessions_per_week():
    """A 3.5 sessions/week course rounds UP to 4 when computing required sessions."""
    instructors = [
        MockInstructor(1, InstructorType.PART_TIME),
        MockInstructor(2, InstructorType.PART_TIME),
    ]
    # Instructor 1: one course at 3.5 -> ceil(3.5) = 4
    # Instructor 2: two courses, 2 + 1.5 -> ceil(3.5) = 4 as well, but
    # combined with a third small course -> 4.5 -> ceil = 5, so instructor 2 wins
    course_instances = [
        MockCourseInstance(1, 3.5),
        MockCourseInstance(2, 2),
        MockCourseInstance(2, 2.5),
    ]
    result = sort_instructors(instructors, course_instances)
    assert result[0].id == 2
    assert result[1].id == 1


# ─── TEST 3: CONFLICT DETECTION ───────────────────────────────────────────────

def test_detect_instructor_double_booking():
    """Same instructor in same slot = conflict detected."""
    assignments = [
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 10, "room_id": 1},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11, "room_id": 2},
    ]
    conflicts = detect_conflicts(assignments)
    assert len(conflicts) == 1
    assert conflicts[0]["conflict_type"] == "instructor_double_booked"


def test_detect_room_double_booking():
    """Same room in same slot = conflict detected."""
    assignments = [
        {"instructor_id": 1, "slot_id": 2, "course_instance_id": 10, "room_id": 5},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 11, "room_id": 5},
    ]
    conflicts = detect_conflicts(assignments)
    assert len(conflicts) == 1
    assert conflicts[0]["conflict_type"] == "room_double_booked"


def test_no_conflict_different_slots():
    """Same instructor in different slots = no conflict."""
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10, "room_id": 1},
        {"instructor_id": 1, "slot_id": 2, "course_instance_id": 11, "room_id": 1},
    ]
    conflicts = detect_conflicts(assignments)
    assert len(conflicts) == 0
    

# ─── TEST 4: OPTIMISER SAFETY GUARD ──────────────────────────────────────────
# Lock in the fix: the gap optimiser must NEVER move an instructor into a slot
# they did not offer (or marked BUSY), and never onto a committed slot.

from app.services.scheduling_engine import optimise_gaps


class MockAvailability:
    def __init__(self, instructor_id, slot_id, preference):
        self.instructor_id = instructor_id
        self.slot_id = slot_id
        self.preference = preference


def _five_monday_slots():
    return [MockTimeSlot(s, "Monday", s) for s in range(1, 6)]


def test_optimiser_reduces_gap_when_both_available():
    """A beneficial swap fully within availability IS taken."""
    time_slots = _five_monday_slots()
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10, "room_id": None},
        {"instructor_id": 1, "slot_id": 5, "course_instance_id": 11, "room_id": None},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 20, "room_id": None},
    ]
    availability = [
        MockAvailability(1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 5, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 5, AvailabilityPreference.AVAILABLE),
    ]
    before = calculate_gap_score(assignments, time_slots)
    result = optimise_gaps(assignments, time_slots, availability)
    assert calculate_gap_score(result, time_slots) < before


def test_optimiser_never_moves_instructor_outside_availability():
    """A beneficial swap is REJECTED if the receiving instructor never offered that slot."""
    time_slots = _five_monday_slots()
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10, "room_id": None},
        {"instructor_id": 1, "slot_id": 5, "course_instance_id": 11, "room_id": None},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 20, "room_id": None},
    ]
    availability = [
        MockAvailability(1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 5, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 2, AvailabilityPreference.AVAILABLE),
    ]
    result = optimise_gaps(assignments, time_slots, availability)
    instr2_slot = [a for a in result if a["instructor_id"] == 2][0]["slot_id"]
    assert instr2_slot == 2


def test_optimiser_ignores_busy_slots():
    """A slot marked BUSY must not be used by the optimiser."""
    time_slots = _five_monday_slots()
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10, "room_id": None},
        {"instructor_id": 1, "slot_id": 5, "course_instance_id": 11, "room_id": None},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 20, "room_id": None},
    ]
    availability = [
        MockAvailability(1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 5, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 5, AvailabilityPreference.BUSY),
    ]
    result = optimise_gaps(assignments, time_slots, availability)
    instr2_slot = [a for a in result if a["instructor_id"] == 2][0]["slot_id"]
    assert instr2_slot == 2


def test_optimiser_respects_committed_slots():
    """A swap must be rejected if it collides with an approved proposal's committed slot."""
    time_slots = _five_monday_slots()
    assignments = [
        {"instructor_id": 1, "slot_id": 1, "course_instance_id": 10, "room_id": None},
        {"instructor_id": 1, "slot_id": 5, "course_instance_id": 11, "room_id": None},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 20, "room_id": None},
    ]
    availability = [
        MockAvailability(1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(1, 5, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 2, AvailabilityPreference.AVAILABLE),
        MockAvailability(2, 5, AvailabilityPreference.AVAILABLE),
    ]
    result = optimise_gaps(
        assignments, time_slots, availability,
        instructor_committed={2: {5}},
    )
    instr2_slot = [a for a in result if a["instructor_id"] == 2][0]["slot_id"]
    assert instr2_slot == 2

    # ─── TEST 5: WEEK_A / WEEK_B ROTATION OVERLAP ────────────────────────────────
# These cover the "alternating week" course case: a course meeting every
# other week (WEEK_A or WEEK_B) should NOT clash with a different course's
# session in the same slot/room if that other course alternates on the
# OPPOSITE week. ALWAYS (every-week) sessions clash with everything.

def test_rotations_overlap_always_clashes_with_anything():
    assert _rotations_overlap(WeekRotation.ALWAYS, WeekRotation.ALWAYS) is True
    assert _rotations_overlap(WeekRotation.ALWAYS, WeekRotation.WEEK_A) is True
    assert _rotations_overlap(WeekRotation.WEEK_B, WeekRotation.ALWAYS) is True


def test_rotations_overlap_same_alternating_week_clashes():
    assert _rotations_overlap(WeekRotation.WEEK_A, WeekRotation.WEEK_A) is True
    assert _rotations_overlap(WeekRotation.WEEK_B, WeekRotation.WEEK_B) is True


def test_rotations_overlap_opposite_alternating_weeks_do_not_clash():
    assert _rotations_overlap(WeekRotation.WEEK_A, WeekRotation.WEEK_B) is False
    assert _rotations_overlap(WeekRotation.WEEK_B, WeekRotation.WEEK_A) is False


def test_detect_conflicts_week_a_and_week_b_same_slot_same_room_no_conflict():
    """Two different courses, same instructor's slot/room, but one runs on
    WEEK_A and the other on WEEK_B -> they never actually happen together."""
    assignments = [
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 10, "room_id": 5, "week_rotation": WeekRotation.WEEK_A},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11, "room_id": 5, "week_rotation": WeekRotation.WEEK_B},
    ]
    assert detect_conflicts(assignments) == []
    assert _has_conflict(assignments) is False


def test_detect_conflicts_two_week_a_sessions_same_slot_is_conflict():
    """Two different courses both on WEEK_A in the same instructor slot
    -> they DO happen on the same real weeks -> conflict."""
    assignments = [
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 10, "room_id": 5, "week_rotation": WeekRotation.WEEK_A},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11, "room_id": 6, "week_rotation": WeekRotation.WEEK_A},
    ]
    conflicts = detect_conflicts(assignments)
    assert any(c["conflict_type"] == "instructor_double_booked" for c in conflicts)
    assert _has_conflict(assignments) is True


def test_detect_conflicts_always_clashes_with_week_a():
    """An ALWAYS (every-week) session clashes with a WEEK_A session in the
    same slot, because the ALWAYS one happens on A-weeks too."""
    assignments = [
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 10, "room_id": 5, "week_rotation": WeekRotation.ALWAYS},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11, "room_id": 6, "week_rotation": WeekRotation.WEEK_A},
    ]
    conflicts = detect_conflicts(assignments)
    assert any(c["conflict_type"] == "instructor_double_booked" for c in conflicts)
    assert _has_conflict(assignments) is True


def test_detect_conflicts_missing_week_rotation_defaults_to_always():
    """Assignments without a 'week_rotation' key (legacy/pre-Step-B engine
    output) are treated as ALWAYS, preserving old behavior."""
    assignments = [
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 10, "room_id": 5},
        {"instructor_id": 1, "slot_id": 3, "course_instance_id": 11, "room_id": 6},
    ]
    conflicts = detect_conflicts(assignments)
    assert any(c["conflict_type"] == "instructor_double_booked" for c in conflicts)


def test_room_double_booking_week_a_week_b_no_conflict():
    """Same room/slot, different instructors, opposite alternating weeks
    -> no room conflict."""
    assignments = [
        {"instructor_id": 1, "slot_id": 2, "course_instance_id": 10, "room_id": 5, "week_rotation": WeekRotation.WEEK_A},
        {"instructor_id": 2, "slot_id": 2, "course_instance_id": 11, "room_id": 5, "week_rotation": WeekRotation.WEEK_B},
    ]
    assert detect_conflicts(assignments) == []

# ─── TEST 6: ASSIGN_SLOTS - MULTI-SESSION & ALTERNATING WEEKS ────────────────

def _five_day_slots(slots_per_day=5):
    """Returns MockTimeSlot list for a full week: days x slots_per_day."""
    slots = []
    sid = 1
    for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
        for s in range(1, slots_per_day + 1):
            slots.append(MockTimeSlot(sid, day, s))
            sid += 1
    return slots


def test_assign_slots_places_all_sessions_for_two_per_week_course():
    """A course needing 2 sessions/week gets 2 separate ALWAYS assignments,
    not just 1."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=1, sessions_per_week=2, id=100, code="IN1106")]
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 1, 3, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 100]
    assert len(ci_assignments) == 2
    assert all(a["week_rotation"] == WeekRotation.ALWAYS for a in ci_assignments)
    # No conflict, since both sessions were placed successfully.
    assert conflicts == []


def test_assign_slots_incomplete_assignment_when_not_enough_availability():
    """A course needing 2 sessions/week, but the instructor only submitted
    1 available slot -> 1 placed, 1 missing -> incomplete_assignment conflict."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=1, sessions_per_week=2, id=101, code="IN1106")]
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 101]
    assert len(ci_assignments) == 1

    incomplete = [c for c in conflicts if c["conflict_type"] == "incomplete_assignment"]
    assert len(incomplete) == 1
    assert incomplete[0]["course_instance_id"] == 101
    assert incomplete[0]["instructor_id"] == 1
    assert "IN1106" in incomplete[0]["details"]
    assert "1 missing" in incomplete[0]["details"]


def test_assign_slots_alternating_session_gets_week_a_or_week_b():
    """A course needing 3.5 sessions/week gets 3 ALWAYS sessions + 1
    alternating (WEEK_A or WEEK_B) session = 4 total."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=1, sessions_per_week=3.5, id=102, code="IN1001")]
    availability = [
        MockAvailabilityRow(i, 1, i, AvailabilityPreference.AVAILABLE)
        for i in range(1, 6)  # slots 1-5 all available
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 102]
    assert len(ci_assignments) == 4

    rotations = [a["week_rotation"] for a in ci_assignments]
    assert rotations.count(WeekRotation.ALWAYS) == 3
    alternating = [r for r in rotations if r != WeekRotation.ALWAYS]
    assert len(alternating) == 1
    assert alternating[0] in (WeekRotation.WEEK_A, WeekRotation.WEEK_B)
    assert conflicts == []


def test_assign_slots_two_alternating_courses_share_slot_on_opposite_weeks():
    """Two different 0.5-only courses for the SAME instructor, with only
    ONE common available slot left after their fixed sessions are placed:
    the first gets WEEK_A, the second falls back to WEEK_B in that same slot
    -> both placed, no conflict."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    # Two courses, each needing exactly 0.5 sessions/week (just the
    # alternating part, no fixed sessions).
    course_instances = [
        MockCourseInstance(instructor_id=1, sessions_per_week=0.5, id=200, code="IN_A"),
        MockCourseInstance(instructor_id=1, sessions_per_week=0.5, id=201, code="IN_B"),
    ]
    # Only one slot available for this instructor.
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    a200 = [a for a in assignments if a["course_instance_id"] == 200]
    a201 = [a for a in assignments if a["course_instance_id"] == 201]
    assert len(a200) == 1
    assert len(a201) == 1
    assert a200[0]["slot_id"] == 1
    assert a201[0]["slot_id"] == 1
    # One must be WEEK_A and the other WEEK_B (opposite weeks, no clash).
    rotations = {a200[0]["week_rotation"], a201[0]["week_rotation"]}
    assert rotations == {WeekRotation.WEEK_A, WeekRotation.WEEK_B}
    assert conflicts == []


def test_assign_slots_room_shared_by_two_alternating_courses_opposite_weeks():
    """Same room, only one common slot, two 0.5 courses from DIFFERENT
    instructors -> both placed in the same room/slot on opposite weeks."""
    instructors = [
        MockInstructor(1, InstructorType.FULL_TIME),
        MockInstructor(2, InstructorType.FULL_TIME),
    ]
    course_instances = [
        MockCourseInstance(instructor_id=1, sessions_per_week=0.5, id=300, code="IN_A", room_id=5),
        MockCourseInstance(instructor_id=2, sessions_per_week=0.5, id=301, code="IN_B", room_id=5),
    ]
    availability = [
        MockAvailabilityRow(1, 1, 10, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 2, 10, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    a300 = [a for a in assignments if a["course_instance_id"] == 300]
    a301 = [a for a in assignments if a["course_instance_id"] == 301]
    assert len(a300) == 1
    assert len(a301) == 1
    assert a300[0]["room_id"] == 5
    assert a301[0]["room_id"] == 5
    assert a300[0]["slot_id"] == 10
    assert a301[0]["slot_id"] == 10
    rotations = {a300[0]["week_rotation"], a301[0]["week_rotation"]}
    assert rotations == {WeekRotation.WEEK_A, WeekRotation.WEEK_B}
    assert conflicts == []


def test_assign_slots_default_sessions_per_week_one_when_no_subject():
    """If a course_instance has no subject linked (defensive case), it
    defaults to needing 1 ALWAYS session - matches old behavior."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    ci = MockCourseInstance(instructor_id=1, sessions_per_week=1, id=400, code="IN_X")
    ci.subject = None
    course_instances = [ci]
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 400]
    assert len(ci_assignments) == 1
    assert ci_assignments[0]["week_rotation"] == WeekRotation.ALWAYS
    assert conflicts == []