from app.services.scheduling_engine import (
    calculate_gap_score,
    sort_instructors,
    detect_conflicts,
)
from app.models.enums import InstructorType, AvailabilityPreference

# ─── MOCK CLASSES ─────────────────────────────────────────────────────────────

class MockInstructor:
    def __init__(self, id, type, required_sessions):
        self.id = id
        self.type = type
        self.required_sessions = required_sessions


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
        MockInstructor(1, InstructorType.FULL_TIME, 4),
        MockInstructor(2, InstructorType.PART_TIME, 2),
        MockInstructor(3, InstructorType.FULL_TIME, 3),
        MockInstructor(4, InstructorType.PART_TIME, 3),
    ]
    result = sort_instructors(instructors)
    types = [i.type for i in result]
    part_time_indices = [i for i, t in enumerate(types) if t == InstructorType.PART_TIME]
    full_time_indices = [i for i, t in enumerate(types) if t == InstructorType.FULL_TIME]
    assert max(part_time_indices) < min(full_time_indices)


def test_sort_within_group_by_required_sessions_desc():
    """Within each type group, more required_sessions comes first."""
    instructors = [
        MockInstructor(1, InstructorType.PART_TIME, 2),
        MockInstructor(2, InstructorType.PART_TIME, 4),
        MockInstructor(3, InstructorType.FULL_TIME, 3),
        MockInstructor(4, InstructorType.FULL_TIME, 5),
    ]
    result = sort_instructors(instructors)
    # First two should be PART_TIME with id=2 (4 sessions) before id=1 (2 sessions)
    assert result[0].id == 2
    assert result[1].id == 1
    # Last two should be FULL_TIME with id=4 (5 sessions) before id=3 (3 sessions)
    assert result[2].id == 4
    assert result[3].id == 3


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