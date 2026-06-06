from sqlalchemy.orm import Session
from app.models.instructor import Instructor
from app.models.course_instance import CourseInstance
from app.models.availability import Availability
from app.models.schedule_proposal import ScheduleProposal
from app.models.schedule_assignment import ScheduleAssignment
from app.models.conflict_log import ConflictLog
from app.models.enums import (
    InstructorType,
    AvailabilityPreference,
    ProposalStatus,
    AssignmentStatus,
    WeekRotation,
)


# ── FUNCTION 1 ────────────────────────────────────────────────────────────────

def load_data(db: Session, semester: str) -> tuple[list, list, list]:
    instructors = db.query(Instructor).all()
    course_instances = db.query(CourseInstance).filter(
        CourseInstance.semester == semester
    ).all()
    availability = db.query(Availability).filter(
        Availability.semester == semester
    ).all()
    return instructors, course_instances, availability


# ── FUNCTION 1b ───────────────────────────────────────────────────────────────
# Load slots already committed in approved proposals for this semester.
# These slots are blocked — the same instructor or room cannot be reused.

def load_committed_slots(db: Session, semester: str) -> tuple[dict, dict]:
    """
    Returns:
        instructor_committed: {instructor_id: set of slot_ids already assigned}
        room_committed:       {room_id: set of slot_ids already assigned}
    """
    approved = db.query(ScheduleProposal).filter(
        ScheduleProposal.semester == semester,
        ScheduleProposal.status == ProposalStatus.approved,
    ).all()

    instructor_committed: dict[int, set] = {}
    room_committed: dict[int, set] = {}

    for proposal in approved:
        assignments = db.query(ScheduleAssignment).filter(
            ScheduleAssignment.proposal_id == proposal.id
        ).all()
        for a in assignments:
            # Get instructor_id via course_instance
            ci = db.query(CourseInstance).filter(
                CourseInstance.id == a.course_instance_id
            ).first()
            if ci:
                instructor_committed.setdefault(ci.instructor_id, set()).add(a.slot_id)
            if a.room_id:
                room_committed.setdefault(a.room_id, set()).add(a.slot_id)

    return instructor_committed, room_committed


# ── FUNCTION 2 ────────────────────────────────────────────────────────────────

def validate_availability(
    instructors: list,
    availability: list,
    course_instances: list,
) -> list:
    instructor_ids_with_courses = {ci.instructor_id for ci in course_instances}
    errors = []
    for instructor in instructors:
        if instructor.id not in instructor_ids_with_courses:
            continue
        submitted = [
            a for a in availability
            if a.instructor_id == instructor.id
            and a.preference != AvailabilityPreference.BUSY
        ]
        if len(submitted) < instructor.required_sessions:
            missing = instructor.required_sessions - len(submitted)
            errors.append({
                "instructor_id": instructor.id,
                "issue": f"missing {missing} slots"
            })
    return errors


# ── FUNCTION 3 ────────────────────────────────────────────────────────────────

def sort_instructors(instructors: list) -> list:
    def sort_key(inst):
        type_order = 0 if inst.type == InstructorType.PART_TIME else 1
        return (type_order, -inst.required_sessions)
    return sorted(instructors, key=sort_key)


# ── FUNCTION 4 ────────────────────────────────────────────────────────────────

def assign_slots(
    sorted_instructors: list,
    course_instances: list,
    availability: list,
    instructor_committed: dict = None,
    room_committed: dict = None,
) -> tuple[list, list]:
    """
    instructor_committed: slots already used in approved proposals {instructor_id: set}
    room_committed:       slots already used in approved proposals {room_id: set}
    """
    if instructor_committed is None:
        instructor_committed = {}
    if room_committed is None:
        room_committed = {}

    assignments = []
    conflicts = []

    # Tracks slots used within THIS run (not yet approved, but already assigned
    # in this batch so we don't double-book within the same generation)
    used_instructor_slots: dict[int, set] = {}
    used_room_slots: dict[int, set] = {}

    instructor_order = {inst.id: idx for idx, inst in enumerate(sorted_instructors)}
    sorted_instances = sorted(
        course_instances,
        key=lambda ci: instructor_order.get(ci.instructor_id, 9999)
    )

    avail_by_instructor: dict[int, list] = {}
    for a in availability:
        if a.preference != AvailabilityPreference.BUSY:
            avail_by_instructor.setdefault(a.instructor_id, []).append(a)

    for ci in sorted_instances:
        instructor_avail = avail_by_instructor.get(ci.instructor_id, [])

        preferred = [
            a for a in instructor_avail
            if a.preference == AvailabilityPreference.PREFERRED
        ]
        available = [
            a for a in instructor_avail
            if a.preference == AvailabilityPreference.AVAILABLE
        ]
        candidates = preferred + available

        room_id = ci.section.default_room_id if ci.section else None
        instructor_id = ci.instructor_id

        # Slots blocked by approved proposals
        instr_blocked = instructor_committed.get(instructor_id, set())
        room_blocked = room_committed.get(room_id, set()) if room_id else set()

        # Slots used so far in this run
        instr_used = used_instructor_slots.setdefault(instructor_id, set())
        room_used = used_room_slots.setdefault(room_id, set()) if room_id else set()

        assigned = False
        for avail_row in candidates:
            slot_id = avail_row.slot_id

            # Skip if blocked by an approved proposal
            if slot_id in instr_blocked:
                continue
            if room_id and slot_id in room_blocked:
                continue

            # Skip if already used in this run
            if slot_id in instr_used:
                continue
            if room_id and slot_id in room_used:
                continue

            # Assign
            instr_used.add(slot_id)
            if room_id:
                room_used.add(slot_id)
                used_room_slots[room_id] = room_used

            assignments.append({
                "course_instance_id": ci.id,
                "slot_id": slot_id,
                "room_id": room_id,
                "instructor_id": instructor_id,
                "avail_id": avail_row.id,
            })
            assigned = True
            break

        if not assigned:
            # Build a human-readable details message for the conflict log
            reason = "No available slots submitted"
            if instructor_avail:
                reason = "All submitted slots are already taken by approved proposals or this run"
            conflicts.append({
                "course_instance_id": ci.id,
                "instructor_id": instructor_id,
                "conflict_type": "no_available_slot",
                "slot_id": None,
                "details": f"{reason} for course instance #{ci.id} (instructor_id={instructor_id})",
            })

    return assignments, conflicts


