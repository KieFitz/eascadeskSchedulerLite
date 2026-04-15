"""Timefold solver service — backed by SolverManager for concurrent multi-user solves.

Architecture
------------
One SolverManager is created per (country, timeout) combination and cached for
the lifetime of the process.  This means:

  - Country-specific constraint config (min rest, weekly max hours) is baked into
    the manager at creation time — there is no shared mutable state between
    concurrent solves.  Races between users from different countries are impossible.

  - The manager maintains a bounded thread pool (SOLVER_PARALLEL_COUNT in settings).
    With the default of 1, solves are queued sequentially — safe on single-core or
    low-RAM hosts and correct regardless of concurrency.  Increase to 2-4 when you
    have spare CPU cores dedicated to the solver.

  - solve_async() submits the job to the manager and then awaits
    job.get_final_best_solution() in a thread-pool executor so the FastAPI event
    loop is never blocked.

Scaling beyond a single host
-----------------------------
When you outgrow one server (e.g. 10+ concurrent users hitting Solve at the same
time), extract the solver into a separate worker container:

  web  ──POST /solve──►  API container  (stores run_id, status=processing)
                              │
                        enqueues job
                              │
                              ▼
                       Redis / RQ queue
                              │
                              ▼
                       Solver worker(s)  ←── scale horizontally
                       (each runs one SolverManager with parallel_solver_count=1)
                              │
                       writes result to DB
                              │
                       API polls DB ──► client GET /schedules/:id

This keeps the JVM completely out of the web-serving path and lets you scale
solver workers independently.
"""

import asyncio
import threading
from datetime import date

from timefold.solver import SolverManager
from timefold.solver.config import (
    Duration,
    ScoreDirectorFactoryConfig,
    SolverConfig,
    SolverManagerConfig,
    TerminationConfig,
)

from app.core.config import settings
from timefold_model.domain import Employee, ScheduleSolution, Shift, ShiftAssignment
from timefold_model.constraints import build_constraint_provider


# ── Country labour-law configs ────────────────────────────────────────────────

_COUNTRY_CONFIGS: dict[str, dict] = {
    "IE": {"min_rest_hours": 11, "max_weekly_hours": 48},
    "GB": {"min_rest_hours": 11, "max_weekly_hours": 48},
    "ES": {"min_rest_hours": 12, "max_weekly_hours": 40},
}
_DEFAULT_CONFIG = {"min_rest_hours": 11, "max_weekly_hours": 48}


def _country_cfg(country: str | None) -> dict:
    return dict(_COUNTRY_CONFIGS.get(country or "", _DEFAULT_CONFIG))


# ── Time helpers (pure Python, never transpiled) ──────────────────────────────

def _hhmm_to_mins(s: str) -> int:
    """'08:00' → 480"""
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _mins_to_hhmm(mins: int) -> str:
    """480 → '08:00'"""
    return f"{mins // 60:02d}:{mins % 60:02d}"


# ── Availability pre-computation (pure Python, never transpiled) ──────────────

_WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _span_covers_shift(span: dict, shift_date_str: str, shift_weekday: str,
                        shift_start: int, shift_end: int) -> bool:
    day = str(span.get("day") or "")
    if "-" in day:
        if shift_date_str != day:
            return False
    else:
        if shift_weekday != day:
            return False

    span_start_str = span.get("start")
    span_end_str   = span.get("end")
    if not span_start_str or not span_end_str:
        return True

    span_start = _hhmm_to_mins(span_start_str)
    span_end   = _hhmm_to_mins(span_end_str)
    return not (shift_end <= span_start or span_end <= shift_start)


def _precompute_shift_id_sets(employees_data: list[dict], shifts_data: list[dict]) -> dict:
    shift_descriptors = []
    for s in shifts_data:
        d = date.fromisoformat(s["date"])
        shift_descriptors.append({
            "id":         s["id"],
            "date_str":   s["date"],
            "weekday":    _WEEKDAY_NAMES[d.weekday()],
            "start_mins": _hhmm_to_mins(s["start_time"]),
            "end_mins":   _hhmm_to_mins(s["end_time"]),
        })

    result: dict[str, dict] = {}
    for e in employees_data:
        emp_id = e["id"]
        unavailable: list[str] = []
        preferred:   list[str] = []
        unpreferred: list[str] = []

        for sd in shift_descriptors:
            sid      = sd["id"]
            date_str = sd["date_str"]
            weekday  = sd["weekday"]
            start    = sd["start_mins"]
            end      = sd["end_mins"]

            for span in e.get("unavailable_spans", []):
                if _span_covers_shift(span, date_str, weekday, start, end):
                    unavailable.append(sid)
                    break
            for span in e.get("preferred_spans", []):
                if _span_covers_shift(span, date_str, weekday, start, end):
                    preferred.append(sid)
                    break
            for span in e.get("unpreferred_spans", []):
                if _span_covers_shift(span, date_str, weekday, start, end):
                    unpreferred.append(sid)
                    break

        result[emp_id] = {
            "unavailable": unavailable,
            "preferred":   preferred,
            "unpreferred": unpreferred,
        }
    return result


# ── SolverManager cache ───────────────────────────────────────────────────────

# Hard ceiling — no solve ever runs longer than this
MAX_SOLVER_SECONDS = 300  # 5 minutes
# Stop early if no improvement for this long
UNIMPROVED_SECONDS = 30

# Cache keyed by (country_key, timeout_seconds) so each distinct configuration
# gets its own manager with constraint config baked in.
_managers: dict[tuple, SolverManager] = {}
_managers_lock = threading.Lock()


def _get_solver_manager(country: str | None, timeout_seconds: int) -> SolverManager:
    """Return (and lazily create) the SolverManager for this country + timeout."""
    key = (country or "", timeout_seconds)
    if key in _managers:
        return _managers[key]

    with _managers_lock:
        # Double-checked: another thread may have created it while we waited
        if key in _managers:
            return _managers[key]

        cfg = _country_cfg(country)
        constraint_provider = build_constraint_provider(
            min_rest_mins   = cfg["min_rest_hours"]   * 60,
            max_weekly_mins = cfg["max_weekly_hours"] * 60,
        )
        solver_config = SolverConfig(
            solution_class=ScheduleSolution,
            entity_class_list=[ShiftAssignment],
            score_director_factory_config=ScoreDirectorFactoryConfig(
                constraint_provider_function=constraint_provider,
            ),
            termination_config=TerminationConfig(
                spent_limit=Duration(seconds=timeout_seconds),
                unimproved_spent_limit=Duration(seconds=UNIMPROVED_SECONDS),
            ),
        )
        mgr_config = SolverManagerConfig(
            parallel_solver_count=settings.SOLVER_PARALLEL_COUNT,
        )
        _managers[key] = SolverManager.create(solver_config, mgr_config)
        return _managers[key]


# ── Problem builder ───────────────────────────────────────────────────────────

def _build_problem(
    employees_data: list[dict],
    shifts_data: list[dict],
    previous_assignments: list[dict] | None,
) -> tuple[ScheduleSolution, dict[str, float]]:
    """Build the Timefold domain objects from raw dicts.

    Returns (ScheduleSolution, emp_cost_map) where emp_cost_map is used to
    attach cost info to result assignments after solving.
    """
    # Pre-compute per-shift derived values (pure Python, never seen by JVM)
    shift_meta: dict[str, dict] = {}
    for s in shifts_data:
        d   = date.fromisoformat(s["date"])
        ic  = d.isocalendar()
        iso = f"{ic[0]}W{ic[1]:02d}"
        st  = _hhmm_to_mins(s["start_time"])
        en  = _hhmm_to_mins(s["end_time"])
        dur = en - st
        if dur <= 0:
            dur += 1440
        shift_meta[s["id"]] = {"iso_week": iso, "duration_mins": dur}

    avail_sets = _precompute_shift_id_sets(employees_data, shifts_data)

    employees = [
        Employee(
            id=e["id"],
            name=e["name"],
            min_hours_week=e.get("min_hours_week", 0),
            cost_per_hour=e.get("cost_per_hour", 0.0),
            skills=e.get("skills", []),
            unavailable_shift_ids=avail_sets[e["id"]]["unavailable"],
            preferred_shift_ids=avail_sets[e["id"]]["preferred"],
            unpreferred_shift_ids=avail_sets[e["id"]]["unpreferred"],
        )
        for e in employees_data
    ]

    emp_cost_map: dict[str, float] = {e.id: e.cost_per_hour for e in employees}
    emp_by_id:   dict[str, Employee] = {e.id: e for e in employees}

    warm_start: dict[str, str] = {}
    if previous_assignments:
        for pa in previous_assignments:
            sid = pa.get("shift_id")
            eid = pa.get("employee_id")
            if sid and eid:
                warm_start[sid] = eid

    shift_assignments = []
    for s in shifts_data:
        meta  = shift_meta[s["id"]]
        shift = Shift(
            id=s["id"],
            date=date.fromisoformat(s["date"]),
            start_time=_hhmm_to_mins(s["start_time"]),
            end_time=_hhmm_to_mins(s["end_time"]),
            required_skills=s.get("required_skills", []),
            slot_index=s["slot_index"],
            iso_week=meta["iso_week"],
            duration_mins=meta["duration_mins"],
        )
        sa = ShiftAssignment(id=s["id"], shift=shift)
        prev_eid = warm_start.get(s["id"])
        if prev_eid and prev_eid in emp_by_id:
            sa.employee = emp_by_id[prev_eid]
        shift_assignments.append(sa)

    problem = ScheduleSolution(employees=employees, shift_assignments=shift_assignments)
    return problem, emp_cost_map


