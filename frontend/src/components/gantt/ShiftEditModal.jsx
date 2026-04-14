import { useState } from 'react'
import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { format, parseISO } from 'date-fns'

export default function ShiftEditModal({ assignment, employees, violations, onSave, onDelete, onClose }) {
  const [selectedEmpId, setSelectedEmpId] = useState(assignment?.employee_id ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!assignment) return null

  const shiftViolations = violations?.[assignment.shift_id] ?? []
  const hasViolations = shiftViolations.length > 0

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
