import { StarIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Button from '../common/Button'

export default function Header({ title }) {
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold text-dark">{title}</h1>

      <div className="flex items-center gap-3">
        {user?.plan === 'free' && (
          <Link to="/pricing" tabIndex={-1}>
            <Button variant="teal" size="sm">
              <StarIcon className="h-4 w-4" />
              Upgrade to Pro
            </Button>
          </Link>
        )}
        {user && (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-purple to-brand-teal flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {user.username?.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
