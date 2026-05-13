import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ClockIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import Badge from '../components/common/Badge'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'
import {
  listClockEvents,
  createClockEventManual,
  deleteClockEvent,
  getClockEventAudit,
  exportClockEventsCsv,
} from '../api/clock'
import { listEmployees } from '../api/employees'

const EVENT_COLOUR  = { in: 'teal', out: 'amber', break_start: 'gray', break_end: 'gray' }
const EVENT_LABEL   = { in: 'Clock in', out: 'Clock out', break_start: 'Break start', break_end: 'Break end' }
const SOURCE_COLOUR = { whatsapp: 'purple', manual: 'gray', auto: 'amber' }
const ACTION_COLOUR = { create: 'teal', edit: 'gray', delete: 'red' }

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ClockEvents() {
  const [events, setEvents]       = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [filterEmp,     setFilterEmp]     = useState('')
  const [filterFrom,    setFilterFrom]    = useState('')
  const [filterTo,      setFilterTo]      = useState('')
  const [showDeleted,   setShowDeleted]   = useState(false)

  // Manual event modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [manualForm, setManualForm] = useState({ employeeId: '', eventType: 'in', eventAt: '', reason: '' })
  const [saving, setSaving]         = useState(false)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget]   = useState(null)  // { id, label }
  const [deleteReason, setDeleteReason]   = useState('')
  const [deleting, setDeleting]           = useState(false)

  // Audit trail panel
  const [auditEvent, setAuditEvent]   = useState(null)  // { id, label }
  const [auditLog, setAuditLog]       = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    try {
      const data = await listClockEvents({
        employeeId:     filterEmp  || undefined,
        dateFrom:       filterFrom || undefined,
        dateTo:         filterTo   || undefined,
        includeDeleted: showDeleted,
      })
      setEvents(data)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to load clock events')
    }
  }, [filterEmp, filterFrom, filterTo, showDeleted])

  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchEvents().finally(() => setLoading(false))
  }, [fetchEvents])

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const blob = await exportClockEventsCsv({
        employeeId:     filterEmp  || undefined,
        dateFrom:       filterFrom || undefined,
        dateTo:         filterTo   || undefined,
        includeDeleted: showDeleted,
      })
      const url  = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement('a')
      link.href  = url
      link.download = `clock_events_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const openDeleteModal = (e) => {
    setDeleteTarget({ id: e.id, label: `${e.employee_name} — ${EVENT_LABEL[e.event_type] ?? e.event_type} at ${formatDateTime(e.event_at)}` })
    setDeleteReason('')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteClockEvent(deleteTarget.id, deleteReason || undefined)
      setDeleteTarget(null)
      await fetchEvents()
      toast.success('Event deleted (kept in audit log)')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const handleManualSave = async () => {
    if (!manualForm.employeeId || !manualForm.eventType) return
    setSaving(true)
    try {
      const created = await createClockEventManual({
        employeeId: manualForm.employeeId,
        eventType:  manualForm.eventType,
        eventAt:    manualForm.eventAt || undefined,
        reason:     manualForm.reason  || undefined,
      })
      setModalOpen(false)
      setManualForm({ employeeId: '', eventType: 'in', eventAt: '', reason: '' })
      await fetchEvents()
      toast.success(`Manual ${created.event_type} recorded`)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to record event')
    } finally {
      setSaving(false)
    }
  }

  const openAuditPanel = async (e) => {
    setAuditEvent({ id: e.id, label: `${e.employee_name} — ${EVENT_LABEL[e.event_type] ?? e.event_type} at ${formatDateTime(e.event_at)}` })
    setAuditLog([])
    setAuditLoading(true)
    try {
      const log = await getClockEventAudit(e.id)
      setAuditLog(log)
    } catch {
      toast.error('Failed to load audit trail')
    } finally {
      setAuditLoading(false)
    }
  }

  return (
    <Layout title="Clock Events">
      <div className="bg-white rounded-xl shadow-soft">
        {/* Header + actions */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">Clock In / Out Log</h2>
            <p className="text-xs text-muted mt-0.5">
              Actual hours worked — recorded via WhatsApp bot or entered manually.
              All deletions are soft-deleted and retained for compliance.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleExportCsv} loading={exporting}>
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Manual entry
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Employee</label>
            <select
              value={filterEmp}
              onChange={(e) => setFilterEmp(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input
              id="show-deleted"
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
            />
            <label htmlFor="show-deleted" className="text-sm text-muted select-none">Show deleted</label>
          </div>
          {(filterEmp || filterFrom || filterTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterEmp(''); setFilterFrom(''); setFilterTo('') }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ClockIcon}
            title="No clock events"
            description="Events are recorded when employees message the WhatsApp bot, or via manual entry."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Date / Time</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Flags</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className={`hover:bg-gray-50/60 ${e.deleted_at ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-dark">{e.employee_name}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{e.employee_phone}</td>
                    <td className="px-4 py-3">
                      <Badge colour={EVENT_COLOUR[e.event_type] ?? 'gray'}>
                        {EVENT_LABEL[e.event_type] ?? e.event_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-dark">{formatDateTime(e.event_at)}</td>
                    <td className="px-4 py-3">
                      <Badge colour={SOURCE_COLOUR[e.source] ?? 'gray'}>{e.source}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {e.is_estimated && (
                          <Badge colour="amber" title="Time was auto-filled from scheduled shift — please review">
                            Estimated
                          </Badge>
                        )}
                        {e.deleted_at && (
                          <Badge colour="red" title={`Deleted ${formatDateTime(e.deleted_at)}${e.delete_reason ? ': ' + e.delete_reason : ''}`}>
                            Deleted
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openAuditPanel(e)}
                          className="text-muted hover:text-brand-purple p-1.5 rounded transition-colors"
                          title="View audit trail"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {!e.deleted_at && (
                          <button
                            onClick={() => openDeleteModal(e)}
                            className="text-muted hover:text-red-500 p-1.5 rounded transition-colors"
                            title="Delete event"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 text-xs text-muted border-t border-gray-100">
              {events.length} event{events.length !== 1 ? 's' : ''}
              {showDeleted && ' (including deleted)'}
            </p>
          </div>
        )}
      </div>

      {/* Manual entry modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Manual clock entry">
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-dark">
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              value={manualForm.employeeId}
              onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-dark">Event type</label>
            <select
              value={manualForm.eventType}
              onChange={(e) => setManualForm({ ...manualForm, eventType: e.target.value })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
            >
              <option value="in">Clock in</option>
              <option value="out">Clock out</option>
            </select>
          </div>
          <Input
            label="Date & time (leave blank for now)"
            type="datetime-local"
            value={manualForm.eventAt}
            onChange={(e) => setManualForm({ ...manualForm, eventAt: e.target.value })}
          />
          <Input
            label="Reason / note (for audit trail)"
            value={manualForm.reason}
            onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
            placeholder="e.g. Employee forgot to clock in via WhatsApp"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleManualSave}
              loading={saving}
              disabled={!manualForm.employeeId}
            >
              Record event
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete clock event"
      >
        <div className="space-y-3">
          <p className="text-sm text-dark">
            This event will be marked as deleted but <strong>kept in the database</strong> for
            Spanish digital clocking compliance. The deletion will be recorded in the audit log
            with your user ID and timestamp.
          </p>
          {deleteTarget && (
            <p className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2 font-mono">
              {deleteTarget.label}
            </p>
          )}
          <Input
            label="Reason for deletion (recommended)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="e.g. Duplicate entry, employee clocked twice"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              onClick={handleDeleteConfirm}
              loading={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Confirm delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Audit trail panel */}
      <Modal
        open={!!auditEvent}
        onClose={() => setAuditEvent(null)}
        title="Audit trail"
      >
        {auditEvent && (
          <div className="space-y-3">
            <p className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2 font-mono">
              {auditEvent.label}
            </p>
            {auditLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No audit entries found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge colour={ACTION_COLOUR[entry.action] ?? 'gray'}>{entry.action}</Badge>
                      <span className="text-xs text-muted">{formatDateTime(entry.created_at)}</span>
                    </div>
                    <p className="text-xs text-dark">
                      <span className="font-medium">By:</span> {entry.actor_label}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-muted mt-0.5">
                        <span className="font-medium">Reason:</span> {entry.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setAuditEvent(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
