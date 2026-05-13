import { useEffect, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { createBuilderSchedule } from '../../api/schedules'
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

function formatDateRange(from, to) {
  const fmt = (s) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-IE', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  return `${fmt(from)} → ${fmt(to)}`
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

  const dateTo = weekStart ? addDays(weekStart, durationDays - 1) : ''

  useEffect(() => {
    if (!open) return
    setName('')
    setWeekStart(nextMonday(todayLocalISO()))
    setDurationDays(7)
    setCreating(false)
  }, [open])

  async function handleCreate() {
    if (!weekStart) { toast.error('Pick a start date.'); return }
    setCreating(true)
    try {
      const run = await createBuilderSchedule({
        name: name.trim() || null,
        date_from: weekStart,
        date_to: dateTo,
        // No employees or shifts — backend auto-loads all Pro DB employees with availability.
        // Free users: backend creates run with empty employees_data; they add employees later via upload.
        employees: [],
        shifts: null,
      })
      toast.success('Schedule created — click the Gantt to add shifts.')
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
