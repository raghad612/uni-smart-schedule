import math

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


def load_data(db: Session, semester: str, period: str) -> tuple[list, list, list]:
    """
    semester: full string e.g. "2024-2" — used to filter availability
    period:   just "1" or "2"           — used to filter course_instances
    """
    instructors = db.query(Instructor).all()
    course_instances = db.query(CourseInstance).filter(
        CourseInstance.semester == period
    ).all()
    availability = db.query(Availability).filter(
        Availability.semester == semester
    ).all()
    return instructors, course_instances, availability


def load_committed_slots(db: Session, semester: str) -> tuple[dict, dict]:
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
            ci = db.query(CourseInstance).filter(
                CourseInstance.id == a.course_instance_id
            ).first()
            if ci:
                instructor_committed.setdefault(ci.instructor_id, set()).add(a.slot_id)
            if a.room_id:
                room_committed.setdefault(a.room_id, set()).add(a.slot_id)

    return instructor_committed, room_committed


def compute_required_sessions(course_instances: list) -> dict[int, int]:
    """
    Derives each instructor's required sessions/week from the courses they
    teach this semester, instead of a manually-entered field.

    For each course_instance, adds its subject's sessions_per_week (a float,
    e.g. 3.5 for a course that meets 3 times every week + 1 time every other
    week) to that instructor's running total. The totals are then rounded UP
    (ceil) — a 3.5 total becomes 4, because the instructor still needs a
    reserved slot every week for the biweekly session (it alternates
    WEEK_A/WEEK_B in the same time slot).

    Returns: {instructor_id: required_sessions_per_week (int)}
    """
    totals: dict[int, float] = {}
    for ci in course_instances:
        subject = ci.subject
        if subject is None:
            continue
        totals[ci.instructor_id] = totals.get(ci.instructor_id, 0.0) + subject.sessions_per_week
    return {instructor_id: math.ceil(total) for instructor_id, total in totals.items()}


def validate_availability(
    instructors: list,
    availability: list,
    course_instances: list,
) -> list:
    required_sessions = compute_required_sessions(course_instances)
    errors = []
    for instructor in instructors:
        required = required_sessions.get(instructor.id)
        if required is None:
            # Instructor has no course_instances this semester — nothing to validate
            continue
        submitted = [
            a for a in availability
            if a.instructor_id == instructor.id
            and a.preference != AvailabilityPreference.BUSY
        ]
        if len(submitted) < required:
            missing = required - len(submitted)
            errors.append({
                "instructor_id": instructor.id,
                "issue": f"missing {missing} slots"
            })
    return errors


def sort_instructors(instructors: list, course_instances: list) -> list:
    required_sessions = compute_required_sessions(course_instances)

    def sort_key(inst):
        type_order = 0 if inst.type == InstructorType.PART_TIME else 1
        return (type_order, -required_sessions.get(inst.id, 0))
    return sorted(instructors, key=sort_key)


def assign_slots(
    sorted_instructors: list,
    course_instances: list,
    availability: list,
    instructor_committed: dict = None,
    room_committed: dict = None,
) -> tuple[list, list]:
    if instructor_committed is None:
        instructor_committed = {}
    if room_committed is None:
        room_committed = {}

    assignments = []
    conflicts = []

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

        instr_blocked = instructor_committed.get(instructor_id, set())
        room_blocked = room_committed.get(room_id, set()) if room_id else set()

        instr_used = used_instructor_slots.setdefault(instructor_id, set())
        room_used = used_room_slots.setdefault(room_id, set()) if room_id else set()

        assigned = False
        for avail_row in candidates:
            slot_id = avail_row.slot_id

            if slot_id in instr_blocked:
                continue
            if room_id and slot_id in room_blocked:
                continue
            if slot_id in instr_used:
                continue
            if room_id and slot_id in room_used:
                continue

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


def optimise_gaps(
    assignments: list,
    time_slots: list,
    availability: list,
    instructor_committed: dict = None,
    room_committed: dict = None,
) -> list:
    if instructor_committed is None:
        instructor_committed = {}
    if room_committed is None:
        room_committed = {}

    # Build: instructor_id -> set of slot_ids they actually offered (not BUSY)
    avail_slots_by_instructor: dict[int, set] = {}
    for a in availability:
        if a.preference != AvailabilityPreference.BUSY:
            avail_slots_by_instructor.setdefault(a.instructor_id, set()).add(a.slot_id)

    best = list(assignments)
    best_score = calculate_gap_score(best, time_slots)

    improved = True
    while improved:
        improved = False
        for i in range(len(best)):
            for j in range(i + 1, len(best)):
                if best[i]["instructor_id"] == best[j]["instructor_id"]:
                    continue

                new_i_slot = best[j]["slot_id"]
                new_j_slot = best[i]["slot_id"]

                # SAFETY GUARD: each instructor must actually be available for the
                # slot they would receive - never optimise someone into a slot they
                # did not submit (or marked BUSY).
                if new_i_slot not in avail_slots_by_instructor.get(best[i]["instructor_id"], set()):
                    continue
                if new_j_slot not in avail_slots_by_instructor.get(best[j]["instructor_id"], set()):
                    continue

                candidate = list(best)
                candidate[i] = {**best[i], "slot_id": new_i_slot}
                candidate[j] = {**best[j], "slot_id": new_j_slot}

                if _has_conflict(candidate, instructor_committed, room_committed):
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


def _has_conflict(
    assignments: list,
    instructor_committed: dict = None,
    room_committed: dict = None,
) -> bool:
    instructor_committed = instructor_committed or {}
    room_committed = room_committed or {}

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
        if slot_id in instructor_committed.get(instr, set()):
            return True

        room = a.get("room_id")
        if room:
            if slot_id in room_slots.setdefault(room, set()):
                return True
            room_slots[room].add(slot_id)
            if slot_id in room_committed.get(room, set()):
                return True

    return False


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
            instructor_id=c.get("instructor_id"),
            course_instance_id=c.get("course_instance_id"),
            details=c.get("details"),
        )
        db.add(row)

    db.commit()
    return proposal.id