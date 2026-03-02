import { useMemo, useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline'

// ── Layout constants (Employee view) ─────────────────────────────────────
const ROW_H   = 52
const BAR_H   = 32
const BAR_Y   = (ROW_H - BAR_H) / 2
const EMP_W   = 164

// Days shown in Employee view header/grid
const DAYS_IN_VIEW = 7 // change to 5 if you want Mon–Fri style

// ── Time constants ───────────────────────────────────────────────────────
const H_START = 0
const H_END   = 23
const TOTAL_M = (H_END - H_START) * 60

// ── Time helpers ──────────────────────────────────────────────────────────
function toMins(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function leftPct(t) {
  return Math.min(
    100,
    Math.max(
      0,
      ((Math.max(toMins(t), H_START * 60) - H_START * 60) / TOTAL_M) * 100
    )
  )
}
function widthPct(start, end) {
  let s = toMins(start), e = toMins(end)
  if (e <= s) e += 1440
  return Math.max(
    2,
    ((Math.min(e, H_END * 60) - Math.max(s, H_START * 60)) / TOTAL_M) * 100
  )
}

function barCls(a) {
  if (!a.employee_id)        return 'bg-amber-100 border border-amber-300 text-amber-800'
  if (a.source === 'SOLVER') return 'bg-brand-teal/80 border border-teal-300 text-dark'
  return 'bg-brand-purple/80 border border-brand-purple text-white'
}

// ── Availability span helpers (preferred/unpreferred/unavailable) ─────────
function spansForDate(emp, dateStr, key) {
  const spans = emp?.[key] ?? []
  const dow = format(parseISO(dateStr), 'EEEE') // "Monday"...
  return spans.filter((s) => s.day === dow || s.day === dateStr)
}

function normalizeSpanToTimes(span) {
  // null start/end => treat as full visible range
  const start = span.start ?? `${String(H_START).padStart(2, '0')}:00`
  const end   = span.end   ?? `${String(H_END).padStart(2, '0')}:00`
  return { start, end }
}

function SpanBar({ span, kind }) {
  const { start, end } = normalizeSpanToTimes(span)

  const cls =
    kind === 'preferred'
      ? 'bg-emerald-100/80 border border-emerald-200'
      : kind === 'unpreferred'
      ? 'bg-amber-100/70 border border-amber-200'
      : 'bg-rose-200/70 border border-rose-300' // unavailable

  return (
    <div
      className={`absolute rounded ${cls}`}
      style={{
        left: `${leftPct(start)}%`,
        width: `${widthPct(start, end)}%`,
        height: BAR_H,
        top: BAR_Y,
        zIndex: 0, // behind shifts
      }}
      title={`${kind}: ${start}–${end}`}
    />
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────
function HourLabels() {
  const STEP_H = 6
  const count = Math.floor((H_END - H_START) / STEP_H) + 1

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const h = H_START + i * STEP_H
        const pct = ((h - H_START) / (H_END - H_START)) * 100

        return (
          <div
            key={h}
            className="absolute top-0 bottom-0 flex flex-col"
            style={{ left: `${pct}%` }}
          >
            <span className="text-[9px] text-muted leading-none whitespace-nowrap pl-0.5">
              {String(h).padStart(2, '0')}:00
            </span>
            <div className="flex-1 border-l border-gray-100" />
          </div>
        )
      })}
    </>
  )
}

function ShiftBar({ a }) {
  return (
    <div
      className={`absolute rounded px-1.5 flex items-center overflow-hidden cursor-default select-none ${barCls(a)}`}
      style={{
        left: `${leftPct(a.start_time)}%`,
        width: `${widthPct(a.start_time, a.end_time)}%`,
        height: BAR_H,
        top: BAR_Y,
        zIndex: 1, // above availability spans
      }}
      title={`${a.start_time}–${a.end_time}${a.employee_name ? ' · ' + a.employee_name : ''}`}
    >
      <span className="text-[11px] font-medium truncate leading-tight">
        {a.start_time}–{a.end_time}
      </span>
    </div>
  )
}

function SkillChips({ skills = [] }) {
  if (!skills.length) return <span className="text-muted text-xs italic">any</span>
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span
          key={s}
          className="px-1.5 py-0.5 rounded bg-brand-lavender-light text-brand-purple text-[10px] font-medium leading-none"
        >
          {s}
        </span>
      ))}
    </div>
  )
}