def _solution_to_dict(solution: ScheduleSolution, emp_cost_map: dict[str, float]) -> dict:
    result_assignments = []
    for a in solution.shift_assignments:
        duration_h = a.shift.duration_hours() if a.shift else 0.0
        cost_per_h = emp_cost_map.get(a.employee.id, 0.0) if a.employee else 0.0
        result_assignments.append({
            "shift_id":        a.shift.id if a.shift else None,
            "date":            str(a.shift.date) if a.shift else None,
            "start_time":      _mins_to_hhmm(a.shift.start_time) if a.shift else None,
            "end_time":        _mins_to_hhmm(a.shift.end_time) if a.shift else None,
            "required_skills": a.shift.required_skills if a.shift else [],
            "slot_index":      a.shift.slot_index if a.shift else None,
            "employee_id":     a.employee.id if a.employee else None,
            "employee_name":   a.employee.name if a.employee else None,
            "cost_per_hour":   cost_per_h,
            "shift_cost":      round(cost_per_h * duration_h, 2),
        })
    score_str = str(solution.score) if solution.score else "unknown"
    return {"assignments": result_assignments, "score": score_str}


# ── Public solve entry point ──────────────────────────────────────────────────

async def solve_async(
    run_id: str,
    employees_data: list[dict],
    shifts_data: list[dict],
    country: str | None = None,
    timeout_seconds: int | None = None,
    previous_assignments: list[dict] | None = None,
) -> dict:
    """Submit a solve job to the SolverManager and return when it completes.

    Non-blocking: the job is queued by the manager.  If SOLVER_PARALLEL_COUNT=1
    (default) concurrent jobs are serialised automatically.  The event loop is
    freed while waiting via run_in_executor.
    """
    base = timeout_seconds if timeout_seconds and timeout_seconds > 0 else settings.SOLVER_TIMEOUT_SECONDS
    effective_timeout = min(base, MAX_SOLVER_SECONDS)

    manager = _get_solver_manager(country, effective_timeout)
    problem, emp_cost_map = _build_problem(employees_data, shifts_data, previous_assignments)

    # Submits the job (non-blocking) — manager queues it according to parallel_solver_count
    job = manager.solve(run_id, problem)

    # Block the thread (not the event loop) until the job finishes
    loop = asyncio.get_event_loop()
    solution = await loop.run_in_executor(None, job.get_final_best_solution)

    return _solution_to_dict(solution, emp_cost_map)


# ── Replacement finder ────────────────────────────────────────────────────────

