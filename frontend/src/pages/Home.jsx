import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import Badge from '../components/common/Badge'
import ScheduleGantt from '../components/gantt/ScheduleGantt'
import { downloadExport, downloadTemplate, getSubstitutes, getUsage, publishSchedule, solveSchedule, unpublishSchedule, updateAssignments, uploadExcel, validateSchedule } from '../api/schedules'
import { useAuth } from '../context/AuthContext'
import { useTranslations } from '../i18n'
import toast from 'react-hot-toast'

// ── Small dot-progress indicator for free-plan solve quota ───────────────────
function SolveDotsCounter({ used, limit }) {
  if (!limit) return null
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: limit }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${
            i < used ? 'bg-amber-500' : 'bg-amber-200'
          }`}
        />
      ))}
    </span>
  )
}

export default function Home() {
  const { user } = useAuth()
  const { t, isSpanish } = useTranslations(user?.country)
  const fileRef = useRef(null)

  // ── Upload / solve state ───────────────────────────────────────────────────
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [solving, setSolving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [templateDownloading, setTemplateDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // ── Schedule data ──────────────────────────────────────────────────────────
  const [runId, setRunId] = useState(null)
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [assignments, setAssignments] = useState([])
  const [solved, setSolved] = useState(false)
  const [scoreInfo, setScoreInfo] = useState(null)
  const [isPublished, setIsPublished] = useState(false)

  // ── Free-plan usage counter ────────────────────────────────────────────────
  const [usage, setUsage] = useState(null) // { solves_used, solves_limit, plan }

  useEffect(() => {
    if (!user) return
    getUsage().then(setUsage).catch(() => {})
  }, [user])

  // Re-fetch usage after a successful solve so the counter updates immediately
  const refreshUsage = () => getUsage().then(setUsage).catch(() => {})

  // ── Edit state ─────────────────────────────────────────────────────────────
  // violations: { [shift_id]: [{rule, message, severity}] }
  const [violations, setViolations] = useState({})
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)

  const violationCount = useMemo(
    () => Object.values(violations).reduce((n, v) => n + v.length, 0),
    [violations]
  )

  // ── Stripe redirect check ──────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      toast.success(t('toastPaymentSuccess'))
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      toast.error(t('toastFiletype'))
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
      setRunId(data.run_id)
      setEmployees(data.employees)
      setShifts(data.shifts)
      setAssignments(
        data.shifts.map((s) => ({
          shift_id: s.id,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          required_skills: s.required_skills,
          slot_index: s.slot_index,
          employee_id: null,
          employee_name: null,
        }))
      )
      setSolved(false)
      setScoreInfo(null)
      setViolations({})
      setHasUnsavedEdits(false)
      setIsPublished(false)
      toast.success(t('toastUploaded', data.employee_count, data.shift_slot_count))
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('toastUploadFail'))
    } finally {
      setUploading(false)
    }
  }

  const handleSolve = async () => {
    if (!runId) return
    // Auto-save any pending manual edits so the solver warm-starts from them
    if (hasUnsavedEdits) await persistEdits(true)
    setSolving(true)
    try {
      const run = await solveSchedule(runId)
      if (run.status === 'completed' && run.result_data?.assignments) {
        setAssignments(run.result_data.assignments.map((a) => ({ ...a, source: 'SOLVER' })))
        setSolved(true)
        setScoreInfo(run.score_info)
        setViolations({})
        setHasUnsavedEdits(false)
        setIsPublished(false)   // re-solve unpublishes so manager must re-confirm
        refreshUsage()
        toast.success(t('toastSolved'))
      } else if (run.status === 'failed') {
        toast.error(run.error_message ?? t('toastSolveFail'))
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('toastSolveFail'))
    } finally {
      setSolving(false)
    }
  }

  const handleDownload = async () => {
    if (!runId) return
    // Auto-save before export so the backend has the latest assignments
    if (hasUnsavedEdits) await persistEdits(true)
    setDownloading(true)
    try {
      await downloadExport(runId)
    } catch {
      toast.error(t('toastDownloadFail'))
    } finally {
      setDownloading(false)
    }
  }

  const handleTemplateDownload = async () => {
    setTemplateDownloading(true)
    try {
      await downloadTemplate()
    } catch {
      window.location.href = '/schedule_template.xlsx'
    } finally {
      setTemplateDownloading(false)
    }
  }

  const resetUpload = () => {
    setFile(null)
    setRunId(null)
    setEmployees([])
    setShifts([])
    setAssignments([])
    setSolved(false)
    setScoreInfo(null)
    setViolations({})
    setHasUnsavedEdits(false)
    setIsPublished(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Manual edit handlers ───────────────────────────────────────────────────

  const handleReassign = useCallback((shiftId, newEmpId) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.shift_id === shiftId
          ? {
              ...a,
              employee_id:   newEmpId || null,
              employee_name: newEmpId
                ? employees.find((e) => e.id === newEmpId)?.name ?? null
                : null,
              source: 'MANUAL',
            }
          : a
      )
    )
    // Clear any violations for this shift — they'll be rechecked on next validate
    setViolations((prev) => {
      if (!prev[shiftId]) return prev
      const next = { ...prev }
      delete next[shiftId]
      return next
    })
    setHasUnsavedEdits(true)
  }, [employees])

  const handleDeleteShift = useCallback((shiftId) => {
    setShifts((prev) => prev.filter((s) => s.id !== shiftId))
    setAssignments((prev) => prev.filter((a) => a.shift_id !== shiftId))
    setViolations((prev) => {
      const next = { ...prev }
      delete next[shiftId]
      return next
    })
    setHasUnsavedEdits(true)
  }, [])

  const handleCreateShift = useCallback((shiftData, empId) => {
    const emp = empId ? employees.find((e) => e.id === empId) : null
    setShifts((prev) => [...prev, shiftData])
    setAssignments((prev) => [
      ...prev,
      {
        shift_id:        shiftData.id,
        date:            shiftData.date,
        start_time:      shiftData.start_time,
        end_time:        shiftData.end_time,
        required_skills: shiftData.required_skills,
        slot_index:      shiftData.slot_index,
        employee_id:     empId || null,
        employee_name:   emp?.name ?? null,
        source:          'MANUAL',
      },
    ])
    setHasUnsavedEdits(true)
  }, [employees])

  // ── Persist edits to backend ───────────────────────────────────────────────

  const persistEdits = async (silent = false) => {
    if (!runId) return
    setSaving(true)
    try {
      await updateAssignments(runId, assignments, shifts)
      setHasUnsavedEdits(false)
      setSolved(true) // mark exportable
      setScoreInfo(null)
      if (!silent) toast.success('Changes saved.')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  // ── Validate constraints ───────────────────────────────────────────────────

  const handleValidate = async () => {
    if (!runId) return
    setValidating(true)
    try {
      const result = await validateSchedule(runId, assignments, employees, shifts)
      // Transform array → map for fast lookup
      const map = {}
      for (const v of result.violations ?? []) {
        if (!map[v.shift_id]) map[v.shift_id] = []
        map[v.shift_id].push(v)
      }
      setViolations(map)
      const hardCount = (result.violations ?? []).filter((v) => v.severity === 'hard').length
      if (hardCount === 0) {
        toast.success('No hard constraint violations found.')
      } else {
        toast.error(`${hardCount} constraint violation${hardCount > 1 ? 's' : ''} found — highlighted in red.`)
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Validation failed.')
    } finally {
      setValidating(false)
    }
  }

  // ── Publish / unpublish ───────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!runId) return
    // Auto-save before publishing so the backend has the latest assignments
    if (hasUnsavedEdits) await persistEdits(true)
    setPublishing(true)
    try {
      if (isPublished) {
        await unpublishSchedule(runId)
        setIsPublished(false)
        toast.success('Schedule unpublished.')
      } else {
        await publishSchedule(runId)
        setIsPublished(true)
        toast.success('Schedule published! Employees can now see their shifts.')
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to update published status.')
    } finally {
      setPublishing(false)
    }
  }

  // ── Sick-call substitute finder ────────────────────────────────────────────

  const handleFindSubstitutes = useCallback(async (shiftId) => {
    if (!runId) return []
    return getSubstitutes(runId, shiftId, { assignments, employees, shifts })
  }, [runId, assignments, employees, shifts])

  const hasData = employees.length > 0 && shifts.length > 0
  const canExport = solved || hasUnsavedEdits

  return (
    <Layout title={t('navSchedule')}>
      {/* ── Upload Card ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft mb-5">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">{t('uploadSchedule')}</h2>
            <p className="text-xs text-muted mt-0.5">{t('uploadSubtitle')}</p>
          </div>
          <Button variant="primary" size="sm" onClick={handleTemplateDownload} loading={templateDownloading}>
            <DocumentArrowDownIcon className="h-4 w-4" />
            {t('downloadTemplate')}
          </Button>
        </div>

        <div className="p-6">
          {/* Tier info */}
          {user && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-center gap-2 flex-wrap ${
              user.plan === 'paid'
                ? 'bg-brand-teal/10 text-teal-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700'
            }`}>
              {user.plan === 'paid' ? (
                <>
                  <Badge colour="teal">Pro</Badge>
                  {t('planPro')}
                </>
              ) : (
                <>
                  <Badge colour="amber">Free</Badge>
                  {t('planFree')}
                  {usage && (
                    <span className="ml-auto flex items-center gap-1.5 font-semibold">
                      <SolveDotsCounter used={usage.solves_used} limit={usage.solves_limit} />
                      {usage.solves_used}/{usage.solves_limit} auto-schedules used this month
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Drop zone */}
          <div
            className={[
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-brand-purple bg-brand-lavender-light/30'
                : file ? 'border-brand-teal bg-brand-teal/5'
                : 'border-gray-200 hover:border-brand-purple hover:bg-brand-lavender-light/10',
            ].join(' ')}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => handleFile(e.target.files[0])} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <DocumentArrowDownIcon className="h-10 w-10 text-brand-teal" />
                <p className="font-medium text-dark text-sm">{file.name}</p>
                <p className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB · {isSpanish ? 'Haz clic para cambiar' : 'Click to change'}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ArrowUpTrayIcon className="h-10 w-10 text-muted" />
                <p className="font-medium text-dark text-sm">{t('dropzone')}</p>
                <p className="text-xs text-muted">{t('dropzoneSub')}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Button onClick={handleUpload} disabled={!file} loading={uploading} className="flex-shrink-0">
              <ArrowUpTrayIcon className="h-4 w-4" />
              {t('upload')}
            </Button>
            {file && (
              <Button variant="ghost" size="sm" onClick={resetUpload}>
                <XCircleIcon className="h-4 w-4" />
                {t('clear')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Gantt Card ────────────────────────────────────────────────── */}
      {hasData ? (
        <div className="bg-white rounded-xl shadow-soft">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-dark flex items-center gap-2">
                {t('schedulePreview')}
                {isPublished && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    <GlobeAltIcon className="h-3 w-3" />
                    Published
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t('statLine', employees.length, shifts.length, [...new Set(shifts.map(s => s.date))].length)}
                {solved && scoreInfo && (() => {
                  const hasHard = scoreInfo.includes('-') && !scoreInfo.startsWith('0hard')
                  return (
                    <span className={`ml-2 font-medium ${hasHard ? 'text-red-600' : 'text-teal-600'}`}>
                      · Score: {scoreInfo}
                      {hasHard && ` ⚠ ${t('hardViolations')}`}
                    </span>
                  )
                })()}
                {hasUnsavedEdits && (
                  <span className="ml-2 text-amber-600 font-medium">· Unsaved changes</span>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Violation badge */}
              {violationCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  {violationCount} violation{violationCount !== 1 ? 's' : ''}
                </span>
              )}

              {/* Validate */}
              <Button variant="secondary" size="sm" onClick={handleValidate} loading={validating} disabled={solving}>
                {violationCount > 0
                  ? <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                  : <ShieldCheckIcon className="h-4 w-4" />}
                {validating ? 'Checking…' : 'Validate'}
              </Button>

              {/* Save edits */}
              {hasUnsavedEdits && (
                <Button variant="secondary" size="sm" onClick={() => persistEdits(false)} loading={saving}>
                  <CheckCircleIcon className="h-4 w-4" />
                  Save edits
                </Button>
              )}

              {/* Auto-schedule / Re-schedule */}
              <Button variant="teal" onClick={handleSolve} loading={solving} disabled={solving}>
                <BoltIcon className="h-4 w-4" />
                {solving ? t('scheduling') : solved ? t('reschedule') : t('autoSchedule')}
              </Button>

              {/* Download */}
              {canExport && (
                <Button variant="secondary" onClick={handleDownload} loading={downloading}>
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {t('downloadExcel')}
                </Button>
              )}

              {/* Publish */}
              {canExport && (
                <Button
                  variant={isPublished ? 'secondary' : 'teal'}
                  size="sm"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={publishing}
                >
                  <GlobeAltIcon className="h-4 w-4" />
                  {isPublished ? 'Unpublish' : 'Publish schedule'}
                </Button>
              )}
            </div>
          </div>

          {solving ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-muted">{t('optimising')}</p>
            </div>
          ) : (
            <ScheduleGantt
              employees={employees}
              shifts={shifts}
              assignments={assignments}
              violations={violations}
              onReassign={handleReassign}
              onDeleteShift={handleDeleteShift}
              onCreateShift={handleCreateShift}
              onFindSubstitutes={handleFindSubstitutes}
              editable
            />
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-soft">
          <EmptyState
            icon={CalendarDaysIcon}
            title={t('noSchedule')}
            description={t('noScheduleDesc')}
          />
        </div>
      )}
    </Layout>
  )
}
