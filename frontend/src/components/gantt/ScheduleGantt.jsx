import { format, parseISO } from 'date-fns'

// ── Constants ──────────────────────────────────────────────────────────────
const ROW_HEIGHT = 56   // px per employee row
const BAR_HEIGHT = 36   // px for shift bars
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2
const EMP_COL_W = 176   // px width of employee name column
const DAY_COL_W = 180   // px width of each day column
const HOUR_START = 0    // 00:00
const HOUR_END = 24     // 24:00

function timeToPercent(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const mins = h * 60 + m
  return (mins / (HOUR_END * 60)) * 100
}

function getBarStyle(assignment) {
  if (!assignment.employee_id) {
    return 'bg-amber-100 border border-amber-300 text-amber-800'
  }
  if (assignment.source === 'SOLVER') {
    return 'bg-brand-teal/80 text-dark'
  }
  return 'bg-brand-purple text-white'
}

function HourLabels() {
  const labels = []
  for (let h = 0; h <= 24; h += 3) {
    const pct = ((h * 60) / (HOUR_END * 60)) * 100
    labels.push(
      <div
        key={h}
        className="absolute top-0 bottom-0 flex flex-col items-center"
        style={{ left: `${pct}%` }}
      >
        <span className="text-[10px] text-muted leading-none whitespace-nowrap">
          {String(h).padStart(2, '0')}:00
        </span>
        <div className="flex-1 border-l border-gray-100" />
      </div>
    )
  }
  return <>{labels}</>
}

function ShiftBar({ assignment }) {
  const left = timeToPercent(assignment.start_time)
  const right = timeToPercent(assignment.end_time)
  const width = Math.max(right - left, 2)
  const style = getBarStyle(assignment)

  return (
    <div
      className={`absolute rounded-md px-2 flex items-center overflow-hidden select-none ${style}`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        height: BAR_HEIGHT,
        top: BAR_Y_OFFSET,
      }}
      title={`${assignment.start_time}–${assignment.end_time} | ${assignment.employee_name ?? 'Unassigned'}`}
    >
      <span className="text-xs font-medium truncate leading-tight">
        {assignment.start_time}–{assignment.end_time}
      </span>
    </div>
  )
}

export default function ScheduleGantt({ employees, shifts, assignments }) {
  if (!employees?.length || !shifts?.length) return null

  // Collect unique dates from shifts
  const dates = [...new Set(shifts.map((s) => s.date))].sort()

  // Build lookup: empId → date → assignments[]
  const assignMap = {}
  for (const emp of employees) {
    assignMap[emp.id] = {}
    for (const d of dates) assignMap[emp.id][d] = []
  }
  // Unassigned bucket per date
  const unassignedMap = {}
  for (const d of dates) unassignedMap[d] = []

  for (const a of assignments) {
    if (a.employee_id && assignMap[a.employee_id]) {
      assignMap[a.employee_id][a.date]?.push(a)
    } else {
      unassignedMap[a.date]?.push(a)
    }
  }

  const totalWidth = EMP_COL_W + dates.length * DAY_COL_W

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div style={{ minWidth: totalWidth }}>
        {/* Header row */}
        <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div
            className="flex-shrink-0 px-4 py-2 border-r border-gray-200 text-xs font-semibold text-muted flex items-center"
            style={{ width: EMP_COL_W }}
          >
            Employee
          </div>
          {dates.map((d) => (
            <div
              key={d}
              className="flex-shrink-0 px-3 py-2 border-r border-gray-100 text-xs font-semibold text-dark text-center"
              style={{ width: DAY_COL_W }}
            >
              {format(parseISO(d), 'EEE dd MMM')}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="flex border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
          >
            {/* Name cell */}
            <div
              className="flex-shrink-0 px-4 flex flex-col justify-center border-r border-gray-200 bg-white"
              style={{ width: EMP_COL_W, height: ROW_HEIGHT }}
            >
              <p className="text-sm font-medium text-dark truncate">{emp.name}</p>
              <p className="text-xs text-muted truncate">{emp.role}</p>
            </div>

            {/* Day cells */}
            {dates.map((d) => (
              <div
                key={d}
                className="flex-shrink-0 border-r border-gray-100 relative"
                style={{ width: DAY_COL_W, height: ROW_HEIGHT }}
              >
                <HourLabels />
                {assignMap[emp.id]?.[d]?.map((a) => (
                  <ShiftBar key={a.shift_id} assignment={a} />
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Unassigned row */}
        {Object.values(unassignedMap).some((list) => list.length > 0) && (
          <div className="flex border-b border-amber-200 bg-amber-50">
            <div
              className="flex-shrink-0 px-4 flex items-center border-r border-amber-200"
              style={{ width: EMP_COL_W, height: ROW_HEIGHT }}
            >
              <p className="text-sm font-medium text-amber-700">Unassigned</p>
            </div>
            {dates.map((d) => (
              <div
                key={d}
                className="flex-shrink-0 border-r border-amber-100 relative"
                style={{ width: DAY_COL_W, height: ROW_HEIGHT }}
              >
                <HourLabels />
                {unassignedMap[d].map((a) => (
                  <ShiftBar key={a.shift_id} assignment={a} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-amber-100 border border-amber-300" />
          Unassigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-brand-purple" />
          Assigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-brand-teal/80" />
          Auto-scheduled
        </span>
      </div>
    </div>
  )
}
