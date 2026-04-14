import { useMemo, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { format, parseISO } from 'date-fns'

export default function ShiftCreateModal({ date, employees, existingShifts, onCreate, onClose }) {
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [selectedSkills, setSelectedSkills] = useState([])
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [error, setError] = useState('')

  // Collect all unique skills from all employees
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

  const toggleSkill = (skill) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  const handleCreate = () => {
    if (!startTime || !endTime) { setError('Start and end times are required.'); return }
    if (startTime === endTime) { setError('Start and end time must differ.'); return }
    setError('')

    // Generate a shift ID that won't collide with existing ones
    const baseId = `${date}_${startTime}`
    const existing = (existingShifts ?? []).filter((s) => s.id.startsWith(baseId))
    const slotIndex = existing.length

    const newShift = {
      id: `${baseId}_slot${slotIndex}`,
      date,
      start_time: startTime,
      end_time: endTime,
      required_skills: selectedSkills,
      slot_index: slotIndex,
    }

    onCreate(newShift, selectedEmpId || null)
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

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleCreate}>Add shift</Button>
      </div>
    </Modal>
  )
}
