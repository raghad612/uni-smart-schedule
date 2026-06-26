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

# ─── TEST 7: ASSIGN_SLOTS - DAY SPREAD (MAX 2 SESSIONS/DAY PER COURSE) ───────

def test_assign_slots_spreads_sessions_across_days_when_possible():
    """A course needing 4 sessions/week, with available slots heavily
    skewed toward one day (3 on Friday) plus other days - the engine
    should prefer spreading across days rather than stacking 3 on Friday."""
    time_slots = [
        MockTimeSlot(18, "Thursday", 3),
        MockTimeSlot(21, "Friday", 1),
        MockTimeSlot(22, "Friday", 2),
        MockTimeSlot(23, "Friday", 3),
        MockTimeSlot(7, "Tuesday", 2),
    ]
    instructors = [MockInstructor(19, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=19, sessions_per_week=4.0, id=90, code="IN1107")]
    availability = [
        MockAvailabilityRow(1, 19, 18, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 19, 21, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 19, 22, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(4, 19, 23, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(5, 19, 7, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability, time_slots=time_slots)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 90]
    assert len(ci_assignments) == 4

    day_by_slot = {ts.id: ts.day for ts in time_slots}
    day_counts = {}
    for a in ci_assignments:
        day = day_by_slot[a["slot_id"]]
        day_counts[day] = day_counts.get(day, 0) + 1

    # No single day should have more than 2 sessions for this course.
    assert all(count <= 2 for count in day_counts.values())
    # All 3 distinct days should have been used (Thursday, Tuesday, and
    # Friday only gets a 2nd session as a fallback once others are used).
    assert len(day_counts) == 3
    assert conflicts == []


def test_assign_slots_never_exceeds_max_two_per_day_even_if_incomplete():
    """If only ONE day's slots are available, a course needing 3 sessions
    can only get 2 placed (the day cap), and the 3rd is reported missing -
    never silently stacks 3 on the same day."""
    time_slots = [
        MockTimeSlot(21, "Friday", 1),
        MockTimeSlot(22, "Friday", 2),
        MockTimeSlot(23, "Friday", 3),
    ]
    instructors = [MockInstructor(19, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=19, sessions_per_week=3.0, id=91, code="IN_ONEDAY")]
    availability = [
        MockAvailabilityRow(1, 19, 21, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 19, 22, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 19, 23, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability, time_slots=time_slots)

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 91]
    assert len(ci_assignments) == 2  # capped at max_sessions_per_day=2

    incomplete = [c for c in conflicts if c["conflict_type"] == "incomplete_assignment"]
    assert len(incomplete) == 1
    assert "1 missing" in incomplete[0]["details"]


def test_assign_slots_respects_custom_max_sessions_per_day():
    """max_sessions_per_day is configurable - setting it to 1 means a
    course never gets 2 sessions on the same day even if that's the only
    way to fit them all (the rest become 'missing')."""
    time_slots = [
        MockTimeSlot(1, "Monday", 1),
        MockTimeSlot(2, "Monday", 2),
        MockTimeSlot(6, "Tuesday", 1),
    ]
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=1, sessions_per_week=2.0, id=92, code="IN_STRICT")]
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 1, 6, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(
        instructors, course_instances, availability,
        time_slots=time_slots, max_sessions_per_day=1,
    )
    ci_assignments = [a for a in assignments if a["course_instance_id"] == 92]
    day_by_slot = {ts.id: ts.day for ts in time_slots}
    days_used = [day_by_slot[a["slot_id"]] for a in ci_assignments]
    assert len(days_used) == len(set(days_used))  # no day repeated
    assert len(ci_assignments) == 2  # Monday slot 1 + Tuesday slot 6 - fits without repeating a day
    assert conflicts == []


