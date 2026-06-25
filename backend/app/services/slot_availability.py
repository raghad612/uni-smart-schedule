"""
slot_availability
─────────────────

Business logic for "can this (instructor, room, slot, rotation) be placed
inside this proposal without clashing with anything?"

Single source of truth used by both the manual placement endpoint (POST
/proposals/{id}/assignments) and the manual move endpoint (PUT /proposals/{id}
/assignments/{aid}). Pure-Python, no HTTP / FastAPI imports - the API layer
translates the returned error string into an HTTP 409 / 400.

This module exists separately from the API file because the logic is
substantial enough (~80 lines of branching) that mixing it into route
handlers makes both harder to read.
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.models.schedule_assignment import ScheduleAssignment
from app.models.course_instance import CourseInstance
from app.models.instructor import Instructor
from app.models.room import Room
from app.models.enums import WeekRotation
from app.services.scheduling_engine import _rotations_overlap, load_committed_slots


def check_slot_available(
    db: Session,
    proposal_id: int,
    semester: str,
    slot_id: int,
    room_id: Optional[int],
    instructor_id: int,
    rotation: WeekRotation,
    exclude_assignment_id: Optional[int] = None,
) -> Optional[str]:
    """
    Decides whether (instructor_id, room_id, slot_id, rotation) can be placed
    inside the given proposal without clashing with anything.

    Returns:
        None  -- slot is free, caller may proceed.
        str   -- user-friendly explanation of WHY it's blocked, ready to surface
                 in an HTTP 409 (caller is responsible for raising). Includes
                 the instructor name / room name / semester label so the admin
                 immediately sees what's wrong and how to react.

    Checks two layers:
      1. Other assignments in THIS proposal (same draft) at the same slot,
         taking week_rotation into account (WEEK_A and WEEK_B alternate, so
         they can legitimately share a slot/room/instructor).
      2. Cross-proposal commitments from APPROVED proposals in the same
         semester (via load_committed_slots). These are conservatively
         blocked regardless of rotation, matching how the engine treats them
         during draft generation.

    Pass exclude_assignment_id when checking a MOVE so the assignment being
    moved doesn't count itself as a conflict.
    """
    rotation = rotation or WeekRotation.ALWAYS

    # ---- Layer 1: same-proposal occupants ----
    query = (
        db.query(ScheduleAssignment)
        .filter(
            ScheduleAssignment.proposal_id == proposal_id,
            ScheduleAssignment.slot_id == slot_id,
        )
    )
    if exclude_assignment_id is not None:
        query = query.filter(ScheduleAssignment.id != exclude_assignment_id)

    for other in query.all():
        other_rotation = other.week_rotation or WeekRotation.ALWAYS
        if not _rotations_overlap(rotation, other_rotation):
            continue  # WEEK_A vs WEEK_B - alternates, share is fine
        other_ci = db.query(CourseInstance).filter(
            CourseInstance.id == other.course_instance_id
        ).first()
        if other_ci and other_ci.instructor_id == instructor_id:
            instr = db.query(Instructor).filter(Instructor.id == instructor_id).first()
            name = instr.name.title() if instr else f"Instructor #{instructor_id}"
            return (
                f"{name} is already teaching another course in this slot in this draft. "
                f"Pick a different time slot, or move the other course first."
            )
        if room_id and other.room_id == room_id:
            room = db.query(Room).filter(Room.id == room_id).first()
            room_name = room.room_name if room else f"Room #{room_id}"
            return (
                f"Room {room_name} is already booked in this slot in this draft. "
                f"Pick a different room or a different time slot."
            )

    # ---- Layer 2: cross-proposal approved commitments ----
    instructor_committed, room_committed = load_committed_slots(db, semester)
    if slot_id in instructor_committed.get(instructor_id, set()):
        instr = db.query(Instructor).filter(Instructor.id == instructor_id).first()
        name = instr.name.title() if instr else f"Instructor #{instructor_id}"
        return (
            f"{name} is already scheduled in this slot in the approved {semester} "
            f"schedule (teaching another section). Try a different time slot where "
            f"they are available."
        )
    if room_id and slot_id in room_committed.get(room_id, set()):
        room = db.query(Room).filter(Room.id == room_id).first()
        room_name = room.room_name if room else f"Room #{room_id}"
        return (
            f"Room {room_name} is already booked in this slot in the approved "
            f"{semester} schedule. Pick a different room or a different time slot."
        )

    return None