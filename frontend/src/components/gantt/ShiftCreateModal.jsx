import { useMemo, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { format, parseISO } from 'date-fns'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// iso day-of-week index 0=Mon … 6=Sun — uses local date constructor to avoid UTC shift
function isoDow(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const js = new Date(y, m - 1, d).getDay() // 0=Sun
  return js === 0 ? 6 : js - 1
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const yr = dt.getFullYear()
  const mo = String(dt.getMonth() + 1).padStart(2, '0')
  const dy = String(dt.getDate()).padStart(2, '0')
  return `${yr}-${mo}-${dy}`
}

export default function ShiftCreateModal({
  date,
  employees,
  existingShifts,
  dateFrom,        // schedule start (ISO) — used to bound repeat expansion
  dateTo,          // schedule end  (ISO)
  initialStartTime,// pre-fill from double-click position or coverage row
  initialEndTime,
  onCreate,
  onClose,
}) {
  const [startTime,     setStartTime]     = useState(initialStartTime ?? '09:00')
  const [endTime,       setEndTime]       = useState(initialEndTime   ?? '17:00')
  const [selectedSkills, setSelectedSkills] = useState([])
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [repeat,        setRepeat]        = useState(false)
  const [repeatDays,    setRepeatDays]    = useState(() => {
    // Default: tick the day-of-week of the clicked date
    const dow = date ? isoDow(date) : 0
    return [dow]
  })
  const [error, setError] = useState('')

  const allSkills = useMemo(() => {
    const s = new Set()
    for (const emp of employees) {
      for (const sk of emp.skills ?? []) s.add(sk)
    }
    return [...s].sort()
  }, [employees])

  const formattedDate = (() => {
    try { return format(parseISO(date), 'EEEE d MMMM yyyy') }
    catch { return date }
  })()

  const toggleSkill = (skill) =>
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )

  const toggleRepeatDay = (dow) =>
    setRepeatDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort()
    )

  // Generate every date in [rangeFrom, rangeTo] that matches the selected DOWs.
  // Uses local date arithmetic throughout — toISOString() is UTC and would give
  // the wrong date in timezones behind UTC (e.g. UTC+1 at midnight = prior day in UTC).
  function localIso(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function expandRepeatDates(rangeFrom, rangeTo) {
    const dates = []
    const [ey, em, ed] = rangeTo.split('-').map(Number)
    const end = new Date(ey, em - 1, ed)
    const [sy, sm, sd] = rangeFrom.split('-').map(Number)
    const cur = new Date(sy, sm - 1, sd)
    while (cur <= end) {
      const iso = localIso(cur)
      if (repeatDays.includes(isoDow(iso))) dates.push(iso)
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  function makeShift(isoDate, existing) {
    const baseId = `${isoDate}_${startTime}`
    const count = (existing ?? []).filter((s) => s.id.startsWith(baseId)).length
    return {
      id: `${baseId}_slot${count}`,
      date: isoDate,
      start_time: startTime,
      end_time: endTime,
      required_skills: selectedSkills,
      slot_index: count,
    }
  }

  const handleCreate = () => {
    if (!startTime || !endTime) { setError('Start and end times are required.'); return }
    if (startTime === endTime)  { setError('Start and end time must differ.'); return }
    if (repeat && repeatDays.length === 0) { setError('Select at least one day to repeat on.'); return }
    setError('')

    const allExisting = existingShifts ?? []

    if (!repeat) {
      onCreate(makeShift(date, allExisting), selectedEmpId || null)
    } else {
      // Use schedule range if available.
      // Fallback when range is unknown: start from the clicked date (not the Monday
      // of its week) so we never generate shifts before the date the user clicked.
      const rangeFrom = dateFrom ?? date
      const rangeTo   = dateTo   ?? addDays(date, 6)
      const dates = expandRepeatDates(rangeFrom, rangeTo)
      // Build shifts in order, tracking running existing+new to avoid id collisions
      const running = [...allExisting]
      for (const d of dates) {
        const shift = makeShift(d, running)
        onCreate(shift, selectedEmpId || null)
        running.push(shift)
      }
    }
    onClose()
  }

  return (
    <Modal open title="Add New Shift" onClose={onClose} size="sm">
      {/* Date */}
      <div className="mb-4 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-dark font-medium">
        {formattedDate}
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block mb-1 text-xs font-semibold text-dark">Start time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>
        <div>
          <label className="block mb-1 text-xs font-semibold text-dark">End time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>
      </div>

      {/* Required skills */}
      {allSkills.length > 0 && (
        <div className="mb-4">
          <label className="block mb-1.5 text-xs font-semibold text-dark">Required skills (optional)</label>
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedSkills.includes(skill)
                    ? 'bg-brand-purple text-white border-brand-purple'
                    : 'bg-white text-dark border-gray-200 hover:border-brand-purple'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Employee assignment (optional) */}
      <div className="mb-4">
        <label className="block mb-1 text-xs font-semibold text-dark">Assign employee (optional)</label>
        <select
          value={selectedEmpId}
          onChange={(e) => setSelectedEmpId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
        >
          <option value="">— Leave unassigned —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}{emp.skills?.length ? ` (${emp.skills.join(', ')})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Repeat */}
      <div className="mb-4 border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-brand-purple"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          <span className="text-xs font-semibold text-dark">
            Repeat across schedule
          </span>
        </label>

        {repeat && (
          <div>
            <label className="block text-xs text-muted mb-1.5">Repeat on days</label>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleRepeatDay(dow)}
                  className={[
                    'flex-1 py-1 rounded text-xs font-medium border transition-colors',
                    repeatDays.includes(dow)
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'bg-white text-muted border-gray-200 hover:border-brand-purple',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-1.5">
              Creates one shift per matching day
              {dateFrom && dateTo ? ` from ${dateFrom} to ${dateTo}` : ' across the schedule'}.
            </p>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {(() => {
        let addLabel = 'Add shift'
        if (repeat && repeatDays.length > 0) {
          const rf = dateFrom ?? date
          const rt = dateTo   ?? addDays(date, 6)
          const n  = expandRepeatDates(rf, rt).length
          addLabel = `Add ${n} shift${n !== 1 ? 's' : ''}`
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>{addLabel}</Button>
          </div>
        )
      })()}
    </Modal>
  )
}