def test_assign_slots_without_time_slots_param_is_backward_compatible():
    """Omitting time_slots (legacy callers / existing tests) disables
    day-spread checking entirely - falls back to old 'any free slot' logic."""
    instructors = [MockInstructor(1, InstructorType.FULL_TIME)]
    course_instances = [MockCourseInstance(instructor_id=1, sessions_per_week=3.0, id=93, code="IN_LEGACY")]
    availability = [
        MockAvailabilityRow(1, 1, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 1, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 1, 3, AvailabilityPreference.AVAILABLE),
    ]
    assignments, conflicts = assign_slots(instructors, course_instances, availability)
    ci_assignments = [a for a in assignments if a["course_instance_id"] == 93]
    assert len(ci_assignments) == 3
    assert conflicts == []

    # ---------- Phase 3: lock carry-forward in engine ----------

def test_optimise_gaps_skips_locked_assignments():
    """Locked assignments must NOT be swapped by the optimizer, even when a
    swap would reduce the gap score."""
    from app.services.scheduling_engine import optimise_gaps

    # Two instructors, both with sessions on Monday with a gap that a swap
    # would close. Mark both as locked - the swap should NOT happen.
    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Monday", slot_num=2),
        MockTimeSlot(id=3, day="Monday", slot_num=3),
        MockTimeSlot(id=4, day="Monday", slot_num=4),
    ]
    avail = [
        MockAvailabilityRow(1, 100, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 100, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 100, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(4, 100, 4, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(5, 200, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(6, 200, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(7, 200, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(8, 200, 4, AvailabilityPreference.AVAILABLE),
    ]

    # Instructor 100 has sessions at slots 1 and 4 (big gap)
    # Instructor 200 has sessions at slots 2 and 3 (no gap)
    # Swapping (100's slot 4) with (200's slot 2) reduces 100's gap.
    locked_assignments = [
        {"course_instance_id": 1, "slot_id": 1, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": True},
        {"course_instance_id": 2, "slot_id": 4, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": True},
        {"course_instance_id": 3, "slot_id": 2, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": True},
        {"course_instance_id": 4, "slot_id": 3, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": True},
    ]

    result = optimise_gaps(locked_assignments, time_slots, avail)

    # Verify nothing moved - same slot_ids for same course_instance_ids
    result_slots = {a["course_instance_id"]: a["slot_id"] for a in result}
    expected_slots = {1: 1, 2: 4, 3: 2, 4: 3}
    assert result_slots == expected_slots, \
        f"Locked assignments should not move. Got {result_slots}, expected {expected_slots}"


def test_optimise_gaps_swaps_when_neither_locked():
    """Sanity baseline: same setup as above but neither locked - swap SHOULD happen."""
    from app.services.scheduling_engine import optimise_gaps

    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Monday", slot_num=2),
        MockTimeSlot(id=3, day="Monday", slot_num=3),
        MockTimeSlot(id=4, day="Monday", slot_num=4),
    ]
    avail = [
        MockAvailabilityRow(1, 100, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 100, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 100, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(4, 100, 4, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(5, 200, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(6, 200, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(7, 200, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(8, 200, 4, AvailabilityPreference.AVAILABLE),
    ]
    unlocked_assignments = [
        {"course_instance_id": 1, "slot_id": 1, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": False},
        {"course_instance_id": 2, "slot_id": 4, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": False},
        {"course_instance_id": 3, "slot_id": 2, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": False},
        {"course_instance_id": 4, "slot_id": 3, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": False},
    ]
    result = optimise_gaps(unlocked_assignments, time_slots, avail)
    # The optimizer should have reduced the gap score below the original
    original_score = calculate_gap_score(unlocked_assignments, time_slots)
    new_score = calculate_gap_score(result, time_slots)
    assert new_score < original_score, \
        f"Without locks, optimizer should reduce score. {original_score} -> {new_score}"


def test_optimise_gaps_skips_swap_when_only_one_side_locked():
    """If just ONE side of a candidate swap is locked, the swap is still
    rejected. The lock-skip guard must check BOTH sides."""
    from app.services.scheduling_engine import optimise_gaps

    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Monday", slot_num=2),
        MockTimeSlot(id=3, day="Monday", slot_num=3),
        MockTimeSlot(id=4, day="Monday", slot_num=4),
    ]
    avail = [
        MockAvailabilityRow(1, 100, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 100, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(3, 100, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(4, 100, 4, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(5, 200, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(6, 200, 2, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(7, 200, 3, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(8, 200, 4, AvailabilityPreference.AVAILABLE),
    ]
    # 100's slot 4 is LOCKED. 200's slot 2 is UNLOCKED. The swap that would
    # reduce gap involves both - must be rejected.
    mixed = [
        {"course_instance_id": 1, "slot_id": 1, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": False},
        {"course_instance_id": 2, "slot_id": 4, "instructor_id": 100,
         "room_id": 10, "week_rotation": WeekRotation.ALWAYS, "locked": True},
        {"course_instance_id": 3, "slot_id": 2, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": False},
        {"course_instance_id": 4, "slot_id": 3, "instructor_id": 200,
         "room_id": 20, "week_rotation": WeekRotation.ALWAYS, "locked": False},
    ]
    result = optimise_gaps(mixed, time_slots, avail)
    # CI 2 (locked, slot 4) must still be at slot 4
    locked_assignment = next(a for a in result if a["course_instance_id"] == 2)
    assert locked_assignment["slot_id"] == 4, \
        "Locked assignment must not move even if its swap partner is unlocked"


def test_assign_slots_with_inherited_locks_skips_already_placed_sessions():
    """A 2-sessions/week course with 1 inherited lock should only get 1 more
    session placed, not 2 (which would produce 3 total)."""
    instructors = [MockInstructor(id=100, type=InstructorType.FULL_TIME)]
    ci = MockCourseInstance(id=50, instructor_id=100, sessions_per_week=2.0, code="IN1106", room_id=10)
    # 5 availability slots, plenty of room to place
    avail = [
        MockAvailabilityRow(i, 100, i, AvailabilityPreference.AVAILABLE)
        for i in range(1, 6)
    ]
    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Tuesday", slot_num=1),
        MockTimeSlot(id=3, day="Wednesday", slot_num=1),
        MockTimeSlot(id=4, day="Thursday", slot_num=1),
        MockTimeSlot(id=5, day="Friday", slot_num=1),
    ]

    # Pre-place 1 session via inheritance
    inherited = [{
        "course_instance_id": 50,
        "slot_id": 1,
        "room_id": 10,
        "instructor_id": 100,
        "week_rotation": WeekRotation.ALWAYS,
        "locked": True,
        "locked_by": 1,
        "locked_at": None,
    }]

    assignments, conflicts = assign_slots(
        instructors, [ci], avail, time_slots=time_slots,
        inherited_locks=inherited,
    )

    # Exactly 2 total: 1 inherited + 1 newly placed
    ci_assignments = [a for a in assignments if a["course_instance_id"] == 50]
    assert len(ci_assignments) == 2, \
        f"Expected 2 total assignments (1 inherited + 1 new), got {len(ci_assignments)}"

    # Verify the inherited one is preserved exactly with locked=True
    inherited_in_result = next(a for a in ci_assignments if a["slot_id"] == 1)
    assert inherited_in_result["locked"] is True

    # The new one should be unlocked
    new_in_result = next(a for a in ci_assignments if a["slot_id"] != 1)
    assert new_in_result["locked"] is False

    # No incomplete_assignment conflict should be raised
    incomplete = [c for c in conflicts if c["conflict_type"] == "incomplete_assignment"]
    assert incomplete == [], \
        f"Course is now complete via 1 inherited + 1 new, expected no incomplete conflict. Got: {incomplete}"


def test_assign_slots_with_all_sessions_inherited_skips_course_entirely():
    """If all required sessions are inherited as locks, the engine places
    nothing new for that course."""
    instructors = [MockInstructor(id=100, type=InstructorType.FULL_TIME)]
    ci = MockCourseInstance(id=50, instructor_id=100, sessions_per_week=2.0, code="IN1106", room_id=10)
    avail = [
        MockAvailabilityRow(i, 100, i, AvailabilityPreference.AVAILABLE)
        for i in range(1, 6)
    ]
    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Tuesday", slot_num=1),
        MockTimeSlot(id=3, day="Wednesday", slot_num=1),
    ]
    inherited = [
        {"course_instance_id": 50, "slot_id": 1, "room_id": 10,
         "instructor_id": 100, "week_rotation": WeekRotation.ALWAYS, "locked": True},
        {"course_instance_id": 50, "slot_id": 2, "room_id": 10,
         "instructor_id": 100, "week_rotation": WeekRotation.ALWAYS, "locked": True},
    ]

    assignments, conflicts = assign_slots(
        instructors, [ci], avail, time_slots=time_slots,
        inherited_locks=inherited,
    )

    ci_assignments = [a for a in assignments if a["course_instance_id"] == 50]
    assert len(ci_assignments) == 2, \
        f"Both required sessions already inherited; expected no new placements. Got {len(ci_assignments)}"
    # All should be locked (inherited)
    assert all(a.get("locked") for a in ci_assignments)


def test_assign_slots_inherited_lock_blocks_other_courses_in_same_slot():
    """An inherited lock at instructor X's slot S must prevent OTHER courses
    taught by instructor X from being placed at slot S in the new draft."""
    instructors = [MockInstructor(id=100, type=InstructorType.FULL_TIME)]
    ci_locked = MockCourseInstance(
        id=50, instructor_id=100, sessions_per_week=1.0, code="IN1106", room_id=10,
    )
    ci_other = MockCourseInstance(
        id=51, instructor_id=100, sessions_per_week=1.0, code="MA2202", room_id=10,
    )
    # Both courses' instructor has 2 slots available - if locked at slot 1,
    # ci_other should be forced to slot 2.
    avail = [
        MockAvailabilityRow(1, 100, 1, AvailabilityPreference.AVAILABLE),
        MockAvailabilityRow(2, 100, 2, AvailabilityPreference.AVAILABLE),
    ]
    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Tuesday", slot_num=1),
    ]
    inherited = [
        {"course_instance_id": 50, "slot_id": 1, "room_id": 10,
         "instructor_id": 100, "week_rotation": WeekRotation.ALWAYS, "locked": True},
    ]

    assignments, conflicts = assign_slots(
        instructors, [ci_locked, ci_other], avail, time_slots=time_slots,
        inherited_locks=inherited,
    )

    # ci_locked still at slot 1
    locked_one = next(a for a in assignments if a["course_instance_id"] == 50)
    assert locked_one["slot_id"] == 1
    # ci_other placed at slot 2 (slot 1 was blocked by the inherited lock)
    other_one = next(a for a in assignments if a["course_instance_id"] == 51)
    assert other_one["slot_id"] == 2, \
        f"Expected ci_other forced to slot 2 because slot 1 was occupied by inherited lock. Got slot {other_one['slot_id']}"


def test_assign_slots_emits_locked_false_on_engine_placements():
    """Every engine-placed assignment must have locked=False (so save_proposal
    persists it correctly)."""
    instructors = [MockInstructor(id=100, type=InstructorType.FULL_TIME)]
    ci = MockCourseInstance(id=50, instructor_id=100, sessions_per_week=2.0, code="IN1106", room_id=10)
    avail = [
        MockAvailabilityRow(i, 100, i, AvailabilityPreference.AVAILABLE)
        for i in range(1, 4)
    ]
    time_slots = [
        MockTimeSlot(id=1, day="Monday", slot_num=1),
        MockTimeSlot(id=2, day="Tuesday", slot_num=1),
    ]

    assignments, _ = assign_slots(instructors, [ci], avail, time_slots=time_slots)
    assert len(assignments) == 2
    for a in assignments:
        assert "locked" in a, "Every assignment dict must have a 'locked' key"
        assert a["locked"] is False, "Engine-placed assignments must be born unlocked"