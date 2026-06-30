import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  GlobeAltIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import Button from '../common/Button'
import { useTranslations } from '../../i18n'

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, isPublished }) {
  const { t } = useTranslations()
  if (isPublished) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        <GlobeAltIcon className="h-3 w-3" />
        {t('published')}
      </span>
    )
  }
  const map = {
    pending:    { label: t('statusDraft'),   cls: 'bg-amber-100 text-gray-600' },
    processing: { label: t('statusSolving'), cls: 'bg-amber-100 text-amber-700 animate-pulse' },
    completed:  { label: t('statusDraft'),   cls: 'bg-amber-100 text-gray-600' },
    failed:     { label: t('statusFailed'),  cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

// ── Date range display ────────────────────────────────────────────────────────
function DateRange({ dateFrom, dateTo }) {
  if (!dateFrom) return <span className="text-muted text-sm">—</span>
  const fmt = (d) => { try { return format(parseISO(d), 'd MMM yyyy') } catch { return d } }
  if (dateFrom === dateTo) return <span className="text-sm text-dark">{fmt(dateFrom)}</span>
  return (
    <span className="text-sm text-dark">
      {fmt(dateFrom)} – {fmt(dateTo)}
    </span>
  )
}

export default function ScheduleCard({ run, onDelete, onExport, onRename }) {
  const navigate = useNavigate()
  const { t } = useTranslations()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing]             = useState(false)
  const [nameVal, setNameVal]             = useState(run.name ?? '')

  const empCount   = run.employees_data?.length ?? 0
  const shiftCount = run.shifts_data?.length ?? 0

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(run.id)
  }

  const handleRenameSubmit = (e) => {
    e.preventDefault()
    onRename(run.id, nameVal.trim() || null)
    setEditing(false)
  }

  const defaultName = run.date_from
    ? `${t('scheduleNamePrefix')} ${format(parseISO(run.date_from), 'd MMM')}${run.date_to && run.date_to !== run.date_from ? ' – ' + format(parseISO(run.date_to), 'd MMM yyyy') : ''}`
    : `${t('scheduleNamePrefix')} ${format(parseISO(run.created_at), 'd MMM yyyy')}`

  const displayName = run.name || defaultName

  return (
    <div className="bg-white rounded-xl shadow-soft p-5 flex flex-col gap-3 hover:shadow-card transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center gap-2">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder={defaultName}
                className="text-sm font-semibold text-dark border-b border-brand-purple focus:outline-none bg-transparent flex-1 min-w-0"
                onBlur={handleRenameSubmit}
              />
            </form>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h3 className="text-sm font-semibold text-dark truncate">{displayName}</h3>
              <button
                onClick={() => setEditing(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
                title={t('rename')}
              >
                <PencilIcon className="h-3 w-3 text-muted" />
              </button>
            </div>
          )}
          <DateRange dateFrom={run.date_from} dateTo={run.date_to} />
        </div>
        <StatusBadge status={run.status} isPublished={run.is_published} />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted">
        <span>{t('employeesCount', empCount)}</span>
        <span>·</span>
        <span>{t('shiftSlotsCount', shiftCount)}</span>
        {run.score_info && (
          <>
            <span>·</span>
            <span className="font-roboto">{run.score_info}</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => navigate(`/schedules/${run.id}`)}
          className="flex-1"
        >
          <ArrowRightIcon className="h-3.5 w-3.5" />
          {t('open')}
        </Button>

        {(run.status === 'completed') && (
          <button
            onClick={() => onExport(run.id)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-muted hover:text-dark transition-colors"
            title={t('exportToExcel')}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={handleDelete}
          className={`p-2 rounded-lg border transition-colors ${
            confirmDelete
              ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
              : 'border-gray-200 hover:bg-gray-50 text-muted hover:text-red-500'
          }`}
          title={confirmDelete ? t('confirmDeleteAgain') : t('deleteSchedule')}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {confirmDelete && (
        <p className="text-sm text-red-600 text-center">
          {t('deleteScheduleConfirm')}
        </p>
      )}
    </div>
  )
}
