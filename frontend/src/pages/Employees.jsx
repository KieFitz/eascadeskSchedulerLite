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
import Select from '../components/common/Select'
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
import { useTranslations } from '../i18n'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const AVAIL_COLOUR = { preferred: 'teal', unpreferred: 'amber', unavailable: 'gray' }

const EMPTY_FORM = {
  name: '',
  phone: '',
  nif: '',
  skills: '',
  min_hours_week: 0,
  cost_per_hour: 0,
  is_active: true,
}

const EMPTY_AVAIL = {
  type: 'preferred',
  applies: 'weekdays',  // one of APPLIES_OPTIONS values
  day_of_week: '0',
  specific_date: '',
  start: '09:00',
  end: '17:00',
  allDay: false,
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
  const { t } = useTranslations()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [skillInput, setSkillInput] = useState('')
  // Cache availability per employee so we don't re-fetch on collapse/expand
  const [availCache, setAvailCache] = useState({})

  // All unique skills across all employees (lowercased, sorted)
  const allSkills = [...new Set(
    employees.flatMap((e) => e.skills.map((s) => s.toLowerCase()))
  )].sort()

  // Skills currently selected in the form as an array
  const selectedSkills = form.skills
    ? form.skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : []

  const toggleSkill = (skill) => {
    const lower = skill.toLowerCase()
    const current = selectedSkills
    const next = current.includes(lower)
      ? current.filter((s) => s !== lower)
      : [...current, lower]
    setForm({ ...form, skills: next.join(', ') })
  }

  const addSkillFromInput = () => {
    const trimmed = skillInput.trim().toLowerCase()
    if (!trimmed) return
    if (!selectedSkills.includes(trimmed)) {
      setForm({ ...form, skills: [...selectedSkills, trimmed].join(', ') })
    }
    setSkillInput('')
  }

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await listEmployees()
      setEmployees(data)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('loadEmployeesFail'))
    }
  }, [])

  useEffect(() => {
    fetchEmployees().finally(() => setLoading(false))
  }, [fetchEmployees])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSkillInput('')
    setModalOpen(true)
  }

  const openEdit = (emp) => {
    setEditingId(emp.id)
    setForm({
      name: emp.name,
      phone: emp.phone,
      nif: emp.nif ?? '',
      skills: emp.skills.join(', '),
      min_hours_week: emp.min_hours_week,
      cost_per_hour: emp.cost_per_hour,
      is_active: emp.is_active,
    })
    setSkillInput('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        nif: form.nif.trim() || null,
        skills: form.skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        min_hours_week: Number(form.min_hours_week) || 0,
        cost_per_hour: Number(form.cost_per_hour) || 0,
        is_active: form.is_active,
      }
      if (editingId) {
        const updated = await updateEmployee(editingId, payload)
        setEmployees((prev) => prev.map((e) => (e.id === editingId ? updated : e)))
        toast.success(t('employeeUpdated'))
      } else {
        const created = await createEmployee(payload)
        setEmployees((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success(t('employeeAdded'))
      }
      setModalOpen(false)
    } catch (err) {
      const detail = err?.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg ?? String(d)).join(' · ')
        : (detail ?? t('saveFail'))
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(t('deleteEmployeeConfirm', emp.name))) return
    try {
      await deleteEmployee(emp.id)
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id))
      setAvailCache((prev) => { const c = { ...prev }; delete c[emp.id]; return c })
      toast.success(t('employeeDeleted'))
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('deleteFail'))
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
        toast.error(t('loadAvailFail'))
      }
    }
  }

  return (
    <Layout title={t('employeesTitle')}>
      <div className="bg-white rounded-xl shadow-soft">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm text-muted mt-0.5">
              {t('employeesIntro')}
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <PlusIcon className="h-4 w-4" />
            {t('addEmployee')}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title={t('noEmployeesYet')}
            description={t('noEmployeesDesc')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-sm uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">{t('name')}</th>
                  <th className="px-4 py-3 text-left">{t('phone')}</th>
                  <th className="px-4 py-3 text-left">{t('colSkills')}</th>
                  <th className="px-4 py-3 text-left">{t('colAvailability')}</th>
                  <th className="px-4 py-3 text-right">{t('colMinHrs')}</th>
                  <th className="px-4 py-3 text-right">{t('colCostHr')}</th>
                  <th className="px-4 py-3 text-left">{t('status')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
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
                            title={expanded ? t('hideAvailability') : t('editAvailability')}
                          >
                            {expanded
                              ? <ChevronDownIcon className="h-4 w-4" />
                              : <ChevronRightIcon className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-dark">{emp.name}</td>
                        <td className="px-4 py-3 text-muted font-roboto text-sm">{emp.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.skills.length === 0
                              ? <span className="text-muted text-sm">—</span>
                              : emp.skills.map((s) => <Badge key={s} colour="purple">{s}</Badge>)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {!rules ? (
                            <span className="text-muted text-sm">{t('expandToView')}</span>
                          ) : counts === null ? (
                            <span className="text-muted text-sm">{t('noRules')}</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {counts.preferred > 0 && (
                                <Badge colour="teal">{counts.preferred} {t('prefShort')}</Badge>
                              )}
                              {counts.unpreferred > 0 && (
                                <Badge colour="amber">{counts.unpreferred} {t('unprefShort')}</Badge>
                              )}
                              {counts.unavailable > 0 && (
                                <Badge colour="gray">{counts.unavailable} {t('unavailShort')}</Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-dark">{emp.min_hours_week}</td>
                        <td className="px-4 py-3 text-right text-dark">{emp.cost_per_hour.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {emp.is_active
                            ? <Badge colour="teal">{t('active')}</Badge>
                            : <Badge colour="gray">{t('inactive')}</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(emp)}
                            className="text-muted hover:text-brand-purple p-1.5 rounded transition-colors"
                            title={t('edit')}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp)}
                            className="text-muted hover:text-red-500 p-1.5 rounded transition-colors"
                            title={t('delete')}
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
        title={editingId ? t('editEmployee') : t('addEmployee')}
      >
        <div className="space-y-3">
          <Input
            label={t('fullName')}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div>
            <Input
              label={t('phoneLabel')}
              placeholder="+353871234567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <p className="text-sm text-muted mt-1">{t('phoneHint')}</p>
          </div>
          <Input
            label={t('nifLabel')}
            placeholder={t('nifPlaceholder')}
            value={form.nif}
            onChange={(e) => setForm({ ...form, nif: e.target.value })}
          />
          {/* Skills picker */}
          <div>
            <label className="block mb-1.5 text-sm font-semibold text-dark">{t('skillsLabel')}</label>
            {/* Selected skill tags */}
            {selectedSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedSkills.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSkill(s)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium bg-brand-purple text-white hover:bg-opacity-80"
                  >
                    {s} <span className="text-white/70">×</span>
                  </button>
                ))}
              </div>
            )}
            {/* Existing skill suggestions */}
            {allSkills.filter((s) => !selectedSkills.includes(s)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {allSkills.filter((s) => !selectedSkills.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSkill(s)}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-100 text-muted hover:bg-brand-lavender hover:text-dark"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
            {/* Free-text input for new skills */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('newSkillPlaceholder')}
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkillFromInput() } }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
              <button
                type="button"
                onClick={addSkillFromInput}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-sm text-muted hover:bg-brand-lavender hover:text-dark"
              >
                {t('add')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('minHoursWeek')}
              type="number"
              min="0"
              max="168"
              value={form.min_hours_week}
              onChange={(e) => setForm({ ...form, min_hours_week: e.target.value })}
            />
            <Input
              label={t('costPerHour')}
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
            {t('activeWhatsapp')}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.name}>
              {editingId ? t('saveChanges') : t('addEmployee')}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}

// ── Availability panel (rendered inline below each expanded row) ──────────────

function ruleLabel(r, t) {
  const RECURRENCE_LABEL = {
    none:      null,
    weekdays:  t('recurWeekdays'),
    weekends:  t('recurWeekends'),
    every_day: t('recurEveryDay'),
  }
  if (r.recurrence && r.recurrence !== 'none') return RECURRENCE_LABEL[r.recurrence]
  if (r.specific_date) return r.specific_date
  return t('daysFull')[r.day_of_week]
}

function AvailabilityPanel({ employeeId, rules, onChange }) {
  const { t } = useTranslations()
  const [form, setForm] = useState(EMPTY_AVAIL)
  const [adding, setAdding] = useState(false)

  const APPLIES_OPTIONS = [
    { value: 'weekdays',  label: t('appliesWeekdays') },
    { value: 'weekends',  label: t('appliesWeekends') },
    { value: 'every_day', label: t('appliesEveryDay') },
    { value: 'dow',       label: t('appliesDow') },
    { value: 'date',      label: t('appliesDate') },
  ]

  const handleAdd = async () => {
    setAdding(true)
    try {
      const startMin = form.allDay ? 0    : hhmmToMinutes(form.start)
      const endMin   = form.allDay ? 1439 : hhmmToMinutes(form.end)

      const payload = {
        type:      form.type,
        start_min: startMin,
        end_min:   endMin,
      }

      if (form.applies === 'dow') {
        payload.recurrence   = 'none'
        payload.day_of_week  = Number(form.day_of_week)
      } else if (form.applies === 'date') {
        payload.recurrence    = 'none'
        payload.specific_date = form.specific_date
      } else {
        payload.recurrence = form.applies  // weekdays | weekends | every_day
      }

      const created = await createAvailability(employeeId, payload)
      onChange([...rules, created])
      setForm(EMPTY_AVAIL)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('addRuleFail'))
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id) => {
    try {
      await deleteAvailability(employeeId, id)
      onChange(rules.filter((r) => r.id !== id))
    } catch {
      toast.error(t('removeRuleFail'))
    }
  }


  return (
    <div>
      <p className="text-sm uppercase tracking-wider text-muted font-semibold mb-3">
        {t('availabilityRules')}
      </p>

      {/* Rules table */}
      {rules.length === 0 ? (
        <p className="text-sm text-muted mb-3">{t('noRulesDefault')}</p>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-left text-muted border-b border-gray-100">
              <th className="pb-1.5 pr-4 font-medium">{t('type')}</th>
              <th className="pb-1.5 pr-4 font-medium">{t('appliesTo')}</th>
              <th className="pb-1.5 pr-4 font-medium">{t('time')}</th>
              <th className="pb-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-white/60">
                <td className="py-1.5 pr-4">
                  <Badge colour={AVAIL_COLOUR[r.type]}>{t(r.type)}</Badge>
                </td>
                <td className="py-1.5 pr-4 font-medium text-dark">{ruleLabel(r, t)}</td>
                <td className="py-1.5 pr-4 font-roboto text-muted">
                  {minutesToHHMM(r.start_min) === '00:00' && minutesToHHMM(r.end_min) === '23:59'
                    ? t('timeAllDay')
                    : `${minutesToHHMM(r.start_min)} – ${minutesToHHMM(r.end_min)}`}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => handleRemove(r.id)}
                    className="text-muted hover:text-red-500"
                    title={t('removeRule')}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add rule form */}
      <div className="bg-white rounded-lg p-3 border border-dashed border-gray-200 space-y-2">
        <p className="text-sm text-muted font-medium">{t('addRule')}</p>
        <div className="flex flex-wrap items-end gap-2">
          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted">{t('type')}</label>
            <Select
              size="sm"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={[
                { value: 'preferred', label: t('preferred') },
                { value: 'unpreferred', label: t('unpreferred') },
                { value: 'unavailable', label: t('unavailable') },
              ]}
            />
          </div>

          {/* Applies to */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted">{t('appliesTo')}</label>
            <Select
              size="sm"
              value={form.applies}
              onChange={(v) => setForm({ ...form, applies: v })}
              options={APPLIES_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>

          {/* Day picker — only when applies == 'dow' */}
          {form.applies === 'dow' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('day')}</label>
              <Select
                size="sm"
                value={form.day_of_week}
                onChange={(v) => setForm({ ...form, day_of_week: v })}
                options={DAYS.map((d, i) => ({ value: i, label: t('daysFull')[i] }))}
              />
            </div>
          )}

          {/* Date picker — only when applies == 'date' */}
          {form.applies === 'date' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('date')}</label>
              <input
                type="date"
                value={form.specific_date}
                onChange={(e) => setForm({ ...form, specific_date: e.target.value })}
                className="rounded-lg border border-brand-lavender bg-white px-2 py-1.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors duration-150"
              />
            </div>
          )}

          {/* Time range — hidden when All day checked */}
          {!form.allDay && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted">{t('from')}</label>
                <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="rounded-lg border border-brand-lavender bg-white px-2 py-1.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors duration-150" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted">{t('to')}</label>
                <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="rounded-lg border border-brand-lavender bg-white px-2 py-1.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors duration-150" />
              </div>
            </>
          )}

          {/* All day toggle */}
          <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer pb-1.5">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
            />
            {t('allDay')}
          </label>

          <Button size="sm" onClick={handleAdd} loading={adding}
            disabled={form.applies === 'date' && !form.specific_date}>
            <PlusIcon className="h-4 w-4" />
            {t('add')}
          </Button>
        </div>
      </div>
    </div>
  )
}