# ── FUNCTION 5 ────────────────────────────────────────────────────────────────

def calculate_gap_score(assignments: list, time_slots: list) -> int:
    slot_info: dict[int, tuple[int, int]] = {}
    for ts in time_slots:
        slot_info[ts.id] = (ts.slot_num, ts.day)

    by_instructor_day: dict[tuple, list] = {}
    for a in assignments:
        info = slot_info.get(a["slot_id"])
        if not info:
            continue
        slot_num, day = info
        key = (a["instructor_id"], day)
        by_instructor_day.setdefault(key, []).append(slot_num)

    total_gap = 0
    for slot_nums in by_instructor_day.values():
        if len(slot_nums) < 2:
            continue
        gap = (max(slot_nums) - min(slot_nums)) - (len(slot_nums) - 1)
        total_gap += gap

    return total_gap


# ── FUNCTION 6 ────────────────────────────────────────────────────────────────

def optimise_gaps(assignments: list, time_slots: list) -> list:
    best = list(assignments)
    best_score = calculate_gap_score(best, time_slots)

    improved = True
    while improved:
        improved = False
        for i in range(len(best)):
            for j in range(i + 1, len(best)):
                if best[i]["instructor_id"] == best[j]["instructor_id"]:
                    continue

                candidate = list(best)
                candidate[i] = {**best[i], "slot_id": best[j]["slot_id"]}
                candidate[j] = {**best[j], "slot_id": best[i]["slot_id"]}

                if _has_conflict(candidate):
                    continue

                score = calculate_gap_score(candidate, time_slots)
                if score < best_score:
                    best = candidate
                    best_score = score
                    improved = True
                    break
            if improved:
                break

    return best


def _has_conflict(assignments: list) -> bool:
    instructor_slots: dict[int, set] = {}
    room_slots: dict[int, set] = {}

    for a in assignments:
        slot_id = a["slot_id"]
        if slot_id is None:
            continue

        instr = a["instructor_id"]
        if slot_id in instructor_slots.setdefault(instr, set()):
            return True
        instructor_slots[instr].add(slot_id)

        room = a.get("room_id")
        if room:
            if slot_id in room_slots.setdefault(room, set()):
                return True
            room_slots[room].add(slot_id)

    return False


# ── FUNCTION 7 ────────────────────────────────────────────────────────────────

def detect_conflicts(assignments: list) -> list:
    conflicts = []
    instructor_slots: dict[tuple, list] = {}
    room_slots: dict[tuple, list] = {}

    for a in assignments:
        slot_id = a["slot_id"]
        if slot_id is None:
            continue

        instr_key = (a["instructor_id"], slot_id)
        instructor_slots.setdefault(instr_key, []).append(a)

        room = a.get("room_id")
        if room:
            room_key = (room, slot_id)
            room_slots.setdefault(room_key, []).append(a)

    for (instructor_id, slot_id), group in instructor_slots.items():
        if len(group) > 1:
            conflicts.append({
                "slot_id": slot_id,
                "conflict_type": "instructor_double_booked",
                "instructor_id": instructor_id,
                "course_instance_id": group[0]["course_instance_id"],
                "details": f"Instructor {instructor_id} assigned {len(group)} times in slot {slot_id}",
            })

    for (room_id, slot_id), group in room_slots.items():
        if len(group) > 1:
            conflicts.append({
                "slot_id": slot_id,
                "conflict_type": "room_double_booked",
                "instructor_id": group[0]["instructor_id"],
                "course_instance_id": group[0]["course_instance_id"],
                "details": f"Room {room_id} assigned {len(group)} times in slot {slot_id}",
            })

    return conflicts


# ── FUNCTION 8 ────────────────────────────────────────────────────────────────

def save_proposal(
    db: Session,
    assignments: list,
    conflicts: list,
    semester: str,
    created_by: int,
    notes: str,
) -> int:
    proposal = ScheduleProposal(
        semester=semester,
        status=ProposalStatus.draft,
        created_by=created_by,
        notes=notes,
    )
    db.add(proposal)
    db.flush()

    for a in assignments:
        row = ScheduleAssignment(
            proposal_id=proposal.id,
            course_instance_id=a["course_instance_id"],
            slot_id=a["slot_id"],
            room_id=a.get("room_id"),
            week_rotation=WeekRotation.ALWAYS,
            status=AssignmentStatus.proposed,
        )
        db.add(row)

    for c in conflicts:
        row = ConflictLog(
            proposal_id=proposal.id,
            slot_id=c.get("slot_id"),
            conflict_type=c["conflict_type"],
            # Save instructor and course instance for display in conflict viewer
            instructor_id=c.get("instructor_id"),
            course_instance_id=c.get("course_instance_id"),
            details=c.get("details"),
        )
        db.add(row)

    db.commit()
    return proposal.id