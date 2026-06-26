# System Architecture

## Overview

SmartSchedule is a full-stack web application with a React frontend, a FastAPI backend, and a PostgreSQL database. The three layers communicate over a REST API secured with JWT authentication.
[React Frontend] ──HTTP/JSON──> [FastAPI Backend] ──SQLAlchemy──> [PostgreSQL]
Vercel                          Railway                        Railway

---

## Database schema

12 tables in dependency order:

| Table | Purpose |
|---|---|
| `users` | Login identity — email, password hash, role (ADMIN or INSTRUCTOR) |
| `instructors` | Instructor profile — name, type (FULL_TIME / PART_TIME), required sessions |
| `rooms` | Physical rooms — name, capacity, type |
| `sections` | University sections — year level, language (ENGLISH / FRENCH), group label |
| `subjects` | Academic subjects — code, name, credits, sessions per week |
| `parallel_groups` | Groups of course instances that must run at the same time |
| `course_instances` | One row = one class — links subject, section, instructor, semester |
| `time_slots` | Static reference — 25 rows (5 days × 5 slots), seeded once, never changed |
| `availability` | Instructor input — which slots they can teach and with what preference |
| `schedule_proposals` | Versioned container for one engine run — enables simulation mode |
| `schedule_assignments` | Engine output — one row per assigned class |
| `conflict_log` | Audit trail — records every conflict detected by the engine |
### Key design rules

- `availability` and `schedule_assignments` are strictly separate. Availability is what the instructor offers. Assignments are what the engine decides. They are never mixed.
- `schedule_proposals` is what enables simulation mode — the engine can produce multiple proposals for the same semester, and only one gets approved.
- `course_instances.semester` stores period only (`"1"` or `"2"`). `availability.semester` and `schedule_proposals.semester` store the full `"YYYY-P"` format (e.g. `"2024-2"`). This distinction is intentional and must be preserved.
- `slot_id` is calculated as `(day_index × 5) + slot_num` where day_index 0 = Monday, 4 = Friday.

---

## Scheduling engine algorithm

The engine lives in `backend/app/services/scheduling_engine.py` and runs in 8 steps:

### Step 1 — Load data
Query all instructors, course instances for the given period, and availability records for the given semester from the database.

### Step 2 — Validate availability
For each instructor who has course instances this semester, check that they submitted at least `required_sessions` non-BUSY slots. If any instructor fails this check, their details are returned as validation warnings. The engine continues but those instructors will produce `no_available_slot` conflicts.

### Step 3 — Sort by priority
Instructors are sorted before assignment:
- PART_TIME before FULL_TIME
- Within each group: higher `required_sessions` first (busiest instructors get first pick of slots)

### Step 4 — Greedy slot assignment
For each course instance (processed in instructor priority order):
1. Get the instructor's available slots
2. Try PREFERRED slots first, then AVAILABLE
3. Skip any slot already used by this instructor in this run
4. Skip any slot blocked by a previously approved proposal
5. Skip any slot where the room is already taken
6. Assign the first valid slot found
7. If no valid slot exists, log a `no_available_slot` conflict

Before this step runs, the engine also pre-places any **inherited locked sessions** (see "Lock / carry-forward" below). Pre-placed locks reserve their slots, room, and instructor before the greedy loop starts, and decrement the per-course session count so the loop doesn't re-schedule what's already inherited.

### Step 5 — Load committed slots
Slots from already-approved proposals for the same semester are blocked. This prevents the engine from placing new classes on top of already-approved ones when running section by section.

### Step 6 — Calculate gap score
For each instructor, for each day where they have 2 or more sessions:
gap = (max_slot_num - min_slot_num) - (num_sessions - 1)

A gap of 0 means sessions are perfectly consecutive. The total gap score is the sum across all instructors and all days. Lower is better.