def find_substitutes(
    employees_data: list[dict],
    shifts_data: list[dict],
    assignments_data: list[dict],
    shift_id: str,
) -> list[dict]:
    """Return employees ranked by suitability to cover the given shift.

    Ranking factors (higher score = better fit):
      +4  covers all required skills
      +2  shift falls inside a preferred time window
      -1  shift falls inside an unpreferred time window
      -6  employee is marked unavailable
      -10 employee already has an overlapping shift that day

    The currently assigned employee is excluded from results.
    Runs in pure Python — no JVM/Timefold involved.
    """
    target = next((s for s in shifts_data if s["id"] == shift_id), None)
    if not target:
        return []

    shift_date_str = target["date"]
    d = date.fromisoformat(shift_date_str)
    shift_weekday = _WEEKDAY_NAMES[d.weekday()]
    shift_start = _hhmm_to_mins(target["start_time"])
    shift_end   = _hhmm_to_mins(target["end_time"])
    if shift_end <= shift_start:
        shift_end += 1440

    required_skills = set(target.get("required_skills") or [])

    current_assignment = next((a for a in assignments_data if a.get("shift_id") == shift_id), None)
    current_employee_id = current_assignment.get("employee_id") if current_assignment else None

    shift_by_id = {s["id"]: s for s in shifts_data}
    emp_day_shifts: dict[str, list[dict]] = {}
    for a in assignments_data:
        if a.get("shift_id") == shift_id or not a.get("employee_id"):
            continue
        s = shift_by_id.get(a["shift_id"])
        if s and s["date"] == shift_date_str:
            emp_day_shifts.setdefault(a["employee_id"], []).append(s)

    avail_sets = _precompute_shift_id_sets(employees_data, shifts_data)

    results: list[dict] = []
    for emp in employees_data:
        if emp["id"] == current_employee_id:
            continue
        emp_id     = emp["id"]
        emp_skills = set(emp.get("skills") or [])
        avail      = avail_sets.get(emp_id, {})

        skills_ok      = not required_skills or required_skills.issubset(emp_skills)
        missing_skills = sorted(required_skills - emp_skills)

        overlaps = False
        for other in emp_day_shifts.get(emp_id, []):
            o_start = _hhmm_to_mins(other["start_time"])
            o_end   = _hhmm_to_mins(other["end_time"])
            if o_end <= o_start:
                o_end += 1440
            if shift_start < o_end and shift_end > o_start:
                overlaps = True
                break

        is_unavailable = shift_id in avail.get("unavailable", [])
        is_preferred   = shift_id in avail.get("preferred",   [])
        is_unpreferred = shift_id in avail.get("unpreferred", [])

        score = 0
        if skills_ok:      score += 4
        if overlaps:       score -= 10
        if is_unavailable: score -= 6
        if is_preferred:   score += 2
        if is_unpreferred: score -= 1

        reasons: list[str] = []
        if not skills_ok:      reasons.append(f"Missing: {', '.join(missing_skills)}")
        if overlaps:           reasons.append("Already scheduled this time")
        if is_unavailable:     reasons.append("Marked unavailable")
        if is_preferred:       reasons.append("Preferred time")
        elif is_unpreferred:   reasons.append("Unpreferred time")

        results.append({
            "employee_id":    emp_id,
            "employee_name":  emp["name"],
            "skills":         sorted(emp_skills),
            "score":          score,
            "skills_ok":      skills_ok,
            "overlaps":       overlaps,
            "is_unavailable": is_unavailable,
            "is_preferred":   is_preferred,
            "reasons":        reasons,
        })

    results.sort(key=lambda x: (-x["score"], x["employee_name"]))
    return results


# ── Pure-Python constraint validation ─────────────────────────────────────────

