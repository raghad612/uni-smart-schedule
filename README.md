# SmartSchedule — Intelligent Instructor Scheduling System

A full-stack web application that replaces manual Excel-based university timetable scheduling with a constraint-aware scheduling engine. Built as a graduation project for the Lebanese University, Faculty of Sciences I.

**Team:** Raghad Alloush · Siham Hajj Sleiman · Christina Abdallah

---

## What it does

Universities currently schedule instructors manually using Excel. This causes conflicts, errors that are only found after publishing, and no way to test changes before finalising. SmartSchedule solves this by:

- Letting instructors submit their weekly availability online
- Running a scheduling engine that assigns classes automatically, respects preferences, and detects conflicts
- Giving admins a dashboard to review proposals, resolve conflicts, and approve the final schedule
- Letting instructors see their approved schedule in a personal portal

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Database | PostgreSQL 15 (Docker) |
| ORM | SQLAlchemy 2.0 + Alembic |
| Auth | JWT (python-jose + passlib/bcrypt) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Deployment | Railway (backend) + Vercel (frontend) |

---

## How to run locally

### Prerequisites
- Python 3.11
- Node.js 18+
- Docker Desktop

### 1. Clone the repo

```bash
git clone https://github.com/raghad612/uni-smart-schedule.git
cd uni-smart-schedule
git checkout develop
```

### 2. Start the database

```bash
docker compose up -d
```

### 3. Start the backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

### 4. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 5. Seed the admin account

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python seed_admin.py
```

Default admin login: `admin@university.edu` / `admin123`

---

## Scheduling engine

The core algorithm runs in 8 steps:

1. Load instructors, course instances, and availability for the semester
2. Validate that each instructor submitted enough availability slots
3. Sort by priority — PART_TIME first, then FULL_TIME, busiest first within each group
4. Greedy slot assignment — PREFERRED slots first, then AVAILABLE
5. Block approved proposal slots so they cannot be reused
6. Calculate gap score — measures idle time between sessions per instructor per day
7. Optimise gaps — swap assignments if the swap reduces idle time without creating conflicts
8. Save all assignments as a versioned proposal with status `draft`

Gap score formula: `gap = (max_slot - min_slot) - (num_sessions - 1)` — lower is better, 0 is perfect.

---

## Running the tests

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest tests/ -v
```

12 tests covering: gap score formula, priority sort, conflict detection, and 4 optimiser safety guards.

---

## API overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login, returns JWT |
| GET | `/instructors/` | List all instructors |
| POST | `/availability/` | Submit availability slots |
| POST | `/scheduling/run` | Run the scheduling engine |
| GET | `/proposals/` | List all proposals |
| POST | `/proposals/{id}/approve` | Approve a proposal |
| GET | `/proposals/{id}/conflicts` | List conflicts for a proposal |
| POST | `/conflicts/{id}/resolve` | Mark a conflict as resolved |
| POST | `/proposals/{id}/clone` | Clone a proposal as new draft |