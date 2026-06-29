import enum


class UserRole(enum.Enum):
    ADMIN = "ADMIN"
    INSTRUCTOR = "INSTRUCTOR"


class InstructorType(enum.Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"


class AvailabilityPreference(enum.Enum):
    PREFERRED = "PREFERRED"
    AVAILABLE = "AVAILABLE"
    BUSY = "BUSY"


class AvailabilityStatus(enum.Enum):
    pending = "pending"
    used = "used"
    ignored = "ignored"


class SectionLanguage(enum.Enum):
    ENGLISH = "ENGLISH"
    FRENCH = "FRENCH"


class ProposalStatus(enum.Enum):
    draft = "draft"
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"


class AssignmentStatus(enum.Enum):
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"


class WeekRotation(enum.Enum):
    ALWAYS = "ALWAYS"
    WEEK_A = "WEEK_A"
    WEEK_B = "WEEK_B"


class SlotPeriod(enum.Enum):
    morning = "morning"
    afternoon = "afternoon"


class SessionType(enum.Enum):
    lecture = "lecture"
    lab = "lab"
    td = "td"
    tp = "tp"