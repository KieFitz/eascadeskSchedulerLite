import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { TrashIcon, ClockIcon } from '@heroicons/react/24/outline'
import Spinner from '../components/common/Spinner'
import Badge from '../components/common/Badge'
import Select from '../components/common/Select'

const API = (import.meta.env.VITE_API_URL ?? '') + '/api/v1'

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const AVAIL_COLOUR = { preferred: 'teal', unpreferred: 'amber', unavailable: 'gray' }
const AVAIL_LABEL  = { preferred: 'Prefer to work', unpreferred: 'Prefer not to work', unavailable: 'Unavailable' }

const APPLIES_OPTIONS = [
  { value: 'weekdays',  label: 'Every weekday (Mon–Fri)' },
  { value: 'weekends',  label: 'Every weekend (Sat–Sun)' },
  { value: 'every_day', label: 'Every day' },
  { value: 'dow',       label: 'Specific day of week' },
  { value: 'date',      label: 'Specific date' },
]

const DOW_OPTIONS = DAYS_FULL.map((d, i) => ({ value: String(i), label: d }))

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

const EMPTY_FORM = {
  type: 'preferred',
  applies: 'weekdays',
  day_of_week: '0',
  specific_date: '',
  startH: '09',
  startM: '00',
  endH: '17',
  endM: '00',
  allDay: false,
}

function minutesToParts(min) {
  return {
    h: String(Math.floor(min / 60)).padStart(2, '0'),
    m: String(min % 60).padStart(2, '0'),
  }
}

function partsToMinutes(h, m) {
  return Number(h) * 60 + Number(m)
}

function ruleLabel(r) {
  if (r.recurrence === 'weekdays')  return 'Every weekday'
  if (r.recurrence === 'weekends')  return 'Every weekend'
  if (r.recurrence === 'every_day') return 'Every day'
  if (r.specific_date)              return r.specific_date
  return DAYS_FULL[r.day_of_week] ?? '—'
}

function timeLabel(r) {
  const s = minutesToParts(r.start_min)
  const e = minutesToParts(r.end_min)
  if (s.h === '00' && s.m === '00' && r.end_min >= 1438) return 'All day'
  return `${s.h}:${s.m} – ${e.h}:${e.m}`
}

