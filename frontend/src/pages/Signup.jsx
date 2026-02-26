import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { register } from '../api/auth'
import Input from '../components/common/Input'
import Button from '../components/common/Button'
import toast from 'react-hot-toast'

export default function Signup() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await register(username, email, password)
      await login(email, password)
      toast.success('Account created! Welcome to Eascadesk Scheduler.')
      navigate('/')
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? 'Could not create account. Please try again.')
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
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-xl">E</span>
            </div>
            <h1 className="text-white font-semibold text-xl">Create your account</h1>
            <p className="text-white/70 text-sm mt-1">Free · No credit card required</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-4">
            <Input
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourname"
              required
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            <Button
              type="submit"
              className="w-full justify-center mt-2"
              size="lg"
              loading={submitting}
            >
              Create free account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-purple font-medium hover:underline">
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-muted mt-2">
          Eascadesk &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
