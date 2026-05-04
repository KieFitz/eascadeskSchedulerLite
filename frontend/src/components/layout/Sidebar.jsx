import { NavLink } from 'react-router-dom'
import {
  CalendarDaysIcon,
  ClockIcon,
  ScaleIcon,
  ArrowRightStartOnRectangleIcon,
  StarIcon,
  CreditCardIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../context/AuthContext'
import { useTranslations } from '../../i18n'
import Badge from '../common/Badge'
import logo from '../../assets/logo.png'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { t } = useTranslations(user?.country)
  const isPro = user?.plan === 'paid'

  const navItems = [
    { to: '/schedules', label: t('navSchedule'), Icon: CalendarDaysIcon },
    ...(isPro ? [
      { to: '/employees',  label: 'Employees',   Icon: UserGroupIcon },
      { to: '/clock',      label: 'Clock Events', Icon: ClockIcon },
    ] : []),
    { to: '/rules', label: t('navRules'), Icon: ScaleIcon },
  ]

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-dark flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded flex items-center justify-center">
            <img
              src={logo}
              alt="Eascadesk"
              className="h-9 w-9 rounded-lg object-contain bg-white/5 p-1"
            />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Eascadesk</p>
            <p className="text-white/50 text-xs">Scheduler Lite</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-purple text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
              ].join(' ')
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* Upgrade / Billing link */}
        <NavLink
          to="/pricing"
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-1',
              isActive
                ? isPro
                  ? 'bg-brand-teal/20 text-brand-teal'
                  : 'bg-brand-purple text-white'
                : isPro
                ? 'text-white/60 hover:text-white hover:bg-white/10'
                : 'text-brand-teal hover:text-white hover:bg-brand-teal/20',
            ].join(' ')
          }
        >
          {isPro ? (
            <CreditCardIcon className="h-5 w-5 flex-shrink-0" />
          ) : (
            <StarIcon className="h-5 w-5 flex-shrink-0" />
          )}
          {isPro ? 'Billing' : 'Upgrade to Pro'}
        </NavLink>
      </nav>

      {/* User / Plan / Logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {user && (
          <div className="px-3 py-2">
            <p className="text-white text-xs font-medium truncate">{user.username}</p>
            <p className="text-white/50 text-xs truncate">{user.email}</p>
            <div className="mt-1.5">
              {isPro ? (
                <Badge colour="teal">Pro</Badge>
              ) : (
                <Badge colour="gray">Free</Badge>
              )}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}
