import { StarIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../context/AuthContext'
import Badge from '../common/Badge'
import Button from '../common/Button'
import { createCheckout } from '../../api/payments'
import toast from 'react-hot-toast'

export default function Header({ title }) {
  const { user } = useAuth()

  const handleUpgrade = async () => {
    try {
      const data = await createCheckout()
      window.location.href = data.url
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Could not start checkout')
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold text-dark">{title}</h1>

      <div className="flex items-center gap-3">
        {user?.plan === 'free' && (
          <Button variant="teal" size="sm" onClick={handleUpgrade}>
            <StarIcon className="h-4 w-4" />
            Upgrade to Pro
          </Button>
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