// ── Underline tabs ────────────────────────────────────────────────────────────
function Tabs({ active, onChange }) {
  return (
    <div className="flex border-b border-white/15 mb-6">
      {[
        { id: 'add',  label: 'Add Preference' },
        { id: 'view', label: 'Current Preferences' },
      ].map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={[
            'flex-1 pb-3 text-sm font-semibold transition-all duration-200',
            active === t.id
              ? 'text-brand-purple border-b-2 border-brand-purple -mb-px'
              : 'text-brand-purple-light hover:text-brand-purple/70',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Drum-scroll column ────────────────────────────────────────────────────────
const ITEM_H = 48

function DrumColumn({ items, value, onChange }) {
  const ref = useRef(null)
  const settling = useRef(true)

  useEffect(() => {
    const idx = items.indexOf(value)
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = idx * ITEM_H
    }
    // Allow a frame for the browser to process the scrollTop assignment
    const raf = requestAnimationFrame(() => { settling.current = false })
    return () => cancelAnimationFrame(raf)
  }, []) // centre on mount only

  const commit = () => {
    if (!ref.current) return
    const i = Math.max(0, Math.min(Math.round(ref.current.scrollTop / ITEM_H), items.length - 1))
    ref.current.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
    if (items[i] !== value) onChange(items[i])
  }

  return (
    <div className="relative flex-1">
      {/* selection band */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[48px] border-t border-b border-white/25 z-10" />

      <div
        ref={ref}
        onScroll={() => {
          if (settling.current || !ref.current) return
          const i = Math.max(0, Math.min(Math.round(ref.current.scrollTop / ITEM_H), items.length - 1))
          if (items[i] !== value) onChange(items[i])
        }}
        onMouseUp={commit}
        onTouchEnd={commit}
        className="h-[192px] overflow-y-scroll scrollbar-none"
        style={{ scrollSnapType: 'y mandatory', scrollPaddingTop: ITEM_H * 2 }}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item) => (
          <div
            key={item}
            onMouseDown={() => {
              onChange(item)
              const i = items.indexOf(item)
              ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
            }}
            style={{ height: ITEM_H, scrollSnapAlign: 'start' }}
            className={[
              'flex items-center justify-center text-3xl font-semibold cursor-pointer select-none transition-colors duration-150',
              item === value ? 'text-white' : 'text-white/20',
            ].join(' ')}
          >
            {item}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  )
}

// ── Time picker modal ─────────────────────────────────────────────────────────
function TimePickerModal({ title, h, m, onConfirm, onClose }) {
  const [localH, setLocalH] = useState(h)
  const [localM, setLocalM] = useState(m)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-[#1a1733] px-6 pt-5 pb-8 shadow-2xl">
        {/* drag handle — mobile hint */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-brand-purple/20 sm:hidden" />
        <p className="text-center text-sm font-semibold text-brand-purple/50 uppercase tracking-wider mb-6">
          {title}
        </p>
        <div className="flex items-center gap-3 mb-8">
          <DrumColumn items={HOURS}   value={localH} onChange={setLocalH} />
          <span className="text-brand-purple/30 text-3xl font-bold pb-1">:</span>
          <DrumColumn items={MINUTES} value={localM} onChange={setLocalM} />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-brand-purple/20 py-3 text-sm font-semibold text-brand-purple/50 hover:text-brand-purple/80 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(localH, localM); onClose() }}
            className="flex-1 rounded-xl bg-brand-purple py-3 text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tappable time chip ────────────────────────────────────────────────────────
function TimeChip({ label, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 rounded-xl border border-white/15 py-3 px-2 hover:border-white/30 active:scale-[0.97] transition-all"
    >
      <span className="text-xs font-semibold text-brand-purple/50 uppercase tracking-wider">{label}</span>
      <span className="text-xl font-bold text-brand-purple">{value}</span>
      <ClockIcon className="h-4 w-4 text-brand-purple/50 mt-0.5" />
    </button>
  )
}

// ── Field label ───────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <p className="text-xs font-semibold text-brand-purple/50 uppercase tracking-wider mb-2">{children}</p>
}

export default function AvailabilityPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [tab, setTab]           = useState('add')
  const [name, setName]         = useState('')
  const [rules, setRules]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState(EMPTY_FORM)
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const [saved, setSaved]       = useState(false)
  // null | 'start' | 'end'
  const [timePicker, setTimePicker] = useState(null)

  useEffect(() => {
    if (!token) {
      setError('No access token in link. Please use the link sent to your WhatsApp.')
      setLoading(false)
      return
    }
    async function load() {
      try {
        const [infoRes, rulesRes] = await Promise.all([
          axios.get(`${API}/availability/me/info`, { params: { token } }),
          axios.get(`${API}/availability/me`,      { params: { token } }),
        ])
        setName(infoRes.data.name)
        setRules(rulesRes.data)
      } catch (err) {
        setError(err?.response?.data?.detail ?? 'This link is invalid or has expired.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 3000) }

  const handleAdd = async () => {
    setAddError('')
    setAdding(true)
    try {
      const startMin = form.allDay ? 0    : partsToMinutes(form.startH, form.startM)
      const endMin   = form.allDay ? 1439 : partsToMinutes(form.endH,   form.endM)

      const payload = { type: form.type, start_min: startMin, end_min: endMin }
      if (form.applies === 'dow') {
        payload.recurrence  = 'none'
        payload.day_of_week = Number(form.day_of_week)
      } else if (form.applies === 'date') {
        payload.recurrence    = 'none'
        payload.specific_date = form.specific_date
      } else {
        payload.recurrence = form.applies
      }

      const { data } = await axios.post(`${API}/availability/me`, payload, { params: { token } })
      setRules((prev) => [...prev, data])
      setForm(EMPTY_FORM)
      flash()
      setTab('view')
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 409) {
        setError(detail ?? 'This link has already been used. Request a new one via WhatsApp.')
      } else {
        setAddError(detail ?? 'Failed to add rule. Please try again.')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id) => {
    setRemovingId(id)
    try {
      await axios.delete(`${API}/availability/me/${id}`, { params: { token } })
      setRules((prev) => prev.filter((r) => r.id !== id))
      flash()
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 409) {
        setError(detail ?? 'This link has already been used. Request a new one via WhatsApp.')
      } else {
        setAddError(detail ?? 'Failed to remove rule.')
      }
    } finally {
      setRemovingId(null)
    }
  }

  const canAdd = !(form.applies === 'date' && !form.specific_date)

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-dark flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-3xl mb-4">⚠️</p>
          <p className="font-semibold text-white mb-2">Link not valid</p>
          <p className="text-sm text-white/50">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-brand-dark to-[#1e1b4b] px-3 pb-12">
      {/* Header */}
      <div className="w-full lg:max-w-2xl lg:mx-auto pt-8 pb-6">
        <p className="text-brand-purple-light font-bold text-xl">My Availability</p>
        <p className="text-brand-purple-light/50 text-sm mt-0.5">Hi {name} — update your preferences below</p>
      </div>

      {/* Saved banner */}
      {saved && (
        <div className="w-full lg:max-w-2xl lg:mx-auto mb-5">
          <p className="text-brand-teal text-sm font-medium">✅ Changes saved</p>
        </div>
      )}

      <div className="w-full lg:max-w-2xl lg:mx-auto">
        <Tabs active={tab} onChange={setTab} />

        {/* ── ADD TAB ─────────────────────────────────────────────────────── */}
        {tab === 'add' && (
          <div className="space-y-6">

            {/* Type picker */}
            <div>
              <FieldLabel>I want to…</FieldLabel>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { value: 'preferred',   label: 'Prefer to work',     emoji: '✅' },
                  { value: 'unpreferred', label: 'Prefer not to work', emoji: '⚠️' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: opt.value })}
                    className={[
                      'rounded-xl border-2 py-3 px-2 text-center text-xs font-semibold transition-all',
                      form.type === opt.value
                        ? 'border-brand-purple text-brand-purple hover:border-brand-purple/80 hover:text-brand-purple/80'
                        : 'border-white/15 text-brand-purple/40 hover:border-white/30 hover:text-brand-purple/60',
                    ].join(' ')}
                  >
                    <div className="text-xl mb-1">{opt.emoji}</div>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Applies to */}
            <div>
              <FieldLabel>Applies to</FieldLabel>
              <Select
                value={form.applies}
                onChange={(v) => setForm({ ...form, applies: v })}
                options={APPLIES_OPTIONS}
              />
            </div>

            {/* Day of week */}
            {form.applies === 'dow' && (
              <div>
                <FieldLabel>Day</FieldLabel>
                <Select
                  value={form.day_of_week}
                  onChange={(v) => setForm({ ...form, day_of_week: v })}
                  options={DOW_OPTIONS}
                />
              </div>
            )}

            {/* Specific date */}
            {form.applies === 'date' && (
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.specific_date}
                  onChange={(e) => setForm({ ...form, specific_date: e.target.value })}
                  className="w-full rounded-lg border border-brand-lavender bg-white px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors"
                />
              </div>
            )}

            {/* All day toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                role="switch"
                aria-checked={form.allDay}
                onClick={() => setForm({ ...form, allDay: !form.allDay })}
                className={[
                  'w-10 h-6 rounded-full border transition-colors relative shrink-0',
                  form.allDay ? 'bg-brand-purple' : 'bg-white/20',
                ].join(' ')}
              >
                <div className={[
                  'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  form.allDay ? 'translate-x-5' : 'translate-x-1',
                ].join(' ')} />
              </div>
              <span className="text-sm text-purple/70">All day</span>
            </label>

            {/* Time chips — tap to open modal */}
            {!form.allDay && (
              <div>
                <FieldLabel>Time range</FieldLabel>
                <div className="flex gap-2 sm:gap-3">
                  <TimeChip
                    label="From"
                    value={`${form.startH}:${form.startM}`}
                    onClick={() => setTimePicker('start')}
                  />
                  <TimeChip
                    label="To"
                    value={`${form.endH}:${form.endM}`}
                    onClick={() => setTimePicker('end')}
                  />
                </div>
              </div>
            )}

            {addError && (
              <p className="text-xs text-red-400">{addError}</p>
            )}

            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !canAdd}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding && <Spinner size="sm" />}
              Save preference
            </button>
          </div>
        )}

        {/* ── VIEW TAB ────────────────────────────────────────────────────── */}
        {tab === 'view' && (() => {
          if (rules.length === 0) {
            return (
              <p className="text-sm text-purple/40 text-center py-10">
                No preferences set — you're available for any shift by default.
              </p>
            )
          }

          // Group rules by type, preserving display order
          const TYPE_ORDER = ['preferred', 'unpreferred', 'unavailable']
          const groups = TYPE_ORDER
            .map((type) => ({ type, items: rules.filter((r) => r.type === type) }))
            .filter((g) => g.items.length > 0)

          return (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Badge colour={AVAIL_COLOUR[g.type]}>{AVAIL_LABEL[g.type]}</Badge>
                  </div>
                  {/* Rules under this group */}
                  <div>
                    {g.items.map((r, i) => (
                      <div
                        key={r.id}
                        className={[
                          'flex items-center justify-between gap-3 py-3 sm:py-4',
                          i < g.items.length - 1 ? 'border-b border-white/10' : '',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className="text-purple text-sm font-medium">{ruleLabel(r)}</p>
                          <p className="text-purple/40 text-xs mt-0.5">{timeLabel(r)}</p>
                        </div>
                        <button
                          onClick={() => handleRemove(r.id)}
                          disabled={removingId === r.id}
                          className="text-purple/25 hover:text-red-400 transition-colors shrink-0"
                          title="Remove"
                        >
                          {removingId === r.id ? <Spinner size="sm" /> : <TrashIcon className="h-5 w-5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        <p className="text-center text-white/20 text-xs mt-8">
          Changes are saved immediately and visible to your manager.
        </p>
      </div>

      {/* Time picker modals */}
      {timePicker === 'start' && (
        <TimePickerModal
          title="Start time"
          h={form.startH}
          m={form.startM}
          onConfirm={(h, m) => setForm((f) => ({ ...f, startH: h, startM: m }))}
          onClose={() => setTimePicker(null)}
        />
      )}
      {timePicker === 'end' && (
        <TimePickerModal
          title="End time"
          h={form.endH}
          m={form.endM}
          onConfirm={(h, m) => setForm((f) => ({ ...f, endH: h, endM: m }))}
          onClose={() => setTimePicker(null)}
        />
      )}
    </div>
  )
}
