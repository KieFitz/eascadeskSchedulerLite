import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  CalendarDaysIcon,
  DocumentArrowDownIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Spinner from '../components/common/Spinner'
import EmptyState from '../components/common/EmptyState'
import Badge from '../components/common/Badge'
import ScheduleGantt from '../components/gantt/ScheduleGantt'
import { downloadExport, solveSchedule, uploadExcel } from '../api/schedules'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const TEMPLATE_URL = '/schedule_template.xlsx'

export default function Home() {
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [solving, setSolving] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [runId, setRunId] = useState(null)
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [assignments, setAssignments] = useState([])
  const [solved, setSolved] = useState(false)
  const [scoreInfo, setScoreInfo] = useState(null)
  const [solveTimeout, setSolveTimeout] = useState(30)

  // Check for Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      toast.success('You are now on the Pro plan!')
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      toast.error('Please select an Excel file (.xlsx or .xls)')
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
      // Pre-populate gantt with unassigned slots
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
      toast.success(
        `Uploaded: ${data.employee_count} employees, ${data.shift_slot_count} shift slots`
      )
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Upload failed. Check your Excel format.')
    } finally {
      setUploading(false)
    }
  }

  const handleSolve = async () => {
    if (!runId) return
    setSolving(true)
    try {
      const run = await solveSchedule(runId, solveTimeout)
      if (run.status === 'completed' && run.result_data?.assignments) {
        const solved_assignments = run.result_data.assignments.map((a) => ({
          ...a,
          source: 'SOLVER',
        }))
        setAssignments(solved_assignments)
        setSolved(true)
        setScoreInfo(run.score_info)
        toast.success('Schedule solved!')
      } else if (run.status === 'failed') {
        toast.error(run.error_message ?? 'Solve failed. Please try again.')
      }
    } catch (err) {
      const msg = err?.response?.data?.detail ?? 'Solve failed. Please try again.'
      toast.error(msg)
    } finally {
      setSolving(false)
    }
  }

  const handleDownload = async () => {
    if (!runId) return
    setDownloading(true)
    try {
      await downloadExport(runId)
    } catch (err) {
      toast.error('Could not download the schedule.')
    } finally {
      setDownloading(false)
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
    if (fileRef.current) fileRef.current.value = ''
  }

  const hasData = employees.length > 0 && shifts.length > 0

  return (
    <Layout title="Schedule">
      {/* ── Upload Card ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-soft mb-5">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-dark">Upload Schedule</h2>
            <p className="text-xs text-muted mt-0.5">
              Upload an Excel file with Employees and Shifts sheets
            </p>
          </div>
          <a href={TEMPLATE_URL} download tabIndex={-1}>
            <Button variant="primary" size="sm">
              <DocumentArrowDownIcon className="h-4 w-4" />
              Download Template
            </Button>
          </a>
        </div>

        <div className="p-6">
          {/* Tier info */}
          {user && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
              user.plan === 'paid'
                ? 'bg-brand-teal/10 text-teal-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700'
            }`}>
              {user.plan === 'paid' ? (
                <>
                  <Badge colour="teal">Pro</Badge>
                  Unlimited schedules · shifts up to 31 days ahead
                </>
              ) : (
                <>
                  <Badge colour="amber">Free</Badge>
                  1 auto-schedule per month · shifts up to 14 days ahead
                </>
              )}
            </div>
          )}

          {/* Drop zone */}
          <div
            className={[
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragging
                ? 'border-brand-purple bg-brand-lavender-light/30'
                : file
                ? 'border-brand-teal bg-brand-teal/5'
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
              <div className="flex flex-col items-center gap-2">
                <DocumentArrowDownIcon className="h-10 w-10 text-brand-teal" />
                <p className="font-medium text-dark text-sm">{file.name}</p>
                <p className="text-xs text-muted">
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ArrowUpTrayIcon className="h-10 w-10 text-muted" />
                <p className="font-medium text-dark text-sm">
                  Drag & drop your Excel file here
                </p>
                <p className="text-xs text-muted">or click to browse · .xlsx, .xls</p>
              </div>
            )}
          </div>

          {/* Upload actions */}
          <div className="flex items-center gap-3 mt-4">
            <Button
              onClick={handleUpload}
              disabled={!file}
              loading={uploading}
              className="flex-shrink-0"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              Upload
            </Button>
            {file && (
              <Button variant="ghost" size="sm" onClick={resetUpload}>
                <XCircleIcon className="h-4 w-4" />
                Clear
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
              <h2 className="font-semibold text-dark">Schedule Preview</h2>
              <p className="text-xs text-muted mt-0.5">
                {employees.length} employees · {[...new Set(shifts.map(s => s.date))].length} days
                {solved && scoreInfo && (() => {
                  const hasHard = scoreInfo.includes('-') && !scoreInfo.startsWith('0hard')
                  return (
                    <span className={`ml-2 font-medium ${hasHard ? 'text-red-600' : 'text-teal-600'}`}>
                      · Score: {scoreInfo}
                      {hasHard && ' ⚠ hard violations'}
                    </span>
                  )
                })()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Timeout picker — shown when a result exists so user can run longer */}
              {hasData && (
                <select
                  value={solveTimeout}
                  onChange={(e) => setSolveTimeout(Number(e.target.value))}
                  disabled={solving}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
                  title="Solver time limit"
                >
                  <option value={30}>30 s</option>
                  <option value={60}>1 min</option>
                  <option value={120}>2 min</option>
                  <option value={300}>5 min</option>
                </select>
              )}

              <Button
                variant="teal"
                onClick={handleSolve}
                loading={solving}
                disabled={solving}
              >
                <BoltIcon className="h-4 w-4" />
                {solving ? 'Scheduling…' : solved ? 'Re-schedule' : 'Auto-Schedule'}
              </Button>

              {solved && (
                <Button
                  variant="secondary"
                  onClick={handleDownload}
                  loading={downloading}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Download Excel
                </Button>
              )}
            </div>
          </div>

          {solving ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-muted">
                Timefold is optimising your schedule…
              </p>
            </div>
          ) : (
            <ScheduleGantt
              employees={employees}
              shifts={shifts}
              assignments={assignments}
            />
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-soft">
          <EmptyState
            icon={CalendarDaysIcon}
            title="No schedule loaded"
            description="Upload an Excel file above to see your employees and shifts on the Gantt chart."
          />
        </div>
      )}
    </Layout>
  )
}
