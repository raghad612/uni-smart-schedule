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


def load_inherited_locks(db: Session, semester: str) -> tuple[list, list, int | None]:
    """
    Phase 3 / Option B - lock carry-forward.

    Find the MOST RECENT draft proposal for `semester` and pull its locked
    assignments. Validate each one against current world state so we don't
    inherit references to deleted courses, deactivated instructors, or
    missing rooms.

    Returns a 3-tuple:
      valid_locks: list of dicts shaped like engine assignments, ready to be
                   pre-placed before the greedy assignment loop runs. Each
                   dict carries: course_instance_id, slot_id, room_id,
                   instructor_id, week_rotation, locked=True, locked_by,
                   locked_at, original_assignment_id (audit trail back to
                   the source draft).
      carry_errors: list of dicts shaped {"reason": str, "details": str,
                    "course_instance_id": int|None, "instructor_id": int|None,
                    "slot_id": int|None}. The scheduling endpoint surfaces
                    these as `lock_carried_invalid` conflict_log rows in the
                    new proposal so the admin sees what couldn't be carried
                    over and why.
      source_draft_id: id of the draft we inherited from, or None if no
                      draft existed for this semester.

    Notes:
      - We only inherit from DRAFT proposals. Approved proposals are already
        handled by load_committed_slots and are immutable, so their "locks"
        are implicit.
      - "Most recent" = highest created_at. The Phase 3 design decision was
        to inherit from the most recent draft only (not the union of all
        drafts), to avoid contradictions when multiple drafts have conflicting
        locks for the same course.
      - Validation drops locks whose course_instance, instructor, or room has
        been deleted, or whose instructor was deactivated. Slots are never
        validated because time_slots is seeded once and never mutated.
    """
    most_recent = (
        db.query(ScheduleProposal)
        .filter(
            ScheduleProposal.semester == semester,
            ScheduleProposal.status == ProposalStatus.draft,
        )
        .order_by(ScheduleProposal.created_at.desc(), ScheduleProposal.id.desc())
        .first()
    )

    if not most_recent:
        return [], [], None

    locked_assignments = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.proposal_id == most_recent.id,
            ScheduleAssignment.locked == True,  # noqa: E712 - SQLAlchemy needs ==, not `is`
        )
        .all()
    )

    valid_locks: list = []
    carry_errors: list = []

    for a in locked_assignments:
        # Validate course_instance exists. If the admin deleted IN_EDGE_A
        # from the catalog after locking it, the reference is dead.
        ci = db.query(CourseInstance).filter(
            CourseInstance.id == a.course_instance_id
        ).first()
        if ci is None:
            carry_errors.append({
                "reason": "course_deleted",
                "details": (
                    f"Locked assignment in Draft #{most_recent.id} pointed to a "
                    f"course_instance that no longer exists. The lock was dropped "
                    f"during schedule generation."
                ),
                "course_instance_id": a.course_instance_id,
                "instructor_id": None,
                "slot_id": a.slot_id,
            })
            continue

        # Validate instructor exists AND is still active. A deactivated
        # instructor shouldn't have new sessions scheduled, even if locked.
        instructor = ci.instructor  # eager-loaded via relationship
        if instructor is None:
            carry_errors.append({
                "reason": "instructor_deleted",
                "details": (
                    f"Locked assignment in Draft #{most_recent.id} pointed to an "
                    f"instructor that no longer exists. The lock was dropped."
                ),
                "course_instance_id": ci.id,
                "instructor_id": None,
                "slot_id": a.slot_id,
            })
            continue
        if not instructor.is_active:
            carry_errors.append({
                "reason": "instructor_inactive",
                "details": (
                    f"Locked assignment for {instructor.name.title()} in Draft "
                    f"#{most_recent.id} was dropped because the instructor is no "
                    f"longer active."
                ),
                "course_instance_id": ci.id,
                "instructor_id": instructor.id,
                "slot_id": a.slot_id,
            })
            continue

        # Validate room exists.
        if a.room_id is not None and a.room is None:
            subject_code = ci.subject.code if ci.subject else f"course #{ci.id}"
            carry_errors.append({
                "reason": "room_deleted",
                "details": (
                    f"Locked assignment for {subject_code} in Draft "
                    f"#{most_recent.id} pointed to a room that no longer exists. "
                    f"The lock was dropped."
                ),
                "course_instance_id": ci.id,
                "instructor_id": instructor.id,
                "slot_id": a.slot_id,
            })
            continue

        valid_locks.append({
            "course_instance_id": a.course_instance_id,
            "slot_id": a.slot_id,
            "room_id": a.room_id,
            "instructor_id": ci.instructor_id,
            "week_rotation": a.week_rotation or WeekRotation.ALWAYS,
            "locked": True,
            "locked_by": a.locked_by,
            "locked_at": a.locked_at,
            # Audit pointer back to the source draft so future debugging
            # (or a possible UI "show source" feature) can trace the
            # provenance of a locked assignment.
            "_inherited_from_proposal_id": most_recent.id,
            "_inherited_from_assignment_id": a.id,
        })

    return valid_locks, carry_errors, most_recent.id


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
    time_slots: list = None,
    instructor_committed: dict = None,
    room_committed: dict = None,
    max_sessions_per_day: int = 2,
) -> tuple[list, list]:
    if instructor_committed is None:
        instructor_committed = {}
    if room_committed is None:
        room_committed = {}
    if time_slots is None:
        time_slots = []

    slot_day: dict[int, str] = {ts.id: ts.day for ts in time_slots}

    assignments = []
    conflicts = []

    # used_instructor_slots[instructor_id][slot_id] = list of rotations already placed there
    used_instructor_slots: dict[int, dict[int, list]] = {}
    used_room_slots: dict[int, dict[int, list]] = {}

    instructor_order = {inst.id: idx for idx, inst in enumerate(sorted_instructors)}
    sorted_instances = sorted(
        course_instances,
        key=lambda ci: instructor_order.get(ci.instructor_id, 9999)
    )

    avail_by_instructor: dict[int, list] = {}
    for a in availability:
        if a.preference != AvailabilityPreference.BUSY:
            avail_by_instructor.setdefault(a.instructor_id, []).append(a)

    def slot_is_free(used_map, key, slot_id, rotation, committed_map, committed_key):
        for existing_rotation in used_map.get(key, {}).get(slot_id, []):
            if _rotations_overlap(existing_rotation, rotation):
                return False
        if committed_key is not None and slot_id in committed_map.get(committed_key, set()):
            return False
        return True

    def mark_used(used_map, key, slot_id, rotation):
        used_map.setdefault(key, {}).setdefault(slot_id, []).append(rotation)

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

        # How many sessions/week does this course_instance need?
        # e.g. 2.0 -> 2 fixed (ALWAYS) sessions.
        # 3.5 -> 3 fixed (ALWAYS) sessions + 1 alternating (WEEK_A/WEEK_B) session.
        sessions_per_week = ci.subject.sessions_per_week if ci.subject else 1.0
        fixed_sessions = int(sessions_per_week)
        has_alternating = (sessions_per_week - fixed_sessions) > 1e-9
        sessions_needed = fixed_sessions + (1 if has_alternating else 0)

        used_slot_ids_this_ci: set = set()
        used_days_this_ci: dict[str, int] = {}
        placed = 0

        def try_place(rotation, allow_repeat_day):
            """
            Tries to place one session. If allow_repeat_day is False, only
            considers days this course hasn't used yet this week (spreads
            sessions across different days). If True, also allows a day
            already used, as long as it hasn't hit max_sessions_per_day yet
            (fallback when there aren't enough distinct days available).
            """
            nonlocal placed
            for avail_row in candidates:
                slot_id = avail_row.slot_id
                if slot_id in used_slot_ids_this_ci:
                    continue

                day = slot_day.get(slot_id)
                day_count = used_days_this_ci.get(day, 0) if day is not None else 0
                if day is not None:
                    if day_count >= max_sessions_per_day:
                        continue
                    if not allow_repeat_day and day_count > 0:
                        continue

                if not slot_is_free(used_instructor_slots, instructor_id, slot_id, rotation, instructor_committed, instructor_id):
                    continue
                if room_id and not slot_is_free(used_room_slots, room_id, slot_id, rotation, room_committed, room_id):
                    continue

                mark_used(used_instructor_slots, instructor_id, slot_id, rotation)
                if room_id:
                    mark_used(used_room_slots, room_id, slot_id, rotation)
                used_slot_ids_this_ci.add(slot_id)
                if day is not None:
                    used_days_this_ci[day] = day_count + 1

                assignments.append({
                    "course_instance_id": ci.id,
                    "slot_id": slot_id,
                    "room_id": room_id,
                    "instructor_id": instructor_id,
                    "avail_id": avail_row.id,
                    "week_rotation": rotation,
                })
                placed += 1
                return True
            return False

        # Place the fixed (every-week) sessions first - spread across
        # different days where possible (Pass 1), falling back to a
        # second session on the same day only if no fresh day is
        # available (Pass 2), and never exceeding max_sessions_per_day.
        for _ in range(fixed_sessions):
            if not try_place(WeekRotation.ALWAYS, allow_repeat_day=False):
                try_place(WeekRotation.ALWAYS, allow_repeat_day=True)

        # Place the alternating session, if this course has one - try
        # WEEK_A first, fall back to WEEK_B (lets a different alternating
        # course share the same slot/room on the opposite week). Also
        # subject to the same day-spread rule as the fixed sessions.
        if has_alternating:
            placed_alt = try_place(WeekRotation.WEEK_A, allow_repeat_day=False) or \
                         try_place(WeekRotation.WEEK_A, allow_repeat_day=True)
            if not placed_alt:
                try_place(WeekRotation.WEEK_B, allow_repeat_day=False) or \
                    try_place(WeekRotation.WEEK_B, allow_repeat_day=True)

        if placed < sessions_needed:
            missing = sessions_needed - placed
            course_label = ci.subject.code if ci.subject else f"course_instance #{ci.id}"
            conflicts.append({
                "course_instance_id": ci.id,
                "instructor_id": instructor_id,
                "conflict_type": "incomplete_assignment",
                "slot_id": None,
                "details": (
                    f"{course_label} needs {sessions_needed} session(s)/week, "
                    f"but only {placed} could be scheduled ({missing} missing). "
                    f"Assign the remaining session(s) manually."
                ),
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


def _rotations_overlap(rotation_a, rotation_b) -> bool:
    """
    Returns True if two assignments with these week_rotation values could
    ever land on the same real-world week (i.e. would actually clash).

    - ALWAYS happens every week, so it clashes with anything in the same slot.
    - WEEK_A only clashes with ALWAYS or another WEEK_A.
    - WEEK_B only clashes with ALWAYS or another WEEK_B.
    - WEEK_A and WEEK_B never clash with each other - they alternate, so the
      same slot/room/instructor can be shared by one WEEK_A course and one
      WEEK_B course.
    """
    if rotation_a == WeekRotation.ALWAYS or rotation_b == WeekRotation.ALWAYS:
        return True
    return rotation_a == rotation_b


def _find_overlapping(group: list) -> list:
    """
    Given a list of assignments that all share the same slot (and same
    instructor, or same room), returns the subset that actually clash with
    at least one other entry once week_rotation is taken into account.
    Assignments without a "week_rotation" key are treated as ALWAYS.
    """
    overlapping = []
    for i, a in enumerate(group):
        rotation_a = a.get("week_rotation", WeekRotation.ALWAYS)
        for j, b in enumerate(group):
            if i == j:
                continue
            rotation_b = b.get("week_rotation", WeekRotation.ALWAYS)
            if _rotations_overlap(rotation_a, rotation_b):
                overlapping.append(a)
                break
    return overlapping


def _has_conflict(
    assignments: list,
    instructor_committed: dict = None,
    room_committed: dict = None,
) -> bool:
    instructor_committed = instructor_committed or {}
    room_committed = room_committed or {}

    instructor_slots: dict[tuple, list] = {}
    room_slots: dict[tuple, list] = {}

    for a in assignments:
        slot_id = a["slot_id"]
        if slot_id is None:
            continue
        rotation = a.get("week_rotation", WeekRotation.ALWAYS)

        instr = a["instructor_id"]
        instr_key = (instr, slot_id)
        for existing_rotation in instructor_slots.setdefault(instr_key, []):
            if _rotations_overlap(existing_rotation, rotation):
                return True
        instructor_slots[instr_key].append(rotation)

        # Approved-schedule slots remain conservatively blocked regardless of
        # rotation (see Q4 - not yet rotation-aware).
        if slot_id in instructor_committed.get(instr, set()):
            return True

        room = a.get("room_id")
        if room:
            room_key = (room, slot_id)
            for existing_rotation in room_slots.setdefault(room_key, []):
                if _rotations_overlap(existing_rotation, rotation):
                    return True
            room_slots[room_key].append(rotation)

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
        clashing = _find_overlapping(group)
        if clashing:
            conflicts.append({
                "slot_id": slot_id,
                "conflict_type": "instructor_double_booked",
                "instructor_id": instructor_id,
                "course_instance_id": clashing[0]["course_instance_id"],
                "details": f"Instructor {instructor_id} has {len(clashing)} overlapping sessions in slot {slot_id}",
            })

    for (room_id, slot_id), group in room_slots.items():
        clashing = _find_overlapping(group)
        if clashing:
            conflicts.append({
                "slot_id": slot_id,
                "conflict_type": "room_double_booked",
                "instructor_id": clashing[0]["instructor_id"],
                "course_instance_id": clashing[0]["course_instance_id"],
                "details": f"Room {room_id} has {len(clashing)} overlapping sessions in slot {slot_id}",
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
            week_rotation=a.get("week_rotation", WeekRotation.ALWAYS),
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