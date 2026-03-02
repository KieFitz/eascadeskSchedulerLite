import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Input from '../components/common/Input'
import Button from '../components/common/Button'
import toast from 'react-hot-toast'
import logo from '../assets/logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Invalid credentials. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-lavender-light via-white to-brand-teal/10 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-r from-brand-purple to-brand-purple-light px-8 py-8 text-center">
            <div className="flex items-center justify-center mx-auto mb-3">
                <img src={logo} alt="Eascadesk Logo" className="h-12 w-auto rounded-md" />
            </div>
            <h1 className="text-white font-semibold text-xl">Eascadesk Scheduler</h1>
            <p className="text-white/70 text-sm mt-1">Sign in to your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button
              type="submit"
              className="w-full justify-center mt-2"
              size="lg"
              loading={submitting}
            >
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand-purple font-medium hover:underline">
            Sign up free
          </Link>
        </p>

        <p className="text-center text-xs text-muted mt-2">
          Eascadesk &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
