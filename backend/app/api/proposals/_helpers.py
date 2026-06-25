"""
Shared helpers for the proposals package. Kept small on purpose - if this file
grows beyond a couple of utilities, the right move is to promote individual
helpers into their own focused service modules.
"""
from sqlalchemy.orm import Session

from app.models.conflict_log import ConflictLog
from app.models.instructor import Instructor
from app.models.course_instance import CourseInstance
from app.models.subject import Subject
from app.models.section import Section
from app.models.time_slot import TimeSlot
from app.schemas.proposals import ConflictResponse


def enrich_conflict(conflict: ConflictLog, db: Session) -> ConflictResponse:
    """Build a ConflictResponse with human-readable instructor/subject/slot info.

    The raw ConflictLog row only stores foreign keys. The frontend needs names
    and labels to render the conflict cards, so we look them up here once per
    response. For a typical proposal with <20 conflicts this is cheap; if it
    ever becomes a bottleneck, fold the joins into the conflict query itself.
    """
    instructor_name = None
    subject_name = None
    section_label = None
    slot_label = None

    if conflict.instructor_id:
        instr = db.query(Instructor).filter(Instructor.id == conflict.instructor_id).first()
        if instr:
            instructor_name = instr.name.title()

    if conflict.course_instance_id:
        ci = db.query(CourseInstance).filter(CourseInstance.id == conflict.course_instance_id).first()
        if ci:
            subj = db.query(Subject).filter(Subject.id == ci.subject_id).first()
            if subj:
                subject_name = subj.name
            sec = db.query(Section).filter(Section.id == ci.section_id).first()
            if sec:
                section_label = sec.group_label

    if conflict.slot_id:
        ts = db.query(TimeSlot).filter(TimeSlot.id == conflict.slot_id).first()
        if ts:
            slot_label = f"{ts.day} {ts.start_time}–{ts.end_time}"

    return ConflictResponse(
        id=conflict.id,
        slot_id=conflict.slot_id,
        conflict_type=conflict.conflict_type,
        instructor_id=conflict.instructor_id,
        course_instance_id=conflict.course_instance_id,
        details=conflict.details,
        resolution=conflict.resolution,
        resolved_by=conflict.resolved_by,
        detected_at=conflict.detected_at,
        instructor_name=instructor_name,
        subject_name=subject_name,
        section_label=section_label,
        slot_label=slot_label,
    )