import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ClockIcon,
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
import { listClockEvents, createClockEventManual, deleteClockEvent } from '../api/clock'
import { listEmployees } from '../api/employees'
import client from '../api/client'

const EVENT_COLOUR = { in: 'teal', out: 'amber' }
const SOURCE_COLOUR = { whatsapp: 'purple', manual: 'gray' }

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
  const [filterEmp,  setFilterEmp]  = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

  // Manual event modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [manualForm, setManualForm] = useState({ employeeId: '', eventType: 'in', eventAt: '' })
  const [saving, setSaving]         = useState(false)

  const fetchEvents = useCallback(async () => {
    try {
      const data = await listClockEvents({
        employeeId: filterEmp  || undefined,
        dateFrom:   filterFrom || undefined,
        dateTo:     filterTo   || undefined,
      })
      setEvents(data)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to load clock events')
    }
  }, [filterEmp, filterFrom, filterTo])

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
      const params = {}
      if (filterEmp)  params.employee_id = filterEmp
      if (filterFrom) params.date_from   = filterFrom
      if (filterTo)   params.date_to     = filterTo

      const response = await client.get('/clock/events/export.csv', {
        params,
        responseType: 'blob',
      })
      const url  = window.URL.createObjectURL(new Blob([response.data]))
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

  const handleDelete = async (eventId) => {
    if (!window.confirm('Delete this clock event?')) return
    try {
      await deleteClockEvent(eventId)
      setEvents((prev) => prev.filter((e) => e.id !== eventId))
      toast.success('Event deleted')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Delete failed')
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
      })
      setModalOpen(false)
      setManualForm({ employeeId: '', eventType: 'in', eventAt: '' })
      await fetchEvents()
      toast.success(`Manual ${created.event_type} recorded`)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to record event')
    } finally {
      setSaving(false)
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
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-dark">{e.employee_name}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{e.employee_phone}</td>
                    <td className="px-4 py-3">
                      <Badge colour={EVENT_COLOUR[e.event_type]}>
                        {e.event_type === 'in' ? 'Clock in' : 'Clock out'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-dark">{formatDateTime(e.event_at)}</td>
                    <td className="px-4 py-3">
                      <Badge colour={SOURCE_COLOUR[e.source]}>{e.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-muted hover:text-red-500 p-1.5 rounded transition-colors"
                        title="Delete event"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 text-xs text-muted border-t border-gray-100">
              {events.length} event{events.length !== 1 ? 's' : ''}
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
    </Layout>
  )
}
