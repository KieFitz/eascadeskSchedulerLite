import { useState } from 'react'
import {
  ExclamationTriangleIcon,
  TrashIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Modal from '../common/Modal'
import Button from '../common/Button'
import Spinner from '../common/Spinner'
import { format, parseISO } from 'date-fns'

// Score badge colour
function ScoreBadge({ score }) {
  const colour =
    score >= 4  ? 'bg-emerald-100 text-emerald-700' :
    score >= 0  ? 'bg-amber-100 text-amber-700'     :
                  'bg-red-100 text-red-600'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colour}`}>
      {score > 0 ? `+${score}` : score}
    </span>
  )
}

export default function ShiftEditModal({
  assignment,
  employees,
  violations,
  onSave,
  onDelete,
  onClose,
  onFindSubstitutes,   // async (shift_id) => [{employee_id, employee_name, score, reasons, ...}]
}) {
  const [selectedEmpId, setSelectedEmpId] = useState(assignment?.employee_id ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Substitute finder state
  const [substitutes, setSubstitutes]   = useState(null)
  const [loadingSubs, setLoadingSubs]   = useState(false)
  const [subsError, setSubsError]       = useState(null)

  if (!assignment) return null

  const shiftViolations = violations?.[assignment.shift_id] ?? []
  const hasViolations   = shiftViolations.length > 0

  const formattedDate = (() => {
    try { return format(parseISO(assignment.date), 'EEEE d MMMM yyyy') }
    catch { return assignment.date }
  })()

  const handleSave = () => {
    onSave(assignment.shift_id, selectedEmpId || null)
    onClose()
  }

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(assignment.shift_id)
    onClose()
  }

  const handleFindSubstitutes = async () => {
    if (!onFindSubstitutes) return
    setLoadingSubs(true)
    setSubsError(null)
    setSubstitutes(null)
    try {
      const subs = await onFindSubstitutes(assignment.shift_id)
      setSubstitutes(subs)
    } catch {
      setSubsError('Could not load substitutes. Please try again.')
    } finally {
      setLoadingSubs(false)
    }
  }

  return (
    <Modal open title="Edit Shift Assignment" onClose={onClose} size="sm">
      {/* Shift info */}
      <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-dark">
            {assignment.start_time} – {assignment.end_time}
          </span>
          {assignment.source === 'SOLVER' ? (
            <span className="text-[10px] font-semibold bg-brand-teal/15 text-teal-700 px-2 py-0.5 rounded-full">Auto-scheduled</span>
          ) : assignment.source === 'MANUAL' ? (
            <span className="text-[10px] font-semibold bg-brand-lavender-light text-brand-purple px-2 py-0.5 rounded-full">Manual</span>
          ) : null}
        </div>
        <p className="text-muted text-xs">{formattedDate}</p>
        {assignment.required_skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {assignment.required_skills.map((s) => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-brand-lavender-light text-brand-purple text-[10px] font-medium">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Constraint violations */}
      {hasViolations && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Constraint violations
          </p>
          {shiftViolations.map((v, i) => (
            <p key={i} className="text-xs text-red-600 pl-5">{v.message}</p>
          ))}
        </div>
      )}

      {/* Employee selector */}
      <label className="block mb-1 text-xs font-semibold text-dark">Assign to</label>
      <select
        value={selectedEmpId}
        onChange={(e) => setSelectedEmpId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
      >
        <option value="">— Unassigned —</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}{emp.skills?.length ? ` (${emp.skills.join(', ')})` : ''}
          </option>
        ))}
      </select>

      {/* Sick-call substitute finder */}
      {onFindSubstitutes && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-dark flex items-center gap-1.5">
              <UserGroupIcon className="h-3.5 w-3.5 text-brand-purple" />
              Find substitute
            </span>
            <button
              onClick={handleFindSubstitutes}
              disabled={loadingSubs}
              className="flex items-center gap-1 text-xs font-medium text-brand-purple hover:text-brand-purple/80 disabled:opacity-50 transition-colors"
            >
              {loadingSubs ? <Spinner size="sm" /> : null}
              {loadingSubs ? 'Searching…' : 'Search'}
            </button>
          </div>

          {subsError && (
            <p className="text-xs text-red-500">{subsError}</p>
          )}

          {substitutes !== null && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {substitutes.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted text-center">No employees found.</p>
              ) : substitutes.slice(0, 6).map((sub) => (
                <button
                  key={sub.employee_id}
                  onClick={() => setSelectedEmpId(sub.employee_id)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                    selectedEmpId === sub.employee_id
                      ? 'bg-brand-lavender-light'
                      : 'hover:bg-gray-50',
                    sub.overlaps || sub.is_unavailable ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {/* Check/X icon */}
                  {sub.skills_ok && !sub.overlaps && !sub.is_unavailable ? (
                    <CheckCircleIcon className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  ) : sub.overlaps ? (
                    <XCircleIcon className="h-4 w-4 text-red-400 flex-shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{sub.employee_name}</p>
                    {sub.reasons.length > 0 && (
                      <p className="text-muted truncate">{sub.reasons.join(' · ')}</p>
                    )}
                  </div>

                  <ScoreBadge score={sub.score} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          onClick={handleDelete}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            confirmDelete
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'text-red-500 hover:bg-red-50 border border-red-200'
          }`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {confirmDelete ? 'Confirm delete' : 'Delete shift'}
        </button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
