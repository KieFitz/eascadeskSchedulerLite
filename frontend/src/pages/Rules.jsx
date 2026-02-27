import { useEffect, useState } from 'react'
import { CheckCircleIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../api/auth'
import toast from 'react-hot-toast'

const COUNTRIES = [
  {
    code: 'IE',
    name: 'Ireland',
    flag: '🇮🇪',
    summary: 'Working Time Act 1997',
    rules: [
      'Maximum 48-hour average working week',
      'Minimum 11 hours rest between shifts',
      'Minimum 24-hour weekly rest period',
      'Minimum 15-minute break after 4.5 hours',
      'Sunday premium pay entitlement',
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    summary: 'Working Time Regulations 1998',
    rules: [
      'Maximum 48-hour average working week (opt-out available)',
      'Minimum 11 hours daily rest',
      'Minimum 24-hour weekly rest period',
      'Minimum 20-minute break after 6 hours',
      '5.6 weeks statutory annual leave',
    ],
  },
  {
    code: 'ES',
    name: 'Spain',
    flag: '🇪🇸',
    summary: 'Workers\' Statute (Estatuto de los Trabajadores)',
    rules: [
      'Maximum 40-hour ordinary working week',
      'Maximum 9 hours overtime per day',
      'Minimum 12 hours rest between shifts',
      'Minimum 1.5 days weekly rest',
      '30 calendar days annual leave',
    ],
  },
]

export default function Rules() {
  const { user, refreshUser } = useAuth()
  const [selected, setSelected] = useState(user?.country ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(user?.country ?? null)
  }, [user?.country])

  const isDirty = selected !== (user?.country ?? null)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(selected)
      await refreshUser()
      toast.success('Country saved!')
    } catch {
      toast.error('Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Rules">
      <div className="max-w-3xl">
        {/* Intro */}
        <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-brand-purple/10 flex-shrink-0">
              <GlobeAltIcon className="h-6 w-6 text-brand-purple" />
            </div>
            <div>
              <h2 className="font-semibold text-dark mb-1">Labour Law Country</h2>
              <p className="text-sm text-muted leading-relaxed">
                Select the country whose labour laws apply to your workforce. The scheduler will
                use this setting to apply the appropriate hard constraints — such as minimum rest
                periods and maximum shift lengths — when building your schedule.
              </p>
              <p className="text-xs text-muted mt-2 italic">
                Industry-specific rule templates are coming soon.
              </p>
            </div>
          </div>
        </div>

        {/* Country cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {COUNTRIES.map((c) => {
            const isSelected = selected === c.code
            return (
              <button
                key={c.code}
                onClick={() => setSelected(isSelected ? null : c.code)}
                className={[
                  'text-left rounded-xl border-2 p-5 transition-all duration-150 focus:outline-none',
                  'focus:ring-2 focus:ring-brand-purple focus:ring-offset-2',
                  isSelected
                    ? 'border-brand-purple bg-brand-lavender-light/30 shadow-soft'
                    : 'border-gray-200 bg-white hover:border-brand-purple/40 hover:bg-gray-50',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">{c.flag}</span>
                  {isSelected ? (
                    <CheckCircleSolid className="h-5 w-5 text-brand-purple" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <p className="font-semibold text-dark text-sm mb-0.5">{c.name}</p>
                <p className="text-xs text-muted">{c.summary}</p>
              </button>
            )
          })}
        </div>

        {/* Rule detail */}
        {selected && (() => {
          const country = COUNTRIES.find((c) => c.code === selected)
          return country ? (
            <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
              <h3 className="font-semibold text-dark mb-3 flex items-center gap-2">
                <span>{country.flag}</span>
                {country.name} — Scheduling Constraints
              </h3>
              <ul className="space-y-2">
                {country.rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-dark">
                    <CheckCircleSolid className="h-4 w-4 text-brand-teal flex-shrink-0 mt-0.5" />
                    {rule}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-4 italic">
                These constraints will be enforced as hard rules in the Timefold solver once fully
                integrated. Currently shown for informational purposes.
              </p>
            </div>
          ) : null
        })()}

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!isDirty} loading={saving}>
            Save Settings
          </Button>
          {!isDirty && user?.country && (
            <span className="text-xs text-muted">
              Currently set to{' '}
              <strong>{COUNTRIES.find((c) => c.code === user.country)?.name ?? user.country}</strong>
            </span>
          )}
        </div>
      </div>
    </Layout>
  )
}