// ── Week navigation bar ───────────────────────────────────────────────────
function WeekNav({ weekStart, allDates, daysInView, onPrev, onNext, onToday }) {
  const visibleEnd = addDays(weekStart, daysInView - 1)
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr   = format(visibleEnd, 'yyyy-MM-dd')
  const hasPrev  = allDates.some((d) => d < startStr)
  const hasNext  = allDates.some((d) => d > endStr)

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous"
      >
        <ChevronLeftIcon className="h-4 w-4 text-dark" />
      </button>

      <span className="text-sm font-semibold text-dark min-w-[172px] text-center select-none">
        {format(weekStart, 'd MMM')} – {format(visibleEnd, 'd MMM yyyy')}
      </span>

      <button
        onClick={onNext}
        disabled={!hasNext}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Next"
      >
        <ChevronRightIcon className="h-4 w-4 text-dark" />
      </button>

      <button
        onClick={onToday}
        className="ml-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-dark hover:bg-gray-50 transition-colors"
      >
        Today
      </button>
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      {[
        { id: 'employee', Icon: CalendarDaysIcon, label: 'By Employee' },
        { id: 'shift',    Icon: ListBulletIcon,   label: 'By Shift'    },
      ].map(({ id, Icon, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            view === id ? 'bg-brand-purple text-white' : 'text-muted hover:bg-gray-50',
          ].join(' ')}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Employee view — horizontal Gantt bars per day (EVEN day widths)
// ════════════════════════════════════════════════════════════════════════════
function EmployeeView({ employees, visibleDates, assignMap, unassignedMap }) {
  const hasUnassigned = visibleDates.some((d) => (unassignedMap[d]?.length ?? 0) > 0)

  const gridStyle = {
    gridTemplateColumns: `${EMP_W}px repeat(${visibleDates.length}, minmax(0, 1fr))`,
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="min-w-[900px]">
        {/* Date header */}
        <div className="grid border-b border-gray-200 bg-gray-50 sticky top-0 z-10" style={gridStyle}>
          <div className="px-4 py-2 border-r border-gray-200 text-xs font-semibold text-muted flex items-center">
            Employee
          </div>

          {visibleDates.map((d) => (
            <div
              key={d}
              className="px-2 py-2 border-r border-gray-100 text-xs font-semibold text-dark text-center"
            >
              {format(parseISO(d), 'EEE d MMM')}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="grid border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
            style={gridStyle}
          >
            <div
              className="px-4 flex flex-col justify-center border-r border-gray-200 bg-white"
              style={{ height: ROW_H }}
            >
              <p className="text-sm font-medium text-dark truncate">{emp.name}</p>
              {emp.skills?.length > 0 && (
                <p className="text-[10px] text-muted truncate">{emp.skills.join(', ')}</p>
              )}
            </div>

            {visibleDates.map((d) => {
              const preferred   = spansForDate(emp, d, 'preferred_spans')
              const unpreferred = spansForDate(emp, d, 'unpreferred_spans')
              const unavailable = spansForDate(emp, d, 'unavailable_spans')

              return (
                <div
                  key={d}
                  className="border-r border-gray-100 relative overflow-hidden"
                  style={{ height: ROW_H }}
                >
                  <HourLabels />

                  {/* Availability spans (background) */}
                  {preferred.map((s, idx) => (
                    <SpanBar key={`p-${idx}`} span={s} kind="preferred" />
                  ))}
                  {unpreferred.map((s, idx) => (
                    <SpanBar key={`u-${idx}`} span={s} kind="unpreferred" />
                  ))}
                  {unavailable.map((s, idx) => (
                    <SpanBar key={`x-${idx}`} span={s} kind="unavailable" />
                  ))}

                  {/* Shifts (foreground) */}
                  {assignMap[emp.id]?.[d]?.map((a) => (
                    <ShiftBar key={a.shift_id} a={a} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}

        {/* Unassigned row */}
        {hasUnassigned && (
          <div className="grid border-t-2 border-amber-200 bg-amber-50" style={gridStyle}>
            <div
              className="px-4 flex items-center border-r border-amber-200"
              style={{ height: ROW_H }}
            >
              <p className="text-sm font-semibold text-amber-700">Unassigned</p>
            </div>

            {visibleDates.map((d) => (
              <div
                key={d}
                className="border-r border-amber-100 relative overflow-hidden"
                style={{ height: ROW_H }}
              >
                <HourLabels />
                {unassignedMap[d]?.map((a) => (
                  <ShiftBar key={a.shift_id} a={a} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Shift view — table grouped by date, unscheduled employees at bottom
// ════════════════════════════════════════════════════════════════════════════
function ShiftView({ employees, assignments, visibleDates }) {
  const byDate = useMemo(() => {
    const m = {}
    for (const d of visibleDates) m[d] = []
    for (const a of assignments) {
      if (visibleDates.includes(a.date)) m[a.date]?.push(a)
    }
    for (const d of visibleDates) {
      m[d].sort((a, b) =>
        a.start_time.localeCompare(b.start_time) || (a.slot_index ?? 0) - (b.slot_index ?? 0)
      )
    }
    return m
  }, [assignments, visibleDates])

  const assignedIds = useMemo(() => {
    const ids = new Set()
    for (const d of visibleDates) {
      for (const a of byDate[d] ?? []) {
        if (a.employee_id) ids.add(a.employee_id)
      }
    }
    return ids
  }, [byDate, visibleDates])

  const unscheduled = employees.filter((e) => !assignedIds.has(e.id))

  return (
    <div className="divide-y divide-gray-100">
      {visibleDates.map((d) => {
        const slots = byDate[d] ?? []
        if (!slots.length) return null
        return (
          <div key={d}>
            <div className="px-4 py-2 bg-gray-50 flex items-center gap-2 sticky top-0 z-10 border-b border-gray-200">
              <span className="text-xs font-bold text-brand-purple">{format(parseISO(d), 'EEEE')}</span>
              <span className="text-xs font-semibold text-dark">{format(parseISO(d), 'd MMMM yyyy')}</span>
              <span className="ml-auto text-xs text-muted">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="divide-y divide-gray-50">
              {slots.map((a) => {
                const skills = a.required_skills ?? []
                const assigned = !!a.employee_id
                return (
                  <div
                    key={a.shift_id}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm ${!assigned ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'} transition-colors`}
                  >
                    <div className="w-28 flex-shrink-0">
                      <span className="font-mono text-xs font-semibold text-dark">
                        {a.start_time} – {a.end_time}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <SkillChips skills={skills} />
                    </div>

                    <div className="flex-shrink-0">
                      {assigned ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.source === 'SOLVER'
                              ? 'bg-brand-teal/15 text-teal-800'
                              : 'bg-brand-lavender-light text-brand-purple'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          {a.employee_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {unscheduled.length > 0 && (
        <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
            Not scheduled this view
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs text-dark"
              >
                <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-muted">
                  {e.name?.[0]?.toUpperCase()}
                </span>
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Root export
// ════════════════════════════════════════════════════════════════════════════
export default function ScheduleGantt({ employees, shifts, assignments }) {
  const employeesArr = employees ?? []
  const shiftsArr = shifts ?? []
  const assignmentsArr = assignments ?? []

  const allDates = useMemo(
    () => [...new Set(shiftsArr.map((s) => s.date))].sort(),
    [shiftsArr]
  )

  const [weekStart, setWeekStart] = useState(() => {
    const base = allDates[0] ? parseISO(allDates[0]) : new Date()
    return startOfWeek(base, { weekStartsOn: 1 })
  })

  const [view, setView] = useState('employee')

  const visibleDates = useMemo(() => {
    return Array.from({ length: DAYS_IN_VIEW }, (_, i) =>
      format(addDays(weekStart, i), 'yyyy-MM-dd')
    )
  }, [weekStart])

  const { assignMap, unassignedMap } = useMemo(() => {
    const am = {}
    for (const emp of employeesArr) am[emp.id] = {}

    const um = {}

    for (const a of assignmentsArr) {
      if (a.employee_id && am[a.employee_id]) {
        if (!am[a.employee_id][a.date]) am[a.employee_id][a.date] = []
        am[a.employee_id][a.date].push(a)
      } else {
        if (!um[a.date]) um[a.date] = []
        um[a.date].push(a)
      }
    }

    return { assignMap: am, unassignedMap: um }
  }, [employeesArr, assignmentsArr])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  if (!employeesArr.length || !shiftsArr.length) return null

  return (
    <div>
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 bg-white">
        <WeekNav
          weekStart={weekStart}
          allDates={allDates}
          daysInView={DAYS_IN_VIEW}
          onPrev={() => setWeekStart((w) => addDays(w, -DAYS_IN_VIEW))}
          onNext={() => setWeekStart((w) => addDays(w, DAYS_IN_VIEW))}
          onToday={() => {
            const target = allDates.includes(todayStr) ? todayStr : allDates[0]
            const base = target ? parseISO(target) : new Date()
            setWeekStart(startOfWeek(base, { weekStartsOn: 1 }))
          }}
        />
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'employee' ? (
        <EmployeeView
          employees={employeesArr}
          visibleDates={visibleDates}
          assignMap={assignMap}
          unassignedMap={unassignedMap}
        />
      ) : (
        <ShiftView
          employees={employeesArr}
          assignments={assignmentsArr}
          visibleDates={visibleDates}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-amber-100 border border-amber-300" />
          Unassigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-brand-purple/80 border border-brand-purple" />
          Assigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-brand-teal/80 border border-teal-300" />
          Auto-scheduled
        </span>

        {/* Availability legend */}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-emerald-100 border border-emerald-200" />
          Preferred
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-amber-100 border border-amber-200" />
          Unpreferred
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-rose-200 border border-rose-300" />
          Unavailable
        </span>

        {view === 'employee' && (
          <span className="ml-auto">Showing {H_START}:00 – {H_END}:00</span>
        )}
      </div>
    </div>
  )
}