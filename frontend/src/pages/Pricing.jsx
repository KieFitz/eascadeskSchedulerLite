import { useEffect, useState } from 'react'
import { CheckIcon, StarIcon } from '@heroicons/react/24/outline'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import Layout from '../components/layout/Layout'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { createCheckout, createPortal } from '../api/payments'
import toast from 'react-hot-toast'

const FREE_FEATURES = [
  { text: '1 auto-schedule per month', pro: false },
  { text: 'Shifts up to 14 days ahead', pro: false },
  { text: 'Unlimited employees & shifts', pro: false },
  { text: 'Excel upload & export', pro: false },
  { text: 'Availability preferences', pro: false },
  { text: 'Labour law constraints (IE, GB, ES)', pro: false },
]

const PRO_EXTRAS = [
  { text: 'Unlimited auto-schedules', pro: true },
  { text: 'Shifts up to 31 days ahead', pro: true },
]

const ALL_PRO_FEATURES = [
  ...FREE_FEATURES.map((f) => ({ ...f, pro: false })),
  ...PRO_EXTRAS,
]

const FAQS = [
  {
    q: 'Can I cancel at any time?',
    a: 'Yes. Cancel from the billing portal and your plan reverts to Free at the end of the current billing period.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'All your schedules and employees are kept. You simply lose access to Pro-only features.',
  },
  {
    q: 'Is there a free trial?',
    a: 'The Free plan lets you run one schedule per month at no cost — no credit card required. Upgrade whenever you need more.',
  },
  {
    q: 'How is billing handled?',
    a: 'Payments are processed securely by Stripe. We never store your card details.',
  },
]

export default function Pricing() {
  const { user } = useAuth()
  const isPro = user?.plan === 'paid'

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'cancelled') {
      toast('Checkout cancelled — your plan has not changed.', { icon: 'ℹ️' })
      window.history.replaceState({}, '', '/pricing')
    }
  }, [])

  const handleUpgrade = async () => {
    setCheckoutLoading(true)
    try {
      const { url } = await createCheckout()
      window.location.href = url
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Could not start checkout. Please try again.')
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
      toast.error(err?.response?.data?.detail ?? 'Could not open billing portal.')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <Layout title="Pricing">
      <div className="max-w-4xl">

        {/* Page heading */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-dark mb-1">Plans &amp; Pricing</h2>
          <p className="text-sm text-muted">Start free, upgrade when you need more.</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">

          {/* Free card */}
          <div className={`bg-white rounded-xl border-2 p-6 flex flex-col transition-shadow ${
            !isPro ? 'border-brand-purple shadow-soft' : 'border-gray-200'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-dark text-lg">Free</h3>
                <p className="text-3xl font-bold text-dark mt-1">
                  €0
                  <span className="text-sm font-normal text-muted">/month</span>
                </p>
                <p className="text-xs text-muted mt-0.5">No credit card required</p>
              </div>
              {!isPro && <Badge colour="purple">Your plan</Badge>}
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
              {isPro ? 'Free plan' : 'Current plan'}
            </Button>
          </div>

          {/* Pro card */}
          <div className={`bg-white rounded-xl border-2 p-6 flex flex-col transition-shadow ${
            isPro ? 'border-brand-teal shadow-soft' : 'border-brand-purple shadow-card'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-dark text-lg">Pro</h3>
                <p className="text-3xl font-bold text-dark mt-1">
                  €15
                  <span className="text-sm font-normal text-muted">/month</span>
                </p>
                <p className="text-xs text-muted mt-0.5">Cancel any time</p>
              </div>
              {isPro
                ? <Badge colour="teal">Active</Badge>
                : <Badge colour="amber">Recommended</Badge>
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
                      Pro
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
                Manage Subscription
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={handleUpgrade}
                loading={checkoutLoading}
              >
                <StarIcon className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>

        {/* Stripe trust badge */}
        {!isPro && (
          <p className="text-center text-xs text-muted mb-8">
            Secure payments powered by{' '}
            <span className="font-semibold text-dark">Stripe</span>
            {' '}· SSL encrypted · No card stored on our servers
          </p>
        )}

        {/* FAQ */}
        <div className="bg-white rounded-xl shadow-soft p-6">
          <h3 className="font-semibold text-dark mb-5">Frequently asked questions</h3>
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
