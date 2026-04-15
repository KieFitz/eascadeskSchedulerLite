import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import Badge from '../components/common/Badge'
import ScheduleGantt from '../components/gantt/ScheduleGantt'
import {
  downloadExport,
  getSchedule,
  getSubstitutes,
  getUsage,
  publishSchedule,
  solveSchedule,
  unpublishSchedule,
  updateAssignments,
  validateSchedule,
} from '../api/schedules'
import { useAuth } from '../context/AuthContext'
import { useTranslations } from '../i18n'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

// ── Dot counter for free plan ─────────────────────────────────────────────────
function SolveDotsCounter({ used, limit }) {
  if (!limit) return null
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: limit }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${i < used ? 'bg-amber-500' : 'bg-amber-200'}`}
        />
      ))}
    </span>
  )
}

// ── Solving progress banner ───────────────────────────────────────────────────
function SolvingBanner({ startedAt }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const origin = startedAt ? new Date(startedAt).getTime() : Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - origin) / 1000)), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  return (
    <div className="relative border-b border-teal-200 bg-teal-50 px-4 py-2.5 flex items-center justify-between gap-4 overflow-hidden">
      <div className="flex items-center gap-2.5">
        <Spinner size="sm" className="text-teal-600" />
        <span className="text-sm font-medium text-teal-800">Optimising schedule…</span>
        <span className="text-xs text-teal-600 tabular-nums">{elapsed}s elapsed</span>
      </div>
      <span className="text-xs text-teal-600 hidden sm:block">
        You can navigate away — the result will be ready when you return.
      </span>
      {/* Indeterminate progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-teal-100" aria-hidden>
        <div className="h-full w-1/3 bg-teal-400 animate-progress" />
      </div>
    </div>
  )
}

export default function ScheduleEditor() {
  const { runId } = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { t, isSpanish } = useTranslations(user?.country)

  // ── Loading / error state ─────────────────────────────────────────────────
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError,   setPageError]   = useState(null)

  // ── Schedule data ─────────────────────────────────────────────────────────
  const [run,         setRun]         = useState(null)
  const [employees,   setEmployees]   = useState([])
  const [shifts,      setShifts]      = useState([])
  const [assignments, setAssignments] = useState([])
  const [solved,      setSolved]      = useState(false)
  const [scoreInfo,   setScoreInfo]   = useState(null)
  const [isPublished, setIsPublished] = useState(false)
  const [solving,     setSolving]     = useState(false)

  // ── Free plan usage ───────────────────────────────────────────────────────
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    if (user) getUsage().then(setUsage).catch(() => {})
  }, [user])
  const refreshUsage = () => getUsage().then(setUsage).catch(() => {})

  // ── Action loading states ─────────────────────────────────────────────────
  const [downloading,  setDownloading]  = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [validating,   setValidating]   = useState(false)
  const [publishing,   setPublishing]   = useState(false)

  // ── Edit state ────────────────────────────────────────────────────────────
  const [violations,      setViolations]      = useState({})
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)

  const hardViolationCount = useMemo(
    () => Object.values(violations).reduce((n, vs) => n + vs.filter((v) => v.severity === 'hard').length, 0),
    [violations]
  )
  const softViolationCount = useMemo(
    () => Object.values(violations).reduce((n, vs) => n + vs.filter((v) => v.severity !== 'hard').length, 0),
    [violations]
  )
  const violationCount = hardViolationCount + softViolationCount

  // ── Polling ───────────────────────────────────────────────────────────────
  const pollingRef = useRef(null)

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const applyRun = useCallback((r) => {
    setRun(r)
    setEmployees(r.employees_data ?? [])
    setShifts(r.shifts_data ?? [])
    const stored = r.result_data?.assignments
    if (stored?.length) {
      setAssignments(stored)
      setSolved(true)
    } else if (r.shifts_data?.length) {
      // No assignments yet — show shifts as unassigned
      setAssignments(
        (r.shifts_data ?? []).map((s) => ({
          shift_id:        s.id,
          date:            s.date,
          start_time:      s.start_time,
          end_time:        s.end_time,
          required_skills: s.required_skills,
          slot_index:      s.slot_index,
          employee_id:     null,
          employee_name:   null,
        }))
      )
      setSolved(false)
    }
    setScoreInfo(r.score_info ?? null)
    setIsPublished(r.is_published ?? false)
    setSolving(r.status === 'processing')
  }, [])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      try {
        const r = await getSchedule(runId)
        if (r.status !== 'processing') {
          stopPolling()
          applyRun(r)
          refreshUsage()
          if (r.status === 'completed') {
            toast.success('Schedule optimised!')
          } else if (r.status === 'failed') {
            toast.error(r.error_message ?? 'Solve failed.')
          }
        }
      } catch { /* ignore transient errors */ }
    }, 2000)
  }, [runId, applyRun])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await getSchedule(runId)
        if (!cancelled) {
          applyRun(r)
          if (r.status === 'processing') startPolling()
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err?.response?.data?.detail ?? 'Schedule not found.')
        }
      } finally {
        if (!cancelled) setPageLoading(false)
      }
    })()
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [runId])

  // ── Solve ─────────────────────────────────────────────────────────────────
  const handleSolve = async () => {
    if (!runId) return
    if (hasUnsavedEdits) await persistEdits(true)
    setSolving(true)
    setViolations({})
    try {
      await solveSchedule(runId)   // returns 202 immediately
      startPolling()
    } catch (err) {
      setSolving(false)
      toast.error(err?.response?.data?.detail ?? t('toastSolveFail'))
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!runId) return
    if (hasUnsavedEdits) await persistEdits(true)
    setDownloading(true)
    try { await downloadExport(runId) }
    catch { toast.error(t('toastDownloadFail')) }
    finally { setDownloading(false) }
  }

  // ── Manual edit handlers ──────────────────────────────────────────────────
  const handleReassign = useCallback((shiftId, newEmpId) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.shift_id === shiftId
          ? {
              ...a,
              employee_id:   newEmpId || null,
              employee_name: newEmpId ? employees.find((e) => e.id === newEmpId)?.name ?? null : null,
              source: 'MANUAL',
            }
          : a
      )
    )
    setViolations((prev) => {
      if (!prev[shiftId]) return prev
      const next = { ...prev }
      delete next[shiftId]
      return next
    })
    setHasUnsavedEdits(true)
  }, [employees])

  const handleDeleteShift = useCallback((shiftId) => {
    setShifts((prev)      => prev.filter((s) => s.id !== shiftId))
    setAssignments((prev) => prev.filter((a) => a.shift_id !== shiftId))
    setViolations((prev) => { const n = { ...prev }; delete n[shiftId]; return n })
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

  // ── Persist edits ─────────────────────────────────────────────────────────
  const persistEdits = async (silent = false) => {
    if (!runId) return
    setSaving(true)
    try {
      await updateAssignments(runId, assignments, shifts)
      setHasUnsavedEdits(false)
      setSolved(true)
      if (!silent) toast.success('Changes saved.')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!runId) return
    setValidating(true)
    try {
      const result = await validateSchedule(runId, assignments, employees, shifts)
      const map = {}
      for (const v of result.violations ?? []) {
        if (!map[v.shift_id]) map[v.shift_id] = []
        map[v.shift_id].push(v)
      }
      setViolations(map)
      const allViolations = result.violations ?? []
      const hardCount = allViolations.filter((v) => v.severity === 'hard').length
      const softCount = allViolations.filter((v) => v.severity !== 'hard').length
      if (hardCount === 0 && softCount === 0) {
        toast.success('No constraint violations found.')
      } else if (hardCount === 0) {
        toast.success(`No hard violations. ${softCount} overtime warning${softCount !== 1 ? 's' : ''} — highlighted in amber.`)
      } else {
        const msg = `${hardCount} hard violation${hardCount !== 1 ? 's' : ''}${softCount > 0 ? ` · ${softCount} warning${softCount !== 1 ? 's' : ''}` : ''} — see shifts highlighted in the schedule.`
        toast.error(msg)
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Validation failed.')
    } finally {
      setValidating(false)
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!runId) return
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
        toast.success('Schedule published!')
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Failed to update published status.')
    } finally {
      setPublishing(false)
    }
  }

  // ── Substitutes ───────────────────────────────────────────────────────────
  const handleFindSubstitutes = useCallback(async (shiftId) => {
    if (!runId) return []
    return getSubstitutes(runId, shiftId, { assignments, employees, shifts })
  }, [runId, assignments, employees, shifts])

  // ── Derived ───────────────────────────────────────────────────────────────
  const canExport = solved || hasUnsavedEdits

  const dateRangeLabel = run?.date_from
    ? `${format(parseISO(run.date_from), 'd MMM')} – ${format(parseISO(run.date_to), 'd MMM yyyy')}`
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <Layout title="Schedule">
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </Layout>
    )
  }

  if (pageError) {
    return (
      <Layout title="Schedule">
        <div className="bg-white rounded-xl shadow-soft p-10 text-center">
          <p className="text-red-600 font-medium mb-3">{pageError}</p>
          <Button onClick={() => navigate('/schedules')}>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Schedules
          </Button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={run?.name || dateRangeLabel || 'Schedule'}>
      {/* ── Gantt Card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            {/* Back link */}
            <button
              onClick={() => navigate('/schedules')}
              className="flex items-center gap-1 text-xs text-muted hover:text-dark mb-1 transition-colors"
            >
              <ArrowLeftIcon className="h-3 w-3" />
              My Schedules
            </button>

            <h2 className="font-semibold text-dark flex items-center gap-2">
              {run?.name || dateRangeLabel || t('schedulePreview')}
              {isPublished && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <GlobeAltIcon className="h-3 w-3" />
                  Published
                </span>
              )}
            </h2>

            <p className="text-xs text-muted mt-0.5">
              {employees.length} employees · {shifts.length} shift slots
              {dateRangeLabel && ` · ${dateRangeLabel}`}
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

            {/* Free plan counter */}
            {user?.plan === 'free' && usage && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                <SolveDotsCounter used={usage.solves_used} limit={usage.solves_limit} />
                {usage.solves_used}/{usage.solves_limit} auto-schedules used this month
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {hardViolationCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                {hardViolationCount} violation{hardViolationCount !== 1 ? 's' : ''}
              </span>
            )}
            {softViolationCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                {softViolationCount} warning{softViolationCount !== 1 ? 's' : ''}
              </span>
            )}

            <Button variant="secondary" size="sm" onClick={handleValidate} loading={validating} disabled={solving}>
              {hardViolationCount > 0
                ? <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                : softViolationCount > 0
                  ? <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                  : <ShieldCheckIcon className="h-4 w-4" />}
              {validating ? 'Checking…' : 'Validate'}
            </Button>

            {hasUnsavedEdits && (
              <Button variant="secondary" size="sm" onClick={() => persistEdits(false)} loading={saving}>
                <CheckCircleIcon className="h-4 w-4" />
                Save edits
              </Button>
            )}

            <Button variant="teal" onClick={handleSolve} loading={solving} disabled={solving}>
              <BoltIcon className="h-4 w-4" />
              {solving ? t('scheduling') : solved ? t('reschedule') : t('autoSchedule')}
            </Button>

            {canExport && (
              <Button variant="secondary" onClick={handleDownload} loading={downloading}>
                <ArrowDownTrayIcon className="h-4 w-4" />
                {t('downloadExcel')}
              </Button>
            )}

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

        {/* Solving banner — shown above the Gantt while optimising */}
        {solving && <SolvingBanner startedAt={run?.solving_started_at} />}

        {/* Gantt — always rendered when data exists; read-only while solving */}
        {employees.length > 0 && shifts.length > 0 ? (
          <ScheduleGantt
            employees={employees}
            shifts={shifts}
            assignments={assignments}
            violations={violations}
            onReassign={handleReassign}
            onDeleteShift={handleDeleteShift}
            onCreateShift={handleCreateShift}
            onFindSubstitutes={handleFindSubstitutes}
            editable={!solving}
          />
        ) : (
          <div className="flex items-center justify-center py-20 text-muted text-sm">
            No schedule data available.
          </div>
        )}
      </div>
    </Layout>
  )
}
