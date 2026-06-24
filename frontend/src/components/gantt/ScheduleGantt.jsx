import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  TableCellsIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import ShiftEditModal from './ShiftEditModal'
import ShiftCreateModal from './ShiftCreateModal'
import Modal from '../common/Modal'
import Button from '../common/Button'

// ── Portal tooltip ────────────────────────────────────────────────────────────
function ShiftTooltip({ tip }) {
  if (!tip) return null
  const { assignment: a, violations: v, x, y } = tip
  const shiftViolations = v?.[a.shift_id] ?? []

  // Keep the tooltip on screen — flip above/left when near viewport edges
  const FLIP_H = 220  // estimated max tooltip height
  const FLIP_W = 278  // maxWidth + right offset

  const style = {
    position:      'fixed',
    zIndex:        9999,
    pointerEvents: 'none',
    maxWidth:      260,
  }

  if (y + FLIP_H > window.innerHeight) {
    style.bottom = window.innerHeight - y + 8   // render above cursor
  } else {
    style.top = y + 14
  }

  if (x + FLIP_W > window.innerWidth) {
    style.right = window.innerWidth - x + 8     // render to the left
  } else {
    style.left = x + 14
  }

  const formattedDate = (() => {
    try { return format(parseISO(a.date), 'EEE d MMM yyyy') }
    catch { return a.date }
  })()

  return createPortal(
    <div
      className="bg-dark text-white text-xs rounded-xl shadow-card px-3 py-2.5 space-y-1.5"
      style={style}
    >
      {/* Time + date */}
      <div>
        <p className="font-roboto font-semibold text-sm leading-tight">
          {a.start_time} – {a.end_time}
        </p>
        <p className="text-white/60 text-[11px]">{formattedDate}</p>
      </div>

      {/* Required skills */}
      {a.required_skills?.length > 0 && (
        <div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Required skills</p>
          <div className="flex flex-wrap gap-1">
            {a.required_skills.map((s) => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-white/15 text-white text-[10px] font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assignment */}
      <div className="flex items-center gap-1.5">
        {a.employee_name ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal flex-shrink-0" />
            <span>{a.employee_name}</span>
            {a.source === 'SOLVER' && (
              <span className="text-white/40 text-[10px]">(auto)</span>
            )}
            {a.source === 'MANUAL' && (
              <span className="text-white/40 text-[10px]">(manual)</span>
            )}
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-amber-300">Unassigned</span>
          </>
        )}
      </div>

      {/* Violations */}
      {shiftViolations.length > 0 && (
        <div className="border-t border-white/10 pt-1.5 space-y-0.5">
          {shiftViolations.map((vio, i) => (
            <p key={i} className="flex items-start gap-1 text-red-300 text-[11px]">
              <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0 mt-0.5" />
              {vio.message}
            </p>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

// ── Layout constants ──────────────────────────────────────────────────────────
const ROW_H   = 62
const BAR_H   = 32
const BAR_Y   = (ROW_H - BAR_H) / 2
const EMP_W   = 164

// DAYS_IN_VIEW is now dynamic — see daysInView state in ScheduleGantt

// ── Time constants ────────────────────────────────────────────────────────────
const H_START  = 0
const H_END    = 23
const TOTAL_M  = (H_END - H_START) * 60

// ── Time helpers ──────────────────────────────────────────────────────────────
function toMins(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function shiftDurationHours(start, end) {
  let mins = toMins(end) - toMins(start)
  if (mins <= 0) mins += 1440
  return mins / 60
}
function leftPct(t) {
  return Math.min(100, Math.max(0, ((Math.max(toMins(t), H_START * 60) - H_START * 60) / TOTAL_M) * 100))
}
function widthPct(start, end) {
  let s = toMins(start), e = toMins(end)
  if (e <= s) e += 1440
  return Math.max(2, ((Math.min(e, H_END * 60) - Math.max(s, H_START * 60)) / TOTAL_M) * 100)
}

// ── Bar colour — unchanged from original ─────────────────────────────────────
function barCls(a) {
  if (!a.employee_id)        return 'bg-amber-100 border border-amber-300 text-amber-800'
  if (a.source === 'SOLVER') return 'bg-brand-teal/80 border border-teal-300 text-dark'
  return 'bg-brand-purple/80 border border-brand-purple text-white'
}

// ── Availability span helpers ─────────────────────────────────────────────────
function spansForDate(emp, dateStr, key) {
  const spans = emp?.[key] ?? []
  const dow = format(parseISO(dateStr), 'EEEE')
  return spans.filter((s) => s.day === dow || s.day === dateStr)
}
function normalizeSpanToTimes(span) {
  const start = span.start ?? `${String(H_START).padStart(2, '0')}:00`
  const end   = span.end   ?? `${String(H_END).padStart(2, '0')}:00`
  return { start, end }
}
function SpanBar({ span, kind }) {
  const { start, end } = normalizeSpanToTimes(span)
  const cls =
    kind === 'preferred'   ? 'bg-emerald-100/80 border border-emerald-200' :
    kind === 'unpreferred' ? 'bg-amber-100/70 border border-amber-200' :
                             'bg-rose-200/70 border border-rose-300'
  return (
    <div
      className={`absolute rounded ${cls}`}
      style={{ left: `${leftPct(start)}%`, width: `${widthPct(start, end)}%`, height: BAR_H, top: BAR_Y, zIndex: 0 }}
      title={`${kind}: ${start}–${end}`}
    />
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function HourLabels({ stepHours = 6 }) {
  const STEP_H = stepHours
  const count = Math.floor((H_END - H_START) / STEP_H) + 1
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const h = H_START + i * STEP_H
        const pct = ((h - H_START) / (H_END - H_START)) * 100
        return (
          <div key={h} className="absolute top-0 bottom-0 flex flex-col" style={{ left: `${pct}%` }}>
            <span className="text-[9px] text-muted leading-none whitespace-nowrap pl-0.5">
              {String(h).padStart(2, '0')}:00
            </span>
            <div className="flex-1 border-l border-gray-100" />
          </div>
        )
      })}
    </>
  )
}

// ── Shift bar — draggable & clickable when editable ───────────────────────────
function ShiftBar({ a, editable, violations, onClickEdit, onDragStart, onDragEnd, onMouseEnter, onMouseLeave }) {
  const hasViolation = (violations?.[a.shift_id]?.length ?? 0) > 0

  return (
    <div
      draggable={editable}
      onDragStart={editable ? (e) => onDragStart(e, a.shift_id) : undefined}
      onDragEnd={editable ? onDragEnd : undefined}
      onClick={editable ? (e) => { e.stopPropagation(); onClickEdit(a) } : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        'absolute rounded px-1.5 flex items-center gap-0.5 overflow-hidden select-none transition-opacity',
        editable ? 'cursor-grab active:cursor-grabbing hover:brightness-95' : 'cursor-default',
        hasViolation ? 'ring-2 ring-red-500 ring-inset' : '',
        barCls(a),
      ].join(' ')}
      style={{
        left: `${leftPct(a.start_time)}%`,
        width: `${widthPct(a.start_time, a.end_time)}%`,
        height: BAR_H,
        top: BAR_Y,
        zIndex: 1,
      }}
    >
      {hasViolation && (
        <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0 text-red-500" />
      )}
      <span className="text-[11px] font-medium truncate leading-tight">
        {a.start_time}–{a.end_time}
      </span>
    </div>
  )
}

function SkillChips({ skills = [] }) {
  if (!skills.length) return <span className="text-muted text-xs italic">any</span>
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span key={s} className="px-1.5 py-0.5 rounded bg-brand-lavender-light text-brand-purple text-[10px] font-medium leading-none">
          {s}
        </span>
      ))}
    </div>
  )
}

// ── Week navigation bar ───────────────────────────────────────────────────────
function WeekNav({ weekStart, allDates, daysInView, onPrev, onNext, onToday }) {
  const visibleEnd = addDays(weekStart, daysInView - 1)
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr   = format(visibleEnd, 'yyyy-MM-dd')
  const hasPrev  = allDates.some((d) => d < startStr)
  const hasNext  = allDates.some((d) => d > endStr)
  const label    = daysInView === 1
    ? format(weekStart, 'EEEE, d MMM yyyy')
    : `${format(weekStart, 'd MMM')} – ${format(visibleEnd, 'd MMM yyyy')}`
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onPrev} disabled={!hasPrev}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <ChevronLeftIcon className="h-4 w-4 text-dark" />
      </button>
      <span className={`text-sm font-semibold text-dark text-center select-none ${daysInView === 1 ? 'min-w-[200px]' : 'min-w-[172px]'}`}>
        {label}
      </span>
      <button onClick={onNext} disabled={!hasNext}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <ChevronRightIcon className="h-4 w-4 text-dark" />
      </button>
      <button onClick={onToday}
        className="ml-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-dark hover:bg-gray-50 transition-colors">
        Today
      </button>
    </div>
  )
}

function DayWeekToggle({ daysInView, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      {[
        { days: 1, label: 'Day'  },
        { days: 7, label: 'Week' },
      ].map(({ days, label }) => (
        <button key={days} onClick={() => onChange(days)}
          className={['px-3 py-1.5 text-xs font-medium transition-colors',
            daysInView === days ? 'bg-brand-purple text-white' : 'text-muted hover:bg-gray-50'].join(' ')}>
          {label}
        </button>
      ))}
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
      {[
        { id: 'employee', Icon: CalendarDaysIcon, label: 'By Employee' },
        { id: 'coverage', Icon: TableCellsIcon,   label: 'By Shift'    },
        { id: 'shift',    Icon: ListBulletIcon,   label: 'List'        },
      ].map(({ id, Icon, label }) => (
        <button key={id} onClick={() => onChange(id)}
          className={['flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            view === id ? 'bg-brand-purple text-white' : 'text-muted hover:bg-gray-50'].join(' ')}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Employee view — horizontal Gantt with drag-and-drop
// ════════════════════════════════════════════════════════════════════════════
// Given a click event on a timeline cell, infer the nearest 15-min HH:MM snap
function inferTimeFromClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const totalMins = H_START * 60 + Math.round(pct * TOTAL_M / 15) * 15
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function EmployeeView({
  employees, visibleDates, assignMap, unassignedMap,
  empTotalHoursMap,
  editable, violations,
  hourLabelStep,
  onReassign, onClickEditShift, onClickCreateShift, onDblClickCreate,
  onTipShow, onTipHide,
}) {
  const draggedShiftId = useRef(null)
  const [dragOverTarget, setDragOverTarget] = useState(null) // empId or 'unassigned'

  const hasUnassigned = visibleDates.some((d) => (unassignedMap[d]?.length ?? 0) > 0)

  const gridStyle = {
    gridTemplateColumns: `${EMP_W}px repeat(${visibleDates.length}, minmax(0, 1fr))`,
  }

  const handleDragStart = (e, shiftId) => {
    draggedShiftId.current = shiftId
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragEnd = () => {
    draggedShiftId.current = null
    setDragOverTarget(null)
  }
  const handleDrop = (empId) => {
    if (draggedShiftId.current) onReassign(draggedShiftId.current, empId)
    draggedShiftId.current = null
    setDragOverTarget(null)
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="min-w-[900px]">
        {/* Date header */}
        <div className="grid border-b border-gray-200 bg-gray-50 sticky top-0 z-10" style={gridStyle}>
          <div className="px-4 py-2 border-r border-gray-200 text-xs font-semibold text-muted flex items-center">
            Employee
          </div>
          {visibleDates.map((d) => (
            <div key={d} className="px-2 py-2 border-r border-gray-100 text-xs font-semibold text-dark text-center flex items-center justify-center gap-1">
              {format(parseISO(d), 'EEE d MMM')}
              {editable && (
                <button
                  onClick={() => onClickCreateShift(d)}
                  className="p-0.5 rounded hover:bg-brand-purple/10 text-brand-purple opacity-50 hover:opacity-100 transition-opacity"
                  title={`Add shift on ${d}`}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Open shifts row — always visible when editable, at the top */}
        {(editable || hasUnassigned) && (
          <div
            className={`grid border-b-2 ${editable && dragOverTarget === 'unassigned' ? 'bg-amber-100 border-amber-400' : 'bg-amber-50 border-amber-200'}`}
            style={gridStyle}
            onDragOver={editable ? (e) => { e.preventDefault(); setDragOverTarget('unassigned') } : undefined}
            onDragLeave={editable ? () => { if (dragOverTarget === 'unassigned') setDragOverTarget(null) } : undefined}
            onDrop={editable ? (e) => { e.preventDefault(); handleDrop(null) } : undefined}
          >
            <div className="px-4 flex flex-col justify-center border-r border-amber-200" style={{ minHeight: ROW_H }}>
              <p className="text-sm font-semibold text-amber-700">Open shifts</p>
              {editable && <p className="text-[10px] text-amber-600/70">Click + to add</p>}
            </div>
            {visibleDates.map((d) => {
              const slots = unassignedMap[d] ?? []
              return (
                <div
                  key={d}
                  className="border-r border-amber-100 flex flex-col gap-1 p-1.5 relative group"
                  style={{ minHeight: ROW_H }}
                  onDoubleClick={editable ? () => onClickCreateShift(d) : undefined}
                >
                  {slots.map((a) => {
                    const hasViolation = (violations?.[a.shift_id]?.length ?? 0) > 0
                    return (
                      <button
                        key={a.shift_id}
                        onClick={editable ? (e) => { e.stopPropagation(); onClickEditShift(a) } : undefined}
                        className={[
                          'w-full text-left px-2 py-1 rounded text-[11px] font-medium truncate transition-colors',
                          hasViolation ? 'ring-1 ring-red-400 ring-inset' : '',
                          'bg-amber-100 text-amber-800 hover:bg-amber-200',
                          editable ? 'cursor-pointer' : 'cursor-default',
                        ].join(' ')}
                        onMouseEnter={(e) => onTipShow(e, a)}
                        onMouseLeave={onTipHide}
                        title={`${a.start_time}–${a.end_time}`}
                      >
                        {hasViolation && <ExclamationTriangleIcon className="inline h-3 w-3 text-red-500 mr-0.5 -mt-0.5" />}
                        {a.start_time}–{a.end_time}
                        {a.required_skills?.length > 0 && (
                          <span className="ml-1 opacity-70">· {a.required_skills.join(', ')}</span>
                        )}
                      </button>
                    )
                  })}
                  {editable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onClickCreateShift(d) }}
                      className="absolute top-1 right-1 p-0.5 rounded hover:bg-amber-200 text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title={`Add open shift on ${d}`}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Employee rows */}
        {employees.map((emp) => {
          const isTarget = editable && dragOverTarget === emp.id
          return (
            <div
              key={emp.id}
              className={`grid border-b border-gray-100 transition-colors ${isTarget ? 'bg-brand-lavender-light/30 ring-1 ring-inset ring-brand-purple/30' : 'hover:bg-gray-50/60'}`}
              style={gridStyle}
            >
              {/* Employee label */}
              <div className="px-4 flex flex-col justify-center border-r border-gray-200 bg-white" style={{ height: ROW_H }}>
                <p className="text-sm font-medium text-dark truncate">{emp.name}</p>
                {emp.skills?.length > 0 && (
                  <p className="text-[10px] text-muted truncate">{emp.skills.join(', ')}</p>
                )}
                <p className={`text-[10px] font-medium ${(empTotalHoursMap[emp.id] ?? 0) > 48 ? 'text-amber-600' : 'text-muted'}`}>
                  {(empTotalHoursMap[emp.id] ?? 0).toFixed(1)}h assigned
                </p>
              </div>

              {/* Date cells — all are drop targets for the same employee */}
              {visibleDates.map((d) => {
                const preferred   = spansForDate(emp, d, 'preferred_spans')
                const unpreferred = spansForDate(emp, d, 'unpreferred_spans')
                const unavailable = spansForDate(emp, d, 'unavailable_spans')
                return (
                  <div
                    key={d}
                    className="border-r border-gray-100 relative overflow-hidden"
                    style={{ height: ROW_H }}
                    onDragOver={editable ? (e) => { e.preventDefault(); setDragOverTarget(emp.id) } : undefined}
                    onDragLeave={editable ? () => { if (dragOverTarget === emp.id) setDragOverTarget(null) } : undefined}
                    onDrop={editable ? (e) => { e.preventDefault(); handleDrop(emp.id) } : undefined}
                    onDoubleClick={editable ? (e) => onDblClickCreate(d, inferTimeFromClick(e)) : undefined}
                  >
                    <HourLabels stepHours={hourLabelStep} />
                    {preferred.map((s, idx) => <SpanBar key={`p-${idx}`} span={s} kind="preferred" />)}
                    {unpreferred.map((s, idx) => <SpanBar key={`u-${idx}`} span={s} kind="unpreferred" />)}
                    {unavailable.map((s, idx) => <SpanBar key={`x-${idx}`} span={s} kind="unavailable" />)}
                    {assignMap[emp.id]?.[d]?.map((a) => (
                      <ShiftBar
                        key={a.shift_id}
                        a={a}
                        editable={editable}
                        violations={violations}
                        onClickEdit={onClickEditShift}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onMouseEnter={(e) => onTipShow(e, a)}
                        onMouseLeave={onTipHide}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}

      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Shift view — table grouped by date, with inline reassignment dropdown
// ════════════════════════════════════════════════════════════════════════════
function ShiftView({ employees, assignments, visibleDates, editable, violations, onReassign, onClickEditShift, onClickCreateShift }) {
  const byDate = useMemo(() => {
    const m = {}
    for (const d of visibleDates) m[d] = []
    for (const a of assignments) {
      if (visibleDates.includes(a.date)) m[a.date]?.push(a)
    }
    for (const d of visibleDates) {
      m[d].sort((a, b) =>
        a.start_time.localeCompare(b.start_time) || (a.slot_index ?? 0) - (b.slot_index ?? 0)
      )
    }
    return m
  }, [assignments, visibleDates])

  const assignedIds = useMemo(() => {
    const ids = new Set()
    for (const d of visibleDates) {
      for (const a of byDate[d] ?? []) {
        if (a.employee_id) ids.add(a.employee_id)
      }
    }
    return ids
  }, [byDate, visibleDates])

  const unscheduled = employees.filter((e) => !assignedIds.has(e.id))

  return (
    <div className="divide-y divide-gray-100">
      {visibleDates.map((d) => {
        const slots = byDate[d] ?? []
        if (!slots.length && !editable) return null
        return (
          <div key={d}>
            <div className="px-4 py-2 bg-gray-50 flex items-center gap-2 sticky top-0 z-10 border-b border-gray-200">
              <span className="text-xs font-bold text-brand-purple">{format(parseISO(d), 'EEEE')}</span>
              <span className="text-xs font-semibold text-dark">{format(parseISO(d), 'd MMMM yyyy')}</span>
              <span className="ml-auto text-xs text-muted">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
              {editable && (
                <button
                  onClick={() => onClickCreateShift(d)}
                  className="flex items-center gap-1 text-xs text-brand-purple hover:text-brand-purple-light font-medium transition-colors"
                  title="Add shift"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add shift
                </button>
              )}
            </div>

            <div className="divide-y divide-gray-50">
              {slots.map((a) => {
                const skills = a.required_skills ?? []
                const assigned = !!a.employee_id
                const shiftViolations = violations?.[a.shift_id]
                const hasViolation = shiftViolations?.length > 0
                return (
                  <div
                    key={a.shift_id}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      hasViolation ? 'bg-red-50/60' : !assigned ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'
                    }`}
                  >
                    <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
                      {hasViolation && (
                        <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500 flex-shrink-0" title={shiftViolations.map(v => v.message).join('\n')} />
                      )}
                      <span className="font-roboto text-xs font-semibold text-dark">
                        {a.start_time} – {a.end_time}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <SkillChips skills={skills} />
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {editable ? (
                        <>
                          <select
                            value={a.employee_id || ''}
                            onChange={(e) => onReassign(a.shift_id, e.target.value || null)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-dark bg-white focus:outline-none focus:ring-1 focus:ring-brand-purple/40"
                          >
                            <option value="">Unassigned</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => onClickEditShift(a)}
                            className="p-1 rounded hover:bg-gray-100 text-muted hover:text-dark transition-colors"
                            title="Edit / delete shift"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        assigned ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.source === 'SOLVER' ? 'bg-brand-teal/15 text-teal-800' : 'bg-brand-lavender-light text-brand-purple'
                          }`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                            {a.employee_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Unassigned
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {unscheduled.length > 0 && (
        <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
            Not scheduled this view
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs text-dark">
                <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-muted">
                  {e.name?.[0]?.toUpperCase()}
                </span>
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Shift-type bulk-edit modal
// ════════════════════════════════════════════════════════════════════════════
function ShiftTypeEditModal({ type, allShiftsOfType, allSkills, employees, onDeleteAll, onReassignAll, onEditAll, onClose }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [empId,      setEmpId]      = useState('')
  const [startTime,  setStartTime]  = useState(type.start_time)
  const [endTime,    setEndTime]    = useState(type.end_time)
  const [skills,     setSkills]     = useState(type.required_skills)
  const [timeError,  setTimeError]  = useState('')

  const count = allShiftsOfType.length
  const timesChanged  = startTime !== type.start_time || endTime !== type.end_time
  const skillsChanged = JSON.stringify([...skills].sort()) !== JSON.stringify([...type.required_skills].sort())
  const hasChanges    = timesChanged || skillsChanged || !!empId

  const toggleSkill = (s) =>
    setSkills((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const handleApply = () => {
    if (startTime === endTime) { setTimeError('Start and end time must differ.'); return }
    setTimeError('')
    if (timesChanged || skillsChanged) onEditAll(startTime, endTime, skills)
    if (empId) onReassignAll(empId === '__unassign__' ? null : empId)
    onClose()
  }

  return (
    <Modal open title="Edit all shifts of this type" onClose={onClose} size="sm">
      <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 space-y-1 text-xs text-muted">
        <p className="font-roboto font-semibold text-dark text-sm">{type.label}</p>
        <p>{count} shift{count !== 1 ? 's' : ''} across the schedule — all will be updated.</p>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block mb-1 text-xs font-semibold text-dark">Start time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30" />
        </div>
        <div>
          <label className="block mb-1 text-xs font-semibold text-dark">End time</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30" />
        </div>
      </div>
      {timeError && <p className="mb-3 text-xs text-red-600">{timeError}</p>}

      {/* Skills */}
      {allSkills.length > 0 && (
        <div className="mb-4">
          <label className="block mb-1.5 text-xs font-semibold text-dark">Required skills</label>
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((s) => (
              <button key={s} type="button" onClick={() => toggleSkill(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  skills.includes(s) ? 'bg-brand-purple text-white border-brand-purple' : 'bg-white text-dark border-gray-200 hover:border-brand-purple'
                }`}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Assign all */}
      <div className="mb-5">
        <label className="block mb-1 text-xs font-semibold text-dark">Assign all to <span className="font-normal text-muted">(optional)</span></label>
        <select value={empId} onChange={(e) => setEmpId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
        >
          <option value="">— Leave as-is —</option>
          <option value="__unassign__">Unassign all</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}{emp.skills?.length ? ` (${emp.skills.join(', ')})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return }
            onDeleteAll()
            onClose()
          }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            confirmDelete ? 'bg-red-500 text-white hover:bg-red-600' : 'text-red-500 hover:bg-red-50 border border-red-200'
          }`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {confirmDelete ? `Confirm delete ${count}` : 'Delete all'}
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!hasChanges} onClick={handleApply}>Apply to all</Button>
        </div>
      </div>
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Coverage view — grid: rows = shift types, columns = dates
// ════════════════════════════════════════════════════════════════════════════
function CoverageView({ employees, shifts, assignments, visibleDates, editable, violations, onReassign, onClickEditShift, onClickCreateShift, onDblClickCreate, onClickEditShiftType, onCopyShiftType }) {
  // Build the set of distinct shift types across the whole schedule (not just visible)
  // A "type" is keyed by start_time + end_time + sorted skills
  const shiftTypes = useMemo(() => {
    const seen = new Map() // key → {start_time, end_time, required_skills, label}
    for (const s of shifts) {
      const skills = [...(s.required_skills ?? [])].sort()
      const key = `${s.start_time}|${s.end_time}|${skills.join(',')}`
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          start_time: s.start_time,
          end_time:   s.end_time,
          required_skills: skills,
          label: `${s.start_time} – ${s.end_time}`,
        })
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)
    )
  }, [shifts])

  // Index: typeKey → date → [assignment]
  const cellMap = useMemo(() => {
    const m = {}
    for (const t of shiftTypes) m[t.key] = {}
    for (const a of assignments) {
      const skills = [...(a.required_skills ?? [])].sort()
      const key = `${a.start_time}|${a.end_time}|${skills.join(',')}`
      if (!m[key]) continue
      if (!m[key][a.date]) m[key][a.date] = []
      m[key][a.date].push(a)
    }
    return m
  }, [shiftTypes, assignments])

  const COL_W = 120 // px per date column — keep compact

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div style={{ minWidth: 200 + COL_W * visibleDates.length }}>
        {/* Header row */}
        <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="flex-shrink-0 w-48 px-4 py-2 border-r border-gray-200 text-xs font-semibold text-muted flex items-center">
            Shift type
          </div>
          {visibleDates.map((d) => (
            <div
              key={d}
              className="flex-shrink-0 border-r border-gray-100 text-xs font-semibold text-dark text-center py-2 flex items-center justify-center gap-1"
              style={{ width: COL_W }}
            >
              {format(parseISO(d), 'EEE d MMM')}
              {editable && (
                <button
                  onClick={() => onClickCreateShift(d)}
                  className="p-0.5 rounded hover:bg-brand-purple/10 text-brand-purple opacity-50 hover:opacity-100 transition-opacity"
                  title={`Add shift on ${d}`}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Open shifts row — always visible when editable, at the top */}
        {editable && (
          <div className="flex border-b-2 border-amber-200 bg-amber-50">
            <div className="flex-shrink-0 w-48 px-4 py-2 border-r border-amber-200 flex flex-col justify-center" style={{ minHeight: 56 }}>
              <p className="text-sm font-semibold text-amber-700">Open shifts</p>
              <p className="text-[10px] text-amber-600/70">Click + to add</p>
            </div>
            {visibleDates.map((d) => (
              <div
                key={d}
                className="flex-shrink-0 border-r border-amber-100 flex flex-col gap-1 p-1.5 items-center justify-center relative group"
                style={{ width: COL_W, minHeight: 56 }}
                onDoubleClick={() => onClickCreateShift(d)}
              >
                <button
                  onClick={() => onClickCreateShift(d)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title={`Add open shift on ${d}`}
                >
                  <PlusIcon className="h-3 w-3" />
                  Add
                </button>
              </div>
            ))}
          </div>
        )}

        {shiftTypes.length === 0 && editable && (
          <div className="flex items-center gap-3 px-4 py-3 text-xs text-muted bg-gray-50/80 border-b border-gray-100">
            <PlusIcon className="h-4 w-4 text-brand-purple/50 flex-shrink-0" />
            <span>No shift types yet — use the <span className="font-semibold">Open shifts</span> row above or click <span className="font-semibold">+</span> on a date header to add your first shift.</span>
          </div>
        )}

        {/* Shift type rows */}
        {shiftTypes.map((type) => (
          <div key={type.key} className="flex border-b border-gray-100 hover:bg-gray-50/40 transition-colors group/row">
            {/* Row label — click to bulk-edit */}
            <div
              className={[
                'flex-shrink-0 w-48 px-4 py-2 border-r border-gray-200 bg-white flex flex-col justify-center gap-1',
                editable ? 'cursor-pointer hover:bg-brand-lavender-light/30' : '',
              ].join(' ')}
              style={{ minHeight: 56 }}
              onClick={editable ? () => onClickEditShiftType(type) : undefined}
              title={editable ? 'Click to edit all shifts of this type' : undefined}
            >
              <p className="text-xs font-roboto font-semibold text-dark">{type.label}</p>
              {type.required_skills.length > 0 ? (
                <SkillChips skills={type.required_skills} />
              ) : (
                <span className="text-[10px] text-muted italic">any skills</span>
              )}
              {editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCopyShiftType(type) }}
                  className="mt-0.5 self-start flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] font-medium text-muted hover:text-brand-purple hover:border-brand-purple bg-white transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                  title="Duplicate all shifts of this type (adds one more unassigned slot per date)"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path strokeLinecap="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy row
                </button>
              )}
            </div>

            {/* Date cells */}
            {visibleDates.map((d) => {
              const slots = cellMap[type.key]?.[d] ?? []
              return (
                <div
                  key={d}
                  className="flex-shrink-0 border-r border-gray-100 flex flex-col gap-1 p-1.5 items-start justify-start group relative"
                  style={{ width: COL_W, minHeight: 56 }}
                  onDoubleClick={editable ? () => onDblClickCreate(d, type.start_time, type.end_time) : undefined}
                  title={editable ? 'Double-click to add a shift here' : undefined}
                >
                  {slots.map((a) => {
                    const hasViolation = (violations?.[a.shift_id]?.length ?? 0) > 0
                    return (
                      <button
                        key={a.shift_id}
                        onClick={editable ? () => onClickEditShift(a) : undefined}
                        className={[
                          'w-full text-left px-2 py-1 rounded text-[11px] font-medium truncate transition-colors',
                          hasViolation ? 'ring-1 ring-red-400 ring-inset' : '',
                          a.employee_id
                            ? a.source === 'SOLVER'
                              ? 'bg-brand-teal/20 text-teal-800 hover:bg-brand-teal/30'
                              : 'bg-brand-lavender-light text-brand-purple hover:bg-brand-purple/20'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200',
                          editable ? 'cursor-pointer' : 'cursor-default',
                        ].join(' ')}
                      >
                        {hasViolation && <ExclamationTriangleIcon className="inline h-3 w-3 text-red-500 mr-0.5 -mt-0.5" />}
                        {a.employee_id ? a.employee_name : <span className="opacity-60 italic">Open</span>}
                        {a.required_skills?.length > 0 && (
                          <span className="ml-1 opacity-70">· {a.required_skills.join(', ')}</span>
                        )}
                      </button>
                    )
                  })}

                  {/* Double-click hint on empty cells */}
                  {editable && slots.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <PlusIcon className="h-4 w-4 text-brand-purple/40" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Root export
// ════════════════════════════════════════════════════════════════════════════
export default function ScheduleGantt({
  employees,
  shifts,
  assignments,
  violations,           // { [shift_id]: [{rule, message, severity}] }
  dateFrom,             // ISO string — schedule start (used when shifts is empty)
  dateTo,               // ISO string — schedule end
  onReassign,           // (shiftId, empId | null) => void
  onDeleteShift,        // (shiftId) => void
  onCreateShift,        // (shiftData, empId | null) => void
  onEditShiftType,      // (shiftIds, {start_time, end_time, required_skills}) => void
  onFindSubstitutes,    // async (shiftId) => [{employee_id, score, ...}]
  editable = false,
}) {
  const employeesArr   = employees   ?? []
  const shiftsArr      = shifts      ?? []
  const assignmentsArr = assignments ?? []

  // Derive the full date range: prefer shift dates, fall back to dateFrom/dateTo props
  const allDates = useMemo(() => {
    const fromShifts = [...new Set(shiftsArr.map((s) => s.date))].sort()
    if (fromShifts.length > 0) return fromShifts
    if (!dateFrom) return []
    // Generate every date from dateFrom to dateTo
    const result = []
    const end = dateTo ?? dateFrom
    const cur = new Date(dateFrom + 'T00:00:00')
    const endDate = new Date(end + 'T00:00:00')
    while (cur <= endDate) {
      result.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [shiftsArr, dateFrom, dateTo])

  const [weekStart,  setWeekStart]  = useState(() => {
    const base = allDates[0] ? parseISO(allDates[0]) : new Date()
    return startOfWeek(base, { weekStartsOn: 1 })
  })
  const [view,       setView]       = useState('employee')
  const [daysInView, setDaysInView] = useState(7)

  // ── Modal state ────────────────────────────────────────────────────────────
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [editingShiftType,  setEditingShiftType]  = useState(null) // { type, allShiftsOfType }
  // { date, startTime?, endTime? }
  const [createCtx, setCreateCtx] = useState(null)

  // ── Tooltip state ──────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState(null) // { assignment, violations, x, y }

  const handleTipShow = (e, assignment) => {
    setTooltip({ assignment, violations, x: e.clientX, y: e.clientY })
  }
  const handleTipHide = () => setTooltip(null)

  const visibleDates = useMemo(
    () => Array.from({ length: daysInView }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')),
    [weekStart, daysInView]
  )

  const { assignMap, unassignedMap } = useMemo(() => {
    const am = {}
    for (const emp of employeesArr) am[emp.id] = {}
    const um = {}
    for (const a of assignmentsArr) {
      if (a.employee_id && am[a.employee_id]) {
        if (!am[a.employee_id][a.date]) am[a.employee_id][a.date] = []
        am[a.employee_id][a.date].push(a)
      } else {
        if (!um[a.date]) um[a.date] = []
        um[a.date].push(a)
      }
    }
    return { assignMap: am, unassignedMap: um }
  }, [employeesArr, assignmentsArr])

  // Total assigned hours per employee across all dates in the schedule
  const empTotalHoursMap = useMemo(() => {
    const map = {}
    for (const a of assignmentsArr) {
      if (!a.employee_id || !a.start_time || !a.end_time) continue
      map[a.employee_id] = (map[a.employee_id] ?? 0) + shiftDurationHours(a.start_time, a.end_time)
    }
    return map
  }, [assignmentsArr])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  if (!employeesArr.length) return null

  // ── Handlers passed down to views ─────────────────────────────────────────
  const handleClickEditShift  = (assignment) => setEditingAssignment(assignment)
  const handleClickCreateShift = (date) => setCreateCtx({ date })
  // Double-click: date + optional pre-filled times from position / coverage row
  const handleDblClickCreate  = (date, startTime, endTime) =>
    setCreateCtx({ date, startTime, endTime })

  const handleEditSave = (shiftId, newEmpId) => {
    onReassign?.(shiftId, newEmpId || null)
    setEditingAssignment(null)
  }
  const handleEditDelete = (shiftId) => {
    onDeleteShift?.(shiftId)
    setEditingAssignment(null)
  }
  const handleCreate = (shiftData, empId) => {
    onCreateShift?.(shiftData, empId)
    setCreateCtx(null)
  }

  const allSkills = useMemo(() => {
    const s = new Set()
    for (const emp of employeesArr) for (const sk of emp.skills ?? []) s.add(sk.toLowerCase())
    return [...s].sort()
  }, [employeesArr])

  // Coverage — click row label: collect all assignments matching this shift type
  const handleClickEditShiftType = (type) => {
    const skills = [...(type.required_skills ?? [])].sort()
    const typeKey = `${type.start_time}|${type.end_time}|${skills.join(',')}`
    const allShiftsOfType = assignmentsArr.filter((a) => {
      const aSkills = [...(a.required_skills ?? [])].sort()
      return `${a.start_time}|${a.end_time}|${aSkills.join(',')}` === typeKey
    })
    setEditingShiftType({ type, allShiftsOfType })
  }

  // Coverage — copy row: for each date that already has ≥1 shift of this type, add one more
  const handleCopyShiftType = (type) => {
    const skills = [...(type.required_skills ?? [])].sort()
    const typeKey = `${type.start_time}|${type.end_time}|${skills.join(',')}`
    const datesWithType = [...new Set(
      assignmentsArr
        .filter((a) => {
          const aSkills = [...(a.required_skills ?? [])].sort()
          return `${a.start_time}|${a.end_time}|${aSkills.join(',')}` === typeKey
        })
        .map((a) => a.date)
    )]
    const running = [...shiftsArr]
    for (const date of datesWithType) {
      const baseId = `${date}_${type.start_time}`
      const count = running.filter((s) => s.id?.startsWith(baseId)).length
      const shift = {
        id: `${baseId}_slot${count}`,
        date,
        start_time: type.start_time,
        end_time:   type.end_time,
        required_skills: type.required_skills,
        slot_index: count,
      }
      onCreateShift?.(shift, null)
      running.push(shift)
    }
  }

  // Coverage — edit all: update times + skills on every shift of that type
  const handleEditAllShiftType = (shiftIds, patch) => {
    onEditShiftType?.(shiftIds, patch)
  }

  return (
    <div>
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 bg-white">
        <WeekNav
          weekStart={weekStart}
          allDates={allDates}
          daysInView={daysInView}
          onPrev={() => setWeekStart((w) => addDays(w, -daysInView))}
          onNext={() => setWeekStart((w) => addDays(w, daysInView))}
          onToday={() => {
            const target = allDates.includes(todayStr) ? todayStr : allDates[0]
            const base = target ? parseISO(target) : new Date()
            setWeekStart(daysInView === 1 ? base : startOfWeek(base, { weekStartsOn: 1 }))
          }}
        />
        <div className="flex items-center gap-2">
          <DayWeekToggle daysInView={daysInView} onChange={(d) => {
            setDaysInView(d)
            if (d === 7) setWeekStart((w) => startOfWeek(w, { weekStartsOn: 1 }))
          }} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {view === 'employee' && (
        <EmployeeView
          employees={employeesArr}
          visibleDates={visibleDates}
          assignMap={assignMap}
          unassignedMap={unassignedMap}
          empTotalHoursMap={empTotalHoursMap}
          editable={editable}
          violations={violations}
          hourLabelStep={daysInView === 1 ? 2 : 6}
          onReassign={onReassign}
          onClickEditShift={handleClickEditShift}
          onClickCreateShift={handleClickCreateShift}
          onDblClickCreate={handleDblClickCreate}
          onTipShow={handleTipShow}
          onTipHide={handleTipHide}
        />
      )}
      {view === 'shift' && (
        <ShiftView
          employees={employeesArr}
          assignments={assignmentsArr}
          visibleDates={visibleDates}
          editable={editable}
          violations={violations}
          onReassign={onReassign}
          onClickEditShift={handleClickEditShift}
          onClickCreateShift={handleClickCreateShift}
        />
      )}
      {view === 'coverage' && (
        <CoverageView
          employees={employeesArr}
          shifts={shiftsArr}
          assignments={assignmentsArr}
          visibleDates={visibleDates}
          editable={editable}
          violations={violations}
          onReassign={onReassign}
          onClickEditShift={handleClickEditShift}
          onClickCreateShift={handleClickCreateShift}
          onDblClickCreate={handleDblClickCreate}
          onClickEditShiftType={handleClickEditShiftType}
          onCopyShiftType={handleCopyShiftType}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-amber-100 border border-amber-300" />
          Unassigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-brand-purple/80 border border-brand-purple" />
          Assigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-brand-teal/80 border border-teal-300" />
          Auto-scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-emerald-100 border border-emerald-200" />
          Preferred
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-amber-100 border border-amber-200" />
          Unpreferred
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-rose-200 border border-rose-300" />
          Unavailable
        </span>
        {violations && Object.keys(violations).length > 0 && (
          <span className="flex items-center gap-1.5 text-red-500">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Constraint violation
          </span>
        )}
        {view === 'employee' && (
          <span className="ml-auto">Showing {H_START}:00 – {H_END}:00{editable ? ' · Double-click to add · Drag to reassign' : ''}</span>
        )}
        {view === 'shift' && editable && (
          <span className="ml-auto">Double-click any cell to add a shift</span>
        )}
      </div>

      {/* Tooltip */}
      <ShiftTooltip tip={tooltip} />

      {/* Modals */}
      {editingAssignment && (
        <ShiftEditModal
          assignment={editingAssignment}
          employees={employeesArr}
          violations={violations}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
          onClose={() => setEditingAssignment(null)}
          onFindSubstitutes={onFindSubstitutes}
        />
      )}
      {editingShiftType && (
        <ShiftTypeEditModal
          type={editingShiftType.type}
          allShiftsOfType={editingShiftType.allShiftsOfType}
          allSkills={allSkills}
          employees={employeesArr}
          onDeleteAll={() => {
            for (const a of editingShiftType.allShiftsOfType) onDeleteShift?.(a.shift_id)
            setEditingShiftType(null)
          }}
          onReassignAll={(empId) => {
            for (const a of editingShiftType.allShiftsOfType) onReassign?.(a.shift_id, empId)
          }}
          onEditAll={(startTime, endTime, skills) => {
            const shiftIds = editingShiftType.allShiftsOfType.map((a) => a.shift_id)
            handleEditAllShiftType(shiftIds, { start_time: startTime, end_time: endTime, required_skills: skills })
          }}
          onClose={() => setEditingShiftType(null)}
        />
      )}
      {createCtx && (
        <ShiftCreateModal
          date={createCtx.date}
          employees={employeesArr}
          existingShifts={shiftsArr}
          dateFrom={dateFrom}
          dateTo={dateTo}
          initialStartTime={createCtx.startTime}
          initialEndTime={createCtx.endTime}
          onCreate={handleCreate}
          onClose={() => setCreateCtx(null)}
        />
      )}
    </div>
  )
}