def check_constraints(
    employees_data: list[dict],
    shifts_data: list[dict],
    assignments_data: list[dict],
    country: str | None = None,
) -> list[dict]:
    """Mirror of the Timefold hard constraints in pure Python (instant, no JVM).

    Returns a list of violation dicts:
      {"shift_id": str, "rule": str, "message": str, "severity": "hard"|"soft"}
    """
    cfg           = _country_cfg(country)
    min_rest_mins = cfg["min_rest_hours"]   * 60
    max_weekly_h  = cfg["max_weekly_hours"]

    emp_by_id:   dict[str, dict] = {e["id"]: e for e in employees_data}
    shift_by_id: dict[str, dict] = {s["id"]: s for s in shifts_data}

    avail_sets = _precompute_shift_id_sets(employees_data, shifts_data)

    violations: list[dict] = []
    by_employee: dict[str, list[dict]] = {}

    for a in assignments_data:
        shift_id = a.get("shift_id")
        emp_id   = a.get("employee_id")
        shift    = shift_by_id.get(shift_id) if shift_id else None

        if not emp_id:
            violations.append({
                "shift_id": shift_id,
                "rule":     "Unassigned shift",
                "message":  "This shift slot has no assigned employee.",
                "severity": "hard",
            })
            continue

        emp = emp_by_id.get(emp_id)
        if not emp or not shift:
            continue

        emp_avail = avail_sets.get(emp_id, {})

        required   = set(shift.get("required_skills") or [])
        emp_skills = set(emp.get("skills") or [])
        if required and not required.issubset(emp_skills):
            missing = sorted(required - emp_skills)
            violations.append({
                "shift_id": shift_id,
                "rule":     "Missing required skills",
                "message":  f"{emp['name']} is missing: {', '.join(missing)}",
                "severity": "hard",
            })

        if shift_id in emp_avail.get("unavailable", []):
            violations.append({
                "shift_id": shift_id,
                "rule":     "Employee unavailable",
                "message":  f"{emp['name']} is marked unavailable for this shift.",
                "severity": "hard",
            })

        by_employee.setdefault(emp_id, []).append(
            {"shift_id": shift_id, "shift": shift, "emp": emp}
        )

    # Pair-wise: overlapping shifts + minimum rest
    for emp_id, emp_list in by_employee.items():
        for i in range(len(emp_list)):
            for j in range(i + 1, len(emp_list)):
                ea = emp_list[i]
                eb = emp_list[j]
                sa = ea["shift"]
                sb = eb["shift"]

                sa_start = _hhmm_to_mins(sa["start_time"])
                sa_end   = _hhmm_to_mins(sa["end_time"])
                sb_start = _hhmm_to_mins(sb["start_time"])
                sb_end   = _hhmm_to_mins(sb["end_time"])

                sa_ord = date.fromisoformat(sa["date"]).toordinal() * 1440
                sb_ord = date.fromisoformat(sb["date"]).toordinal() * 1440

                abs_sa_s = sa_ord + sa_start
                abs_sa_e = sa_ord + sa_end
                abs_sb_s = sb_ord + sb_start
                abs_sb_e = sb_ord + sb_end

                if abs_sa_e <= abs_sa_s:
                    abs_sa_e += 1440
                if abs_sb_e <= abs_sb_s:
                    abs_sb_e += 1440

                emp_name = ea["emp"]["name"]

                if not (abs_sa_e <= abs_sb_s or abs_sb_e <= abs_sa_s):
                    for sid in (ea["shift_id"], eb["shift_id"]):
                        violations.append({
                            "shift_id": sid,
                            "rule":     "Overlapping shifts",
                            "message":  f"{emp_name} is scheduled for two overlapping shifts.",
                            "severity": "hard",
                        })
                else:
                    gap = (
                        (abs_sb_s - abs_sa_e)
                        if abs_sa_e <= abs_sb_s
                        else (abs_sa_s - abs_sb_e)
                    )
                    if gap < min_rest_mins:
                        for sid in (ea["shift_id"], eb["shift_id"]):
                            violations.append({
                                "shift_id": sid,
                                "rule":     "Insufficient rest between shifts",
                                "message":  (
                                    f"{emp_name} has only {gap / 60:.1f}h rest "
                                    f"(minimum {min_rest_mins // 60}h required)."
                                ),
                                "severity": "hard",
                            })

    # Weekly overtime (soft warning)
    emp_week_hours: dict[tuple, float] = {}
    for a in assignments_data:
        eid   = a.get("employee_id")
        shift = shift_by_id.get(a.get("shift_id", ""))
        if not eid or not shift:
            continue
        ic       = date.fromisoformat(shift["date"]).isocalendar()
        week_key = (eid, int(ic[0]), int(ic[1]))
        s_m = _hhmm_to_mins(shift["start_time"])
        e_m = _hhmm_to_mins(shift["end_time"])
        dur = e_m - s_m
        if dur <= 0:
            dur += 1440
        emp_week_hours[week_key] = emp_week_hours.get(week_key, 0.0) + dur / 60

    for a in assignments_data:
        eid   = a.get("employee_id")
        shift = shift_by_id.get(a.get("shift_id", ""))
        if not eid or not shift:
            continue
        ic       = date.fromisoformat(shift["date"]).isocalendar()
        week_key = (eid, int(ic[0]), int(ic[1]))
        total_h  = emp_week_hours.get(week_key, 0.0)
        if total_h > max_weekly_h:
            emp      = emp_by_id.get(eid)
            emp_name = emp["name"] if emp else eid
            violations.append({
                "shift_id": a["shift_id"],
                "rule":     "Weekly overtime",
                "message":  (
                    f"{emp_name} is scheduled {total_h:.1f}h in week {int(ic[1])} "
                    f"(max {max_weekly_h}h)."
                ),
                "severity": "soft",
            })

    return violations
