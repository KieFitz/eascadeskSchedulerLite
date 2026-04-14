import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { getOvertimeReport } from '../../api/schedules'
import Spinner from '../common/Spinner'

function isoDate(d) {
  return format(d, 'yyyy-MM-dd')
}

export default function OvertimeReport() {
  const now = new Date()
  const [from, setFrom] = useState(isoDate(startOfMonth(now)))
  const [to,   setTo]   = useState(isoDate(endOfMonth(now)))
  const [open, setOpen]  = useState(false)
  const [data, setData]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getOvertimeReport(from, to)
      setData(result)
    } catch (err) {
      setError(err?.response?.data?.detail ?? 'Failed to load overtime report.')
    } finally {
      setLoading(false)
    }
  }

  // Load whenever the panel is opened or date range changes
  useEffect(() => {
    if (open) load()
  }, [open, from, to])

  const hasWarnings = data?.employees?.some((e) => e.exceeds_48h_week)

  return (
    <div className="bg-white rounded-xl shadow-soft overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-dark text-sm">Hours Overview</h2>
          {hasWarnings && !open && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              <ExclamationTriangleIcon className="h-3 w-3" />
              Overtime risk
            </span>
          )}
          <span className="text-xs text-muted">
            — cumulative scheduled hours per employee
          </span>
        </div>
        {open
          ? <ChevronUpIcon className="h-4 w-4 text-muted" />
          : <ChevronDownIcon className="h-4 w-4 text-muted" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-6 py-4">
          {/* Date range controls */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <label className="text-xs font-semibold text-dark">Period</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-purple/40"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-purple/40"
            />
          </div>

          {loading && (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {data && !loading && (
            <>
              <p className="text-xs text-muted mb-3">
                {data.runs_included} schedule{data.runs_included !== 1 ? 's' : ''} in window
              </p>

              {data.employees.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">
                  No scheduled hours found for this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 font-semibold text-muted">Employee</th>
                        <th className="text-right py-2 px-4 font-semibold text-muted">Total hours</th>
                        <th className="text-right py-2 px-4 font-semibold text-muted">Shifts</th>
                        <th className="text-right py-2 pl-4 font-semibold text-muted">Avg hrs/week</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.employees.map((emp) => (
                        <tr
                          key={emp.name}
                          className={emp.exceeds_48h_week ? 'bg-amber-50/60' : ''}
                        >
                          <td className="py-2 pr-4 font-medium text-dark flex items-center gap-1.5">
                            {emp.exceeds_48h_week && (
                              <ExclamationTriangleIcon className="h-3 w-3 text-amber-500 flex-shrink-0" title="Exceeds 48 h/week average" />
                            )}
                            {emp.name}
                          </td>
                          <td className="text-right py-2 px-4 font-mono text-dark">{emp.total_hours}</td>
                          <td className="text-right py-2 px-4 text-dark">{emp.total_shifts}</td>
                          <td className={`text-right py-2 pl-4 font-semibold ${emp.exceeds_48h_week ? 'text-amber-700' : 'text-dark'}`}>
                            {emp.avg_hours_per_week}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {hasWarnings && (
                    <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
                      <ExclamationTriangleIcon className="h-3 w-3" />
                      Flagged employees average more than 48 h/week — review before publishing.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
