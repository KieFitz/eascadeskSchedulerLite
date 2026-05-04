import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import Modal from '../components/common/Modal'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import Badge from '../components/common/Badge'
import {
  createAvailability,
  createEmployee,
  deleteAvailability,
  deleteEmployee,
  listAvailability,
  listEmployees,
  updateEmployee,
} from '../api/employees'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const AVAIL_COLOUR = { preferred: 'teal', unpreferred: 'amber', unavailable: 'gray' }

const EMPTY_FORM = {
  name: '',
  phone: '',
  skills: '',
  min_hours_week: 0,
  cost_per_hour: 0,
  is_active: true,
}

const EMPTY_AVAIL = {
  type: 'preferred',
  day_of_week: '0',
  start: '09:00',
  end: '17:00',
}

function minutesToHHMM(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

function hhmmToMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

function availSummary(rules) {
  if (!rules || rules.length === 0) return null
  const counts = { preferred: 0, unpreferred: 0, unavailable: 0 }
  rules.forEach((r) => { counts[r.type] = (counts[r.type] || 0) + 1 })
  return counts
}

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  // Cache availability per employee so we don't re-fetch on collapse/expand
  const [availCache, setAvailCache] = useState({})

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await listEmployees()
      setEmployees(data)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to load employees')
    }
  }, [])

  useEffect(() => {
    fetchEmployees().finally(() => setLoading(false))
  }, [fetchEmployees])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (emp) => {
    setEditingId(emp.id)
    setForm({
      name: emp.name,
      phone: emp.phone,
      skills: emp.skills.join(', '),
      min_hours_week: emp.min_hours_week,
      cost_per_hour: emp.cost_per_hour,
      is_active: emp.is_active,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        min_hours_week: Number(form.min_hours_week) || 0,
        cost_per_hour: Number(form.cost_per_hour) || 0,
        is_active: form.is_active,
      }
      if (editingId) {
        const updated = await updateEmployee(editingId, payload)
        setEmployees((prev) => prev.map((e) => (e.id === editingId ? updated : e)))
        toast.success('Employee updated')
      } else {
        const created = await createEmployee(payload)
        setEmployees((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Employee added')
      }
      setModalOpen(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.name}? This will also remove their availability and clock history.`)) return
    try {
      await deleteEmployee(emp.id)
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id))
      setAvailCache((prev) => { const c = { ...prev }; delete c[emp.id]; return c })
      toast.success('Employee deleted')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Delete failed')
    }
  }

  const handleAvailChange = (empId, rules) => {
    setAvailCache((prev) => ({ ...prev, [empId]: rules }))
  }

  const toggleExpand = async (emp) => {
    if (expandedId === emp.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(emp.id)
    if (!availCache[emp.id]) {
      try {
        const rules = await listAvailability(emp.id)
        setAvailCache((prev) => ({ ...prev, [emp.id]: rules }))
      } catch {
        toast.error('Failed to load availability')
      }
    }
  }

  return (
    <Layout title="Employees">
      <div className="bg-white rounded-xl shadow-soft">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">Roster</h2>
            <p className="text-xs text-muted mt-0.5">
              Persistent employee directory. Phone numbers identify employees with the WhatsApp clock-in bot.
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <PlusIcon className="h-4 w-4" />
            Add employee
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title="No employees yet"
            description="Add your first employee to start building a persistent roster."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Skills</th>
                  <th className="px-4 py-3 text-left">Availability</th>
                  <th className="px-4 py-3 text-right">Min hrs/wk</th>
                  <th className="px-4 py-3 text-right">€/hr</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => {
                  const expanded = expandedId === emp.id
                  const rules = availCache[emp.id]
                  const counts = availSummary(rules)
                  return (
                    <Fragment key={emp.id}>
                      <tr className="hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(emp)}
                            className="text-muted hover:text-dark"
                            title={expanded ? 'Hide availability' : 'Edit availability'}
                          >
                            {expanded
                              ? <ChevronDownIcon className="h-4 w-4" />
                              : <ChevronRightIcon className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-dark">{emp.name}</td>
                        <td className="px-4 py-3 text-muted font-mono text-xs">{emp.phone}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.skills.length === 0
                              ? <span className="text-muted text-xs">—</span>
                              : emp.skills.map((s) => <Badge key={s} colour="purple">{s}</Badge>)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {!rules ? (
                            <span className="text-muted text-xs">expand to view</span>
                          ) : counts === null ? (
                            <span className="text-muted text-xs">no rules</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {counts.preferred > 0 && (
                                <Badge colour="teal">{counts.preferred} pref</Badge>
                              )}
                              {counts.unpreferred > 0 && (
                                <Badge colour="amber">{counts.unpreferred} unpref</Badge>
                              )}
                              {counts.unavailable > 0 && (
                                <Badge colour="gray">{counts.unavailable} unavail</Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-dark">{emp.min_hours_week}</td>
                        <td className="px-4 py-3 text-right text-dark">{emp.cost_per_hour.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {emp.is_active
                            ? <Badge colour="teal">Active</Badge>
                            : <Badge colour="gray">Inactive</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(emp)}
                            className="text-muted hover:text-brand-purple p-1.5 rounded transition-colors"
                            title="Edit"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp)}
                            className="text-muted hover:text-red-500 p-1.5 rounded transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="bg-gray-50/40">
                          <td colSpan={9} className="px-6 py-4">
                            <AvailabilityPanel
                              employeeId={emp.id}
                              rules={rules ?? []}
                              onChange={(updated) => handleAvailChange(emp.id, updated)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit employee modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit employee' : 'Add employee'}
      >
        <div className="space-y-3">
          <Input
            label="Full name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Phone (E.164, e.g. +353871234567)"
            required
            placeholder="+353871234567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Skills (comma separated)"
            placeholder="barista, cashier"
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Min hours / week"
              type="number"
              min="0"
              max="168"
              value={form.min_hours_week}
              onChange={(e) => setForm({ ...form, min_hours_week: e.target.value })}
            />
            <Input
              label="Cost per hour (€)"
              type="number"
              step="0.01"
              min="0"
              value={form.cost_per_hour}
              onChange={(e) => setForm({ ...form, cost_per_hour: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-dark cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
            />
            Active (can clock in via WhatsApp)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.name || !form.phone}>
              {editingId ? 'Save changes' : 'Add employee'}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}

// ── Availability panel (rendered inline below each expanded row) ──────────────

function AvailabilityPanel({ employeeId, rules, onChange }) {
  const [form, setForm] = useState(EMPTY_AVAIL)
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    try {
      const created = await createAvailability(employeeId, {
        type: form.type,
        day_of_week: Number(form.day_of_week),
        start_min: hhmmToMinutes(form.start),
        end_min: hhmmToMinutes(form.end),
      })
      onChange([...rules, created])
      setForm(EMPTY_AVAIL)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to add rule')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id) => {
    try {
      await deleteAvailability(employeeId, id)
      onChange(rules.filter((r) => r.id !== id))
    } catch {
      toast.error('Failed to remove rule')
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
        Availability rules
      </p>

      {rules.length === 0 ? (
        <p className="text-xs text-muted mb-3">No rules — employee is fully available by default.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-gray-100 text-xs"
            >
              <Badge colour={AVAIL_COLOUR[r.type]}>{r.type}</Badge>
              <span className="text-dark font-medium">
                {r.specific_date ? r.specific_date : DAY_FULL[r.day_of_week]}
              </span>
              <span className="text-muted font-mono">
                {minutesToHHMM(r.start_min)}–{minutesToHHMM(r.end_min)}
              </span>
              <button
                onClick={() => handleRemove(r.id)}
                className="text-muted hover:text-red-500 ml-1"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add rule form */}
      <div className="flex flex-wrap items-end gap-2 bg-white rounded-lg p-3 border border-dashed border-gray-200">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
          >
            <option value="preferred">Preferred</option>
            <option value="unpreferred">Unpreferred</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Day of week</label>
          <select
            value={form.day_of_week}
            onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">From</label>
          <input
            type="time"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">To</label>
          <input
            type="time"
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
          />
        </div>
        <Button size="sm" onClick={handleAdd} loading={adding}>
          <PlusIcon className="h-4 w-4" />
          Add rule
        </Button>
      </div>
    </div>
  )
}
