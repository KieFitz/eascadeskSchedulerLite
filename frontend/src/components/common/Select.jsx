import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

/**
 * Branded custom dropdown — replaces native <select>.
 *
 * Props:
 *   value       — controlled value
 *   onChange    — called with the new value string (not a synthetic event)
 *   options     — [{ value, label }]
 *   placeholder — shown when value is '' (optional)
 *   label       — rendered above (optional)
 *   className   — extra classes on the trigger button (optional)
 *   size        — 'sm' (compact, px-2 py-1.5 text-sm) | 'md' (default, px-3 py-2 text-sm)
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = '— Select —',
  label,
  className = '',
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = options.find((o) => String(o.value) === String(value))

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const sizeClasses = size === 'sm'
    ? 'px-2 py-1.5 text-sm'
    : 'px-3 py-2 text-sm'

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label className="text-sm font-medium text-dark">{label}</label>
      )}

      <div ref={ref} className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={[
            'w-full flex items-center justify-between gap-2',
            'rounded-lg border bg-white text-dark text-left',
            'transition-colors duration-150',
            open
              ? 'border-brand-purple ring-2 ring-brand-purple/30'
              : 'border-brand-lavender hover:border-brand-purple/50',
            sizeClasses,
            className,
          ].join(' ')}
        >
          <span className={selected ? 'text-dark' : 'text-muted'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon
            className={[
              'flex-shrink-0 h-3.5 w-3.5 text-brand-purple transition-transform duration-150',
              open ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <ul className="absolute z-50 mt-1 w-full min-w-max rounded-lg border border-brand-lavender bg-white shadow-card py-1 max-h-60 overflow-y-auto scrollbar-thin">
            {options.map((opt) => {
              const active = String(opt.value) === String(value)
              return (
                <li
                  key={opt.value}
                  onMouseDown={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={[
                    'px-3 py-2 text-sm cursor-pointer select-none transition-colors duration-100',
                    active
                      ? 'bg-brand-purple text-white font-medium'
                      : 'text-dark hover:bg-brand-lavender/40',
                  ].join(' ')}
                >
                  {opt.label}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
