import { useEffect, useState } from 'react'
import { CheckCircleIcon, ClockIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Select from '../components/common/Select'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../api/auth'
import { useTranslations } from '../i18n'
import toast from 'react-hot-toast'

const TIMEZONES = [
  { value: 'Europe/Dublin',    label: 'Europe/Dublin (Ireland, UTC+0/+1)' },
  { value: 'Europe/London',    label: 'Europe/London (UK, UTC+0/+1)' },
  { value: 'Europe/Madrid',    label: 'Europe/Madrid (Spain, UTC+1/+2)' },
  { value: 'Europe/Paris',     label: 'Europe/Paris (France, UTC+1/+2)' },
  { value: 'Europe/Berlin',    label: 'Europe/Berlin (Germany, UTC+1/+2)' },
  { value: 'Europe/Lisbon',    label: 'Europe/Lisbon (Portugal, UTC+0/+1)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (Netherlands, UTC+1/+2)' },
  { value: 'Europe/Warsaw',    label: 'Europe/Warsaw (Poland, UTC+1/+2)' },
  { value: 'Europe/Bucharest', label: 'Europe/Bucharest (Romania, UTC+2/+3)' },
  { value: 'Atlantic/Canary',  label: 'Atlantic/Canary (Canary Islands, UTC+0/+1)' },
  { value: 'UTC',              label: 'UTC' },
]

const COUNTRY_DEFAULT_TZ = {
  IE: 'Europe/Dublin',
  GB: 'Europe/London',
  ES: 'Europe/Madrid',
}

export default function Rules() {
  const { user, refreshUser } = useAuth()
  const { t } = useTranslations()
  const [selected, setSelected] = useState(user?.country ?? null)
  const [timezone, setTimezone] = useState(user?.timezone ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(user?.country ?? null)
    setTimezone(user?.timezone ?? '')
  }, [user?.country, user?.timezone])

  // When country changes and timezone hasn't been explicitly set, suggest the default
  const handleCountrySelect = (code) => {
    setSelected((prev) => {
      const next = prev === code ? null : code
      if (next && !user?.timezone) setTimezone(COUNTRY_DEFAULT_TZ[next] ?? '')
      return next
    })
  }

  const isDirty =
    selected !== (user?.country ?? null) ||
    timezone !== (user?.timezone ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings({ country: selected, timezone: timezone || null })
      await refreshUser()
      toast.success(t('toastCountrySaved'))
    } catch {
      toast.error(t('toastCountryFail'))
    } finally {
      setSaving(false)
    }
  }

  const countries = t('countries')

  return (
    <Layout title={t('rulesTitle')}>
      <div className="max-w-3xl">
        {/* Intro */}
        <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-brand-purple/10 flex-shrink-0">
              <GlobeAltIcon className="h-6 w-6 text-brand-purple" />
            </div>
            <div>
              <h2 className="font-semibold text-dark mb-1">{t('labourLawCountry')}</h2>
              <p className="text-sm text-muted leading-relaxed">{t('labourLawDesc')}</p>
              <p className="text-xs text-muted mt-2 italic">{t('comingSoon')}</p>
            </div>
          </div>
        </div>

        {/* Country cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {countries.map((c) => {
            const isSelected = selected === c.code
            return (
              <button
                key={c.code}
                onClick={() => handleCountrySelect(c.code)}
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
          const country = countries.find((c) => c.code === selected)
          return country ? (
            <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
              <h3 className="font-semibold text-dark mb-3 flex items-center gap-2">
                <span>{country.flag}</span>
                {country.name} — {t('schedulingConstraints')}
              </h3>
              <ul className="space-y-2">
                {country.rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-dark">
                    <CheckCircleSolid className="h-4 w-4 text-brand-teal flex-shrink-0 mt-0.5" />
                    {rule}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-4 italic">{t('constraintsNote')}</p>
            </div>
          ) : null
        })()}

        {/* Timezone */}
        <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-brand-purple/10 flex-shrink-0">
              <ClockIcon className="h-6 w-6 text-brand-purple" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-dark mb-1">{t('businessTimezone')}</h2>
              <p className="text-sm text-muted leading-relaxed mb-3">
                {t('businessTimezoneDesc')}
              </p>
              <Select
                value={timezone}
                onChange={setTimezone}
                placeholder={t('selectTimezone')}
                options={TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }))}
              />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!isDirty} loading={saving}>
            {t('saveSettings')}
          </Button>
          {!isDirty && user?.country && (
            <span className="text-xs text-muted">
              {t('currentlySetTo')}{' '}
              <strong>{countries.find((c) => c.code === user.country)?.name ?? user.country}</strong>
            </span>
          )}
        </div>
      </div>
    </Layout>
  )
}
