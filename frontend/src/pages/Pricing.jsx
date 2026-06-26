import { useEffect, useState } from 'react'
import { CheckIcon, StarIcon } from '@heroicons/react/24/outline'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { useTranslations } from '../i18n'
import { createCheckout, createPortal } from '../api/payments'
import toast from 'react-hot-toast'

export default function Pricing() {
  const { user } = useAuth()
  const { t } = useTranslations()
  const isPro = user?.plan === 'paid'

  const FREE_FEATURES = t('freeFeatures').map((text) => ({ text }))
  const ALL_PRO_FEATURES = [
    ...FREE_FEATURES.map((f) => ({ ...f, pro: false })),
    ...t('proExtras').map((text) => ({ text, pro: true })),
  ]
  const FAQS = t('faqs')

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'cancelled') {
      toast(t('checkoutCancelled'), { icon: 'ℹ️' })
      window.history.replaceState({}, '', '/pricing')
    }
  }, [])

  const handleUpgrade = async () => {
    setCheckoutLoading(true)
    try {
      const { url } = await createCheckout()
      window.location.href = url
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('checkoutFail'))
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const { url } = await createPortal()
      window.location.href = url
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t('portalFail'))
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <Layout title={t('pricingTitle')}>
      <div className="max-w-4xl">

        {/* Page heading */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-dark mb-1">{t('plansHeading')}</h2>
          <p className="text-sm text-muted">{t('plansSubtitle')}</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">

          {/* Free card */}
          <div className={`bg-white rounded-xl border-2 p-6 flex flex-col transition-shadow ${
            !isPro ? 'border-brand-purple shadow-soft' : 'border-gray-200'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-dark text-lg">{t('free')}</h3>
                <p className="text-3xl font-bold text-dark mt-1">
                  €0
                  <span className="text-sm font-normal text-muted">{t('perMonth')}</span>
                </p>
                <p className="text-xs text-muted mt-0.5">{t('noCardRequired')}</p>
              </div>
              {!isPro && <Badge colour="purple">{t('yourPlan')}</Badge>}
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map(({ text }) => (
                <li key={text} className="flex items-start gap-2 text-sm text-dark">
                  <CheckIcon className="h-4 w-4 text-brand-teal flex-shrink-0 mt-0.5" />
                  {text}
                </li>
              ))}
            </ul>

            <Button variant="secondary" className="w-full justify-center" disabled>
              {isPro ? t('freePlanBtn') : t('currentPlan')}
            </Button>
          </div>

          {/* Pro card */}
          <div className={`bg-white rounded-xl border-2 p-6 flex flex-col transition-shadow ${
            isPro ? 'border-brand-teal shadow-soft' : 'border-brand-purple shadow-card'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-dark text-lg">{t('pro')}</h3>
                <p className="text-3xl font-bold text-dark mt-1">
                  €15
                  <span className="text-sm font-normal text-muted">{t('perMonth')}</span>
                </p>
                <p className="text-xs text-muted mt-0.5">{t('cancelAnyTime')}</p>
              </div>
              {isPro
                ? <Badge colour="teal">{t('activeBadge')}</Badge>
                : <Badge colour="amber">{t('recommended')}</Badge>
              }
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {ALL_PRO_FEATURES.map(({ text, pro }) => (
                <li
                  key={text}
                  className={`flex items-start gap-2 text-sm ${pro ? 'font-medium text-brand-purple' : 'text-dark'}`}
                >
                  <CheckBadgeIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${pro ? 'text-brand-purple' : 'text-brand-teal'}`} />
                  {text}
                  {pro && (
                    <span className="ml-auto text-xs bg-brand-purple/10 text-brand-purple rounded px-1.5 py-0.5 font-normal leading-none self-center">
                      {t('pro')}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {isPro ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                onClick={handlePortal}
                loading={portalLoading}
              >
                {t('manageSubscription')}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={handleUpgrade}
                loading={checkoutLoading}
              >
                <StarIcon className="h-4 w-4" />
                {t('upgradeToProBtn')}
              </Button>
            )}
          </div>
        </div>

        {/* Stripe trust badge */}
        {!isPro && (
          <p className="text-center text-xs text-muted mb-8">
            {t('stripeTrust')}
          </p>
        )}

        {/* FAQ */}
        <div className="bg-white rounded-xl shadow-soft p-6">
          <h3 className="font-semibold text-dark mb-5">{t('faqHeading')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {FAQS.map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-medium text-dark mb-1">{q}</p>
                <p className="text-xs text-muted leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  )
}
