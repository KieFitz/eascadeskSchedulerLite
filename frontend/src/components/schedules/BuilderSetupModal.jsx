import { useEffect, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { createBuilderSchedule, listSchedules } from '../../api/schedules'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

function toLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayLocalISO() {
  return toLocalISO(new Date())
}

function nextMonday(isoToday) {
  const d = new Date(isoToday + 'T00:00:00')
  const dow = d.getDay()
  const diff = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow
  d.setDate(d.getDate() + diff)
  return toLocalISO(d)
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISO(d)
}

function diffDays(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00')
  const b = new Date(toISO + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}

function formatDateRange(from, to) {
  const fmt = (s) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-IE', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  return `${fmt(from)} → ${fmt(to)}`
}

function remapShifts(shiftsData, oldDateFrom, newDateFrom) {
  if (!shiftsData || !oldDateFrom || !newDateFrom) return []
  const offset = diffDays(oldDateFrom, newDateFrom)
  return shiftsData.map((s) => ({
    ...s,
    // Assign a new UUID so there are no ID collisions with the source run
    id: crypto.randomUUID(),
    date: addDays(s.date, offset),
  }))
}

const DURATION_OPTIONS = [
  { label: '1 week',  days: 7  },
  { label: '2 weeks', days: 14 },
  { label: '4 weeks', days: 28 },
]

export default function BuilderSetupModal({ open, onClose, onCreated }) {
  const { user } = useAuth()
  const isPro = user?.plan === 'paid'

  const [name,         setName]         = useState('')
  const [weekStart,    setWeekStart]    = useState(() => nextMonday(todayLocalISO()))
  const [durationDays, setDurationDays] = useState(7)
  const [creating,     setCreating]     = useState(false)

  const [prevRuns,     setPrevRuns]     = useState([])
  const [copyFromId,   setCopyFromId]   = useState('')

  const dateTo = weekStart ? addDays(weekStart, durationDays - 1) : ''

  useEffect(() => {
    if (!open) return
    setName('')
    setWeekStart(nextMonday(todayLocalISO()))
    setDurationDays(7)
    setCreating(false)
    setCopyFromId('')
    listSchedules()
      .then((runs) => {
        // Only offer runs that have shifts to copy
        const eligible = runs.filter(
          (r) => r.shifts_data && r.shifts_data.length > 0 && r.date_from
        )
        setPrevRuns(eligible)
      })
      .catch(() => setPrevRuns([]))
  }, [open])

  async function handleCreate() {
    if (!weekStart) { toast.error('Pick a start date.'); return }
    setCreating(true)
    try {
      let shifts = null
      if (copyFromId) {
        const src = prevRuns.find((r) => r.id === copyFromId)
        if (src?.shifts_data && src.date_from) {
          shifts = remapShifts(src.shifts_data, src.date_from, weekStart)
        }
      }

      const run = await createBuilderSchedule({
        name: name.trim() || null,
        date_from: weekStart,
        date_to: dateTo,
        employees: [],
        shifts,
      })
      toast.success(
        shifts
          ? `Schedule created with ${shifts.length} shifts copied — assign employees or auto-schedule.`
          : 'Schedule created — click the Gantt to add shifts.'
      )
      onCreated(run.id)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to create schedule.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Schedule" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            placeholder="e.g. Week 20 – Shop Floor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Duration</label>
          <div className="flex gap-2">
            {DURATION_OPTIONS.map((opt) => {
              const locked = !isPro && opt.days > 7
              return (
                <button
                  key={opt.days}
                  disabled={locked}
                  onClick={() => setDurationDays(opt.days)}
                  className={[
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                    locked
                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                      : durationDays === opt.days
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'bg-white text-muted border-gray-200 hover:border-brand-purple',
                  ].join(' ')}
                >
                  {opt.label}
                  {locked && <span className="block text-[10px] mt-0.5 text-gray-400">Pro only</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Start date</label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
          {weekStart && dateTo && (
            <p className="text-xs text-muted mt-1">{formatDateRange(weekStart, dateTo)}</p>
          )}
        </div>

        {prevRuns.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Copy shifts from <span className="text-gray-400">(optional)</span>
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple bg-white"
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value)}
            >
              <option value="">— Start blank —</option>
              {prevRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name
                    ? `${r.name} (${r.date_from})`
                    : `${r.date_from} → ${r.date_to}`}
                  {' '}· {r.shifts_data.length} shift{r.shifts_data.length !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
            {copyFromId && (
              <p className="text-xs text-muted mt-1">
                Shift times and skills will be copied; dates will be moved to match the new start date. Assignments are cleared so you can re-assign or auto-schedule.
              </p>
            )}
          </div>
        )}

        {isPro && (
          <p className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2">
            All active employees and their availability will be loaded automatically.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} loading={creating} disabled={!weekStart}>
            Create Schedule
          </Button>
        </div>
      </div>
    </Modal>
  )
}