### Step 7 — Optimise gaps
The engine tries swapping pairs of assignments between different instructors. A swap is kept only if:
- Neither side of the pair is **locked** — locked assignments are off-limits to the optimizer (the admin's manual decision overrides the gap heuristic)
- It reduces the total gap score
- Neither instructor ends up in a slot they did not offer (or marked BUSY)
- Neither instructor ends up in a slot committed by an approved proposal
- No new room conflict is created

One full pass is run. If a beneficial swap is found the process restarts until no improvement is possible.

### Step 8 — Save proposal
All assignments are written to `schedule_assignments` linked to a new `schedule_proposals` row with status `draft`. All conflicts (both `no_available_slot` and any double-booking conflicts) are written to `conflict_log`.

---

## Lock / carry-forward

Admins can pin individual assignments inside a draft proposal. A locked assignment is protected from two sources of unwanted change:

1. **The gap optimizer (Step 7)** will not swap a locked assignment, even when a swap would reduce the gap score.
2. **The move endpoint** (`PUT /proposals/{id}/assignments/{aid}`) rejects moves on a locked assignment with a friendly "unlock first" message.

In addition, locked assignments **carry forward across engine re-runs for the same semester**. When the admin generates a new proposal for a semester that already has at least one draft, the engine reads the most recent draft, validates each locked assignment against current world state (course, instructor, and room still exist; instructor still active), and pre-places the valid ones in the new proposal before the greedy loop runs.

### How it works

Three columns on `schedule_assignments`:
- `locked` (bool) — the only column the engine and frontend read for behavior
- `locked_by` (FK → users.id) — audit trail: which admin set the lock
- `locked_at` (timestamp) — audit trail: when. Preserved across carry-forwards (not refreshed when the engine pulls the lock into a new proposal), so the audit chain always points back to the original lock action

The carry-forward path:
1. `load_inherited_locks(db, semester)` finds the most-recent draft for the semester and returns its valid locked assignments (and a list of carry errors for any locks that referenced now-deleted data)
2. The scheduling endpoint merges the inherited slots into the committed-slot maps (so other courses can't be placed in the same instructor or room slots)
3. `assign_slots` accepts the locks via an `inherited_locks` parameter, pre-seeds them in the `used_*` maps, decrements `sessions_needed` per course, and emits them in the output list with `locked=True` preserved
4. `save_proposal` persists `locked`, `locked_by`, and `locked_at` from the engine output
5. Any carry errors are written as `lock_carried_invalid` conflict rows on the new proposal so the admin sees what couldn't carry over and why

### Design decisions worth knowing

- **Inheritance source is the most recent draft only.** When multiple drafts exist for a semester, only the latest one's locks carry over. Older drafts are ignored to avoid contradictory inheritance.
- **Approved proposals don't contribute locks.** Their slots are already hard constraints via `load_committed_slots`; carrying their locks would duplicate that signal.
- **The endpoint is idempotent.** `PUT /proposals/{id}/assignments/{aid}/lock` with `{locked: true}` on an already-locked assignment is a successful no-op. The body specifies the target state, not the action.
- **Locks are proposal-scoped on read, but globally meaningful on write.** The lock lives on a specific row in `schedule_assignments`, so cloning a proposal copies the lock state to the clone, and approving a proposal preserves the locks as part of the approved schedule.

---


## Authentication

JWT-based. On login, the backend issues a signed token containing `user_id` and `role`. The frontend stores the token in `localStorage` and attaches it as `Authorization: Bearer <token>` on every request. The token payload is decoded client-side to check expiry and read the role for route protection.

Role middleware on the backend:
- `get_current_user` — decodes and validates the token, returns the user
- `require_admin` — raises 403 if role is not ADMIN
- Instructor-only endpoints use `get_current_user` directly and check ownership

---

## Frontend structure
frontend/src/
├── App.jsx                    # Routes + PrivateRoute (role-based)
├── pages/
│   ├── LoginPage.jsx          # JWT login form
│   ├── AdminDashboard.jsx     # Main admin view — engine controls + timetable preview
│   ├── DataManager.jsx        # CRUD for instructors, subjects, sections, rooms, courses
│   ├── ProposalList.jsx       # Proposal history — approve, reject, view
│   ├── ScheduleViewer.jsx     # Full timetable — manual slot swapping, print, clone
│   ├── ConflictViewer.jsx     # Conflict details + resolution form
│   └── InstructorPortal.jsx   # Availability grid + approved schedule view
├── components/
│   ├── admin/                 # AdminNavbar, StatCard, TimetablePreview, etc.
│   └── data/                  # Per-tab CRUD components for DataManager
├── hooks/
│   └── useAdminDashboard.js   # All data fetching and mutations for the dashboard
└── utils/
├── api.js                 # Axios instance with JWT interceptor + 401 handler
└── auth.js                # Token helpers — save, get, remove, decode, isLoggedIn

---

## Deployment

| Service | Platform | Notes |
|---|---|---|
| Backend + DB | Railway | Environment variables set in Railway dashboard |
| Frontend | Vercel | `VITE_API_URL` points to Railway backend URL |

Alembic migrations run on Railway after each deploy: `railway run alembic upgrade head` 
