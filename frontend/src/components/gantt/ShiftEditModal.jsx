import { useState } from 'react'
import {
  ExclamationTriangleIcon,
  TrashIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Modal from '../common/Modal'
import Button from '../common/Button'
import Spinner from '../common/Spinner'
import Select from '../common/Select'
import { format, parseISO } from 'date-fns'
import { useTranslations } from '../../i18n'

// Score badge colour
function ScoreBadge({ score }) {
  const colour =
    score >= 4  ? 'bg-emerald-100 text-emerald-700' :
    score >= 0  ? 'bg-amber-100 text-amber-700'     :
                  'bg-red-100 text-red-600'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colour}`}>
      {score > 0 ? `+${score}` : score}
    </span>
  )
}

export default function ShiftEditModal({
  assignment,
  employees,
  violations,
  onSave,
  onDelete,
  onClose,
  onFindSubstitutes,   // async (shift_id) => [{employee_id, employee_name, score, reasons, ...}]
}) {
  const { t } = useTranslations()
  const [selectedEmpId, setSelectedEmpId] = useState(assignment?.employee_id ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Substitute finder state
  const [substitutes, setSubstitutes]   = useState(null)
  const [loadingSubs, setLoadingSubs]   = useState(false)
  const [subsError, setSubsError]       = useState(null)

  if (!assignment) return null

  const shiftViolations = violations?.[assignment.shift_id] ?? []
  const hasViolations   = shiftViolations.length > 0

  const formattedDate = (() => {
    try { return format(parseISO(assignment.date), 'EEEE d MMMM yyyy') }
    catch { return assignment.date }
  })()

  const handleSave = () => {
    onSave(assignment.shift_id, selectedEmpId || null)
    onClose()
  }

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(assignment.shift_id)
    onClose()
  }

  const handleFindSubstitutes = async () => {
    if (!onFindSubstitutes) return
    setLoadingSubs(true)
    setSubsError(null)
    setSubstitutes(null)
    try {
      const subs = await onFindSubstitutes(assignment.shift_id)
      setSubstitutes(subs)
    } catch {
      setSubsError(t('couldNotLoadReplacements'))
    } finally {
      setLoadingSubs(false)
    }
  }

  return (
    <Modal open title={t('editShiftAssignment')} onClose={onClose} size="sm">
      {/* Shift info */}
      <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-dark">
            {assignment.name?.trim() || `${assignment.start_time} – ${assignment.end_time}`}
          </span>
          {assignment.source === 'SOLVER' ? (
            <span className="text-[10px] font-semibold bg-brand-teal/15 text-teal-700 px-2 py-0.5 rounded-full">{t('autoScheduled')}</span>
          ) : assignment.source === 'MANUAL' ? (
            <span className="text-[10px] font-semibold bg-brand-lavender-light text-brand-purple px-2 py-0.5 rounded-full">{t('manual')}</span>
          ) : null}
        </div>
        {assignment.name?.trim() && (
          <p className="font-roboto text-dark text-sm">{assignment.start_time} – {assignment.end_time}</p>
        )}
        <p className="text-muted text-sm">{formattedDate}</p>
        {assignment.required_skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {assignment.required_skills.map((s) => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-brand-lavender-light text-brand-purple text-[10px] font-medium">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Constraint violations */}
      {hasViolations && (() => {
        const hard = shiftViolations.filter((v) => v.severity === 'hard')
        const soft = shiftViolations.filter((v) => v.severity !== 'hard')
        return (
          <>
            {hard.length > 0 && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-1">
                <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  {t('constraintViolations')}
                </p>
                {hard.map((v, i) => (
                  <p key={i} className="text-sm text-red-600 pl-5">{v.message}</p>
                ))}
              </div>
            )}
            {soft.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
                <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  {t('warnings')}
                </p>
                {soft.map((v, i) => (
                  <p key={i} className="text-sm text-amber-700 pl-5">{v.message}</p>
                ))}
              </div>
            )}
          </>
        )
      })()}

      {/* Employee selector */}
      <Select
        label={t('assignTo')}
        value={selectedEmpId}
        onChange={setSelectedEmpId}
        placeholder={t('unassignedDash')}
        options={employees.map((emp) => ({
          value: emp.id,
          label: emp.name + (emp.skills?.length ? ` (${emp.skills.join(', ')})` : ''),
        }))}
      />

      {/* Replacement finder */}
      {onFindSubstitutes && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-dark flex items-center gap-1.5">
              <UserGroupIcon className="h-3.5 w-3.5 text-brand-purple" />
              {t('findReplacement')}
            </span>
            <button
              onClick={handleFindSubstitutes}
              disabled={loadingSubs}
              className="flex items-center gap-1 text-sm font-medium text-brand-purple hover:text-brand-purple/80 disabled:opacity-50 transition-colors"
            >
              {loadingSubs ? <Spinner size="sm" /> : null}
              {loadingSubs ? t('searching') : t('search')}
            </button>
          </div>

          {subsError && (
            <p className="text-sm text-red-500">{subsError}</p>
          )}

          {substitutes !== null && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {substitutes.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-muted text-center">{t('noReplacementsFound')}</p>
              ) : substitutes.slice(0, 6).map((sub) => (
                <button
                  key={sub.employee_id}
                  onClick={() => setSelectedEmpId(sub.employee_id)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    selectedEmpId === sub.employee_id
                      ? 'bg-brand-lavender-light'
                      : 'hover:bg-gray-50',
                    sub.overlaps || sub.is_unavailable ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {/* Check/X icon */}
                  {sub.skills_ok && !sub.overlaps && !sub.is_unavailable ? (
                    <CheckCircleIcon className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  ) : sub.overlaps ? (
                    <XCircleIcon className="h-4 w-4 text-red-400 flex-shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{sub.employee_name}</p>
                    {sub.reasons.length > 0 && (
                      <p className="text-muted truncate">{sub.reasons.join(' · ')}</p>
                    )}
                  </div>

                  <ScoreBadge score={sub.score} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          onClick={handleDelete}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
            confirmDelete
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'text-red-500 hover:bg-red-50 border border-red-200'
          }`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {confirmDelete ? t('confirmDeleteShift') : t('deleteShift')}
        </button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" onClick={handleSave}>{t('save')}</Button>
        </div>
      </div>
    </Modal>
  )
}
