import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpTrayIcon,
  CalendarDaysIcon,
  DocumentArrowDownIcon,
  PencilSquareIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import ScheduleCard from '../components/schedules/ScheduleCard'
import OvertimeReport from '../components/schedules/OvertimeReport'
import BuilderSetupModal from '../components/schedules/BuilderSetupModal'
import { deleteSchedule, downloadExport, downloadTemplate, listSchedules, renameSchedule, uploadExcel } from '../api/schedules'
import { useAuth } from '../context/AuthContext'
import { useTranslations } from '../i18n'
import toast from 'react-hot-toast'

export default function ScheduleList() {
  const { user } = useAuth()
  const { t } = useTranslations()
  const navigate  = useNavigate()
  const fileRef   = useRef(null)

  const [runs, setRuns]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging]   = useState(false)
  const [file, setFile]           = useState(null)
  const [templateDownloading, setTemplateDownloading] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)

  // Poll for any runs currently in "processing" state
  const pollingRef = useRef(null)

  const fetchRuns = useCallback(async () => {
    try {
      const data = await listSchedules()
      setRuns(data)
      return data
    } catch {
      return []
    }
  }, [])

  const startPollingIfNeeded = useCallback((data) => {
    const hasSolving = data.some((r) => r.status === 'processing')
    if (hasSolving && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchRuns()
        if (!updated.some((r) => r.status === 'processing')) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }, 3000)
    }
  }, [fetchRuns])

  useEffect(() => {
    fetchRuns().then((data) => {
      setLoading(false)
      startPollingIfNeeded(data)
    })
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [fetchRuns, startPollingIfNeeded])

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      toast.error(t('uploadExcelInvalid'))
      return
    }
    setFile(f)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      const data = await uploadExcel(file)
      toast.success(t('uploadedToast', data.employee_count, data.shift_slot_count))
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      // Navigate straight to the editor for the new run
      navigate(`/schedules/${data.run_id}`)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('uploadFailExcel'))
    } finally {
      setUploading(false)
    }
  }

  const handleTemplateDownload = async () => {
    setTemplateDownloading(true)
    try { await downloadTemplate() }
    catch { window.location.href = '/schedule_template.xlsx' }
    finally { setTemplateDownloading(false) }
  }

  // ── Card actions ──────────────────────────────────────────────────────────
  const handleDelete = async (runId) => {
    try {
      await deleteSchedule(runId)
      setRuns((prev) => prev.filter((r) => r.id !== runId))
      toast.success(t('scheduleDeleted'))
    } catch {
      toast.error(t('scheduleDeleteFail'))
    }
  }

  const handleExport = async (runId) => {
    try { await downloadExport(runId) }
    catch { toast.error(t('exportFail')) }
  }

  const handleRename = async (runId, name) => {
    try {
      const updated = await renameSchedule(runId, name)
      setRuns((prev) => prev.map((r) => r.id === runId ? { ...r, name: updated.name } : r))
    } catch {
      toast.error(t('renameFail'))
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const active = runs.find(
    (r) => r.is_published && r.date_from <= today && r.date_to >= today
  )
  const rest = runs.filter((r) => r !== active)

  return (
    <Layout title={t('mySchedulesTitle')}>
      {/* ── Upload card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft mb-5">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">{t('newSchedule')}</h2>
            <p className="text-xs text-muted mt-0.5">
              {t('newScheduleSub')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => setBuilderOpen(true)}>
              <PencilSquareIcon className="h-4 w-4" />
              {t('buildSchedule')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleTemplateDownload} loading={templateDownloading}>
              <DocumentArrowDownIcon className="h-4 w-4" />
              {t('downloadTemplate')}
            </Button>
          </div>
        </div>
        <div className="p-6">
          <div
            className={[
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
              dragging ? 'border-brand-purple bg-brand-lavender-light/30'
                : file  ? 'border-brand-teal bg-brand-teal/5'
                : 'border-gray-200 hover:border-brand-purple hover:bg-brand-lavender-light/10',
            ].join(' ')}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <DocumentArrowDownIcon className="h-8 w-8 text-brand-teal" />
                <p className="font-medium text-dark text-sm">{file.name}</p>
                <p className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB · {t('clickToChange')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ArrowUpTrayIcon className="h-8 w-8 text-muted" />
                <p className="font-medium text-dark text-sm">{t('dropScheduleExcel')}</p>
                <p className="text-xs text-muted">{t('dropOrBrowse')}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={handleUpload} disabled={!file} loading={uploading}>
              <ArrowUpTrayIcon className="h-4 w-4" />
              {t('uploadAndOpen')}
            </Button>
            {file && (
              <Button variant="ghost" size="sm" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                <XCircleIcon className="h-4 w-4" />
                {t('clear')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Overtime / Hours Overview ────────────────────────────────── */}
      <div className="mb-5">
        <OvertimeReport />
      </div>

      {/* ── Active schedule ──────────────────────────────────────────── */}
      {active && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            {t('activeScheduleThisWeek')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <ScheduleCard
              run={active}
              onDelete={handleDelete}
              onExport={handleExport}
              onRename={handleRename}
            />
          </div>
        </div>
      )}

      {/* ── All schedules ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : runs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-soft">
          <EmptyState
            icon={CalendarDaysIcon}
            title={t('noSchedulesYet')}
            description={t('noSchedulesDesc')}
          />
        </div>
      ) : (
        <div>
          {rest.length > 0 && (
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              {active ? t('allSchedules') : t('schedules')}
            </h3>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rest.map((run) => (
              <ScheduleCard
                key={run.id}
                run={run}
                onDelete={handleDelete}
                onExport={handleExport}
                onRename={handleRename}
              />
            ))}
          </div>
        </div>
      )}
      <BuilderSetupModal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onCreated={(runId) => {
          setBuilderOpen(false)
          navigate(`/schedules/${runId}`)
        }}
      />
    </Layout>
  )
}
