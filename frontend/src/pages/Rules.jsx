import { useEffect, useState } from 'react'
import { CheckCircleIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../api/auth'
import { useTranslations } from '../i18n'
import toast from 'react-hot-toast'

export default function Rules() {
  const { user, refreshUser } = useAuth()
  const { t } = useTranslations(user?.country)
  const [selected, setSelected] = useState(user?.country ?? null)
  const [saving, setSaving] = useState(false)

  // When the page is rendered with a different country in-progress selection,
  // preview that country's translations but keep the locale based on saved country.
  const { t: tSel } = useTranslations(selected)

  useEffect(() => {
    setSelected(user?.country ?? null)
  }, [user?.country])

  const isDirty = selected !== (user?.country ?? null)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(selected)
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
          const country = countries.find((c) => c.code === selected)
          return country ? (
            <div className="bg-white rounded-xl shadow-soft p-6 mb-5">
              <h3 className="font-semibold text-dark mb-3 flex items-center gap-2">
                <span>{country.flag}</span>
                {country.name} — {tSel('schedulingConstraints')}
              </h3>
              <ul className="space-y-2">
                {country.rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-dark">
                    <CheckCircleSolid className="h-4 w-4 text-brand-teal flex-shrink-0 mt-0.5" />
                    {rule}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-4 italic">{tSel('constraintsNote')}</p>
            </div>
          ) : null
        })()}

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
