import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ClockIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import Badge from '../components/common/Badge'
import Select from '../components/common/Select'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'
import {
  listClockEvents,
  createClockEventManual,
  deleteClockEvent,
  getClockEventAudit,
  exportClockCsv,
  requestClockEventEdit,
} from '../api/clock'
import { listEmployees } from '../api/employees'
import { useTranslations } from '../i18n'

const EVENT_COLOUR  = { in: 'teal', out: 'amber', break_start: 'gray', break_end: 'gray' }
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
  const { t } = useTranslations()
  const EVENT_LABEL = {
    in: t('clockIn'), out: t('clockOut'),
    break_start: t('breakStart'), break_end: t('breakEnd'),
  }
  const [events, setEvents]       = useState([])
  const [total, setTotal]         = useState(0)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]           = useState(true)
  const [exporting, setExporting]       = useState(false)
  const [compExporting, setCompExporting] = useState(false)

  // Filters
  const [filterEmp,     setFilterEmp]     = useState('')
  const [filterMonth,   setFilterMonth]   = useState('')
  const [filterFrom,    setFilterFrom]    = useState('')
  const [filterTo,      setFilterTo]      = useState('')
  const [showDeleted,   setShowDeleted]   = useState(false)

  // Pagination
  const [page,    setPage]    = useState(0)
  const [perPage, setPerPage] = useState(50)

  // Manual event modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [manualForm, setManualForm] = useState({ employeeId: '', eventType: 'in', eventAt: '', reason: '' })
  const [saving, setSaving]         = useState(false)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [deleteReason, setDeleteReason]   = useState('')
  const [deleting, setDeleting]           = useState(false)

  // Edit request modal
  const [editTarget, setEditTarget]       = useState(null)
  const [editForm, setEditForm]           = useState({ proposedEventAt: '', reason: '' })
  const [editSaving, setEditSaving]       = useState(false)

  // Audit trail panel
  const [auditEvent, setAuditEvent]   = useState(null)
  const [auditLog, setAuditLog]       = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    try {
      const { total: t, items } = await listClockEvents({
        employeeId:     filterEmp  || undefined,
        dateFrom:       filterFrom || undefined,
        dateTo:         filterTo   || undefined,
        includeDeleted: showDeleted,
        limit:          perPage,
        offset:         page * perPage,
      })
      setTotal(t)
      setEvents(items)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('loadClockFail'))
    }
  }, [filterEmp, filterFrom, filterTo, showDeleted, perPage, page])

  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .catch(() => {})
  }, [])

  // Reset to page 0 when filters or page size change (page itself is excluded)
  useEffect(() => {
    setPage(0)
  }, [filterEmp, filterFrom, filterTo, showDeleted, perPage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    fetchEvents().finally(() => setLoading(false))
  }, [fetchEvents])

  const _downloadCsv = async (audit, setLoaderFn) => {
    setLoaderFn(true)
    try {
      const blob = await exportClockCsv({
        employeeId: filterEmp   || undefined,
        month:      filterMonth || undefined,
        audit,
      })
      const month   = filterMonth || new Date().toISOString().slice(0, 7)
      const suffix  = audit ? 'compliance' : 'records'
      const url  = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement('a')
      link.href  = url
      link.download = `eascadesk_clock_${month.replace('-', '_')}_${suffix}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error(t('exportFail'))
    } finally {
      setLoaderFn(false)
    }
  }

  const handleExportRecords    = () => _downloadCsv(false, setExporting)
  const handleExportCompliance = () => _downloadCsv(true,  setCompExporting)

  const openDeleteModal = (e) => {
    setDeleteTarget({ id: e.id, label: `${e.employee_name} — ${EVENT_LABEL[e.event_type] ?? e.event_type} at ${formatDateTime(e.event_at)}` })
    setDeleteReason('')
  }

  const openEditModal = (e) => {
    // Pre-fill datetime-local input from existing event_at (strip Z, keep local form)
    const localIso = new Date(e.event_at).toISOString().slice(0, 16)
    setEditTarget({ id: e.id, label: `${e.employee_name} — ${EVENT_LABEL[e.event_type] ?? e.event_type} at ${formatDateTime(e.event_at)}` })
    setEditForm({ proposedEventAt: localIso, reason: '' })
  }

  const handleEditSave = async () => {
    if (!editTarget || !editForm.proposedEventAt) return
    setEditSaving(true)
    try {
      await requestClockEventEdit(editTarget.id, {
        proposedEventAt: new Date(editForm.proposedEventAt).toISOString(),
        reason: editForm.reason || undefined,
      })
      setEditTarget(null)
      await fetchEvents()
      toast.success(t('editRequestSent'))
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('editRequestFail'))
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteClockEvent(deleteTarget.id, deleteReason || undefined)
      setDeleteTarget(null)
      await fetchEvents()
      toast.success(t('eventDeletedAudit'))
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('deleteFail'))
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
      toast.success(t('manualRecorded', (EVENT_LABEL[created.event_type] ?? created.event_type)))
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('recordEventFail'))
    } finally {
      setSaving(false)
    }
  }

  const openAuditPanel = async (e) => {
    setAuditEvent({ id: e.id, label: `${e.employee_name} — ${EVENT_LABEL[e.event_type] ?? e.event_type} at ${formatDateTime(e.event_at)}` })
    setAuditLog({ audit_log: [], edit_requests: [] })
    setAuditLoading(true)
    try {
      const data = await getClockEventAudit(e.id)
      setAuditLog(data)
    } catch {
      toast.error(t('loadAuditFail'))
    } finally {
      setAuditLoading(false)
    }
  }

  return (
    <Layout title={t('clockEventsTitle')}>
      <div className="bg-white rounded-xl shadow-soft">
        {/* Header + actions */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">{t('clockLogTitle')}</h2>
            <p className="text-sm text-muted mt-0.5">
              {t('clockLogIntro')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleExportRecords} loading={exporting}>
              <ArrowDownTrayIcon className="h-4 w-4" />
              {t('exportRecords')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportCompliance} loading={compExporting}>
              <ArrowDownTrayIcon className="h-4 w-4" />
              {t('exportCompliance')}
            </Button>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              {t('manualEntry')}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('employeeCol')}</label>
              <Select
                size="sm"
                value={filterEmp}
                onChange={setFilterEmp}
                placeholder={t('allEmployees')}
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('monthExport')}</label>
              <Select
                size="sm"
                value={filterMonth}
                onChange={setFilterMonth}
                placeholder={t('allMonths')}
                options={Array.from({ length: 13 }, (_, i) => {
                  const d = new Date()
                  d.setDate(1)
                  d.setMonth(d.getMonth() - i)
                  const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                  const label = d.toLocaleString(undefined, { year: 'numeric', month: 'long' })
                  return { value: val, label }
                })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('from')}</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('to')}</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted">{t('rowsPerPage')}</label>
              <Select
                size="sm"
                value={String(perPage)}
                onChange={(v) => setPerPage(Number(v))}
                options={[
                  { value: '50', label: t('rowsN', 50) },
                  { value: '100', label: t('rowsN', 100) },
                ]}
              />
            </div>
            <div className="flex items-end gap-3 pb-0.5">
              <div className="flex items-center gap-2">
                <input
                  id="show-deleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
                />
                <label htmlFor="show-deleted" className="text-sm text-muted select-none whitespace-nowrap">{t('showDeleted')}</label>
              </div>
              {(filterEmp || filterMonth || filterFrom || filterTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilterEmp(''); setFilterMonth(''); setFilterFrom(''); setFilterTo('') }}
                >
                  {t('clear')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ClockIcon}
            title={t('noClockEvents')}
            description={t('noClockEventsDesc')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-sm uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">{t('employeeCol')}</th>
                  <th className="px-4 py-3 text-left">{t('phone')}</th>
                  <th className="px-4 py-3 text-left">{t('type')}</th>
                  <th className="px-4 py-3 text-left">{t('colDateTime')}</th>
                  <th className="px-4 py-3 text-left">{t('colSource')}</th>
                  <th className="px-4 py-3 text-left">{t('colFlags')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className={`hover:bg-gray-50/60 ${e.deleted_at ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-dark">{e.employee_name}</td>
                    <td className="px-4 py-3 text-muted font-roboto text-sm">{e.employee_phone}</td>
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
                          <Badge colour="amber" title={t('estimatedTitle')}>
                            {t('estimated')}
                          </Badge>
                        )}
                        {e.pending_edit && (
                          <Badge colour="purple" title={`${formatDateTime(e.pending_edit.proposed_event_at)}${e.pending_edit.reason ? ' — ' + e.pending_edit.reason : ''}`}>
                            {t('pendingEdit')}
                          </Badge>
                        )}
                        {e.deleted_at && (
                          <Badge colour="red" title={`${formatDateTime(e.deleted_at)}${e.delete_reason ? ': ' + e.delete_reason : ''}`}>
                            {t('deletedBadge')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openAuditPanel(e)}
                          className="text-muted hover:text-brand-purple p-1.5 rounded transition-colors"
                          title={t('viewAuditTrail')}
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {!e.deleted_at && (
                          <button
                            onClick={() => openEditModal(e)}
                            className="text-muted hover:text-brand-purple p-1.5 rounded transition-colors"
                            title={e.pending_edit ? t('replacePendingEdit') : t('proposeCorrection')}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        )}
                        {!e.deleted_at && (
                          <button
                            onClick={() => openDeleteModal(e)}
                            className="text-muted hover:text-red-500 p-1.5 rounded transition-colors"
                            title={t('deleteEvent')}
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
            {/* Pagination footer */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted">
                {t('showingEvents', total === 0 ? 0 : page * perPage + 1, Math.min((page + 1) * perPage, total), total)}
                {showDeleted && t('includingDeleted')}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1 text-sm rounded border border-gray-200 text-muted disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-sm rounded border border-gray-200 text-muted disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="px-3 py-1 text-sm text-dark">
                  {t('pageOf', page + 1, Math.max(1, Math.ceil(total / perPage)))}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * perPage >= total}
                  className="px-2 py-1 text-sm rounded border border-gray-200 text-muted disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(Math.ceil(total / perPage) - 1)}
                  disabled={(page + 1) * perPage >= total}
                  className="px-2 py-1 text-sm rounded border border-gray-200 text-muted disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual entry modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('manualClockEntry')}>
        <div className="space-y-3">
          <Select
            label={<>{t('employeeCol')} <span className="text-red-500">*</span></>}
            value={manualForm.employeeId}
            onChange={(v) => setManualForm({ ...manualForm, employeeId: v })}
            placeholder={t('selectEmployee')}
            options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
          />
          <Select
            label={t('eventType')}
            value={manualForm.eventType}
            onChange={(v) => setManualForm({ ...manualForm, eventType: v })}
            options={[
              { value: 'in', label: t('clockIn') },
              { value: 'out', label: t('clockOut') },
            ]}
          />
          <Input
            label={t('dateTimeBlank')}
            type="datetime-local"
            value={manualForm.eventAt}
            onChange={(e) => setManualForm({ ...manualForm, eventAt: e.target.value })}
          />
          <Input
            label={t('reasonNote')}
            value={manualForm.reason}
            onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
            placeholder={t('reasonNotePlaceholder')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button
              onClick={handleManualSave}
              loading={saving}
              disabled={!manualForm.employeeId}
            >
              {t('recordEvent')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('deleteClockEvent')}
      >
        <div className="space-y-3">
          <p className="text-sm text-dark">
            {t('deleteClockBody')}
          </p>
          {deleteTarget && (
            <p className="text-sm text-muted bg-gray-50 rounded-lg px-3 py-2 font-roboto">
              {deleteTarget.label}
            </p>
          )}
          <Input
            label={t('reasonForDeletion')}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder={t('reasonDeletionPlaceholder')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button
              onClick={handleDeleteConfirm}
              loading={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {t('confirmDelete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Audit trail panel */}
      <Modal
        open={!!auditEvent}
        onClose={() => setAuditEvent(null)}
        title={t('auditTrail')}
      >
        {auditEvent && (
          <div className="space-y-4">
            <p className="text-sm text-muted bg-gray-50 rounded-lg px-3 py-2 font-roboto">
              {auditEvent.label}
            </p>
            {auditLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <>
                {/* Audit log */}
                <div>
                  <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('changeLog')}</p>
                  {auditLog.audit_log?.length === 0 ? (
                    <p className="text-sm text-muted text-center py-2">{t('noEntries')}</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {auditLog.audit_log?.map((entry) => (
                        <div key={entry.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Badge colour={ACTION_COLOUR[entry.action] ?? 'gray'}>{entry.action}</Badge>
                            <span className="text-sm text-muted">{formatDateTime(entry.created_at)}</span>
                          </div>
                          <p className="text-sm text-dark"><span className="font-medium">{t('auditBy')}</span> {entry.actor_label}</p>
                          {entry.reason && (
                            <p className="text-sm text-muted mt-0.5"><span className="font-medium">{t('auditReason')}</span> {entry.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit requests */}
                {auditLog.edit_requests?.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('editRequests')}</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {auditLog.edit_requests.map((req) => (
                        <div key={req.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Badge colour={req.status === 'approved' ? 'teal' : req.status === 'rejected' ? 'red' : req.status === 'cancelled' ? 'gray' : 'purple'}>
                              {req.status}
                            </Badge>
                            <span className="text-sm text-muted">{formatDateTime(req.created_at)}</span>
                          </div>
                          <p className="text-sm text-dark"><span className="font-medium">{t('auditProposed')}</span> {formatDateTime(req.proposed_event_at)}</p>
                          {req.reason && <p className="text-sm text-muted mt-0.5"><span className="font-medium">{t('auditReason')}</span> {req.reason}</p>}
                          {req.resolved_at && <p className="text-sm text-muted mt-0.5"><span className="font-medium">{t('auditResolved')}</span> {formatDateTime(req.resolved_at)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setAuditEvent(null)}>{t('close')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit request modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={t('proposeCorrection')}
      >
        <div className="space-y-3">
          <p className="text-sm text-dark">
            {t('correctionBody')}
          </p>
          {editTarget && (
            <p className="text-sm text-muted bg-gray-50 rounded-lg px-3 py-2 font-roboto">
              {editTarget.label}
            </p>
          )}
          <Input
            label={t('correctedDateTime')}
            type="datetime-local"
            value={editForm.proposedEventAt}
            onChange={(e) => setEditForm({ ...editForm, proposedEventAt: e.target.value })}
          />
          <Input
            label={t('reasonCorrection')}
            value={editForm.reason}
            onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
            placeholder={t('reasonCorrectionPlaceholder')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>{t('cancel')}</Button>
            <Button
              onClick={handleEditSave}
              loading={editSaving}
              disabled={!editForm.proposedEventAt}
            >
              {t('sendForApproval')}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
