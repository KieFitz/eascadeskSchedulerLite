import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ScheduleList from './pages/ScheduleList'
import ScheduleEditor from './pages/ScheduleEditor'
import Rules from './pages/Rules'
import Pricing from './pages/Pricing'
import Employees from './pages/Employees'
import ClockEvents from './pages/ClockEvents'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function ProRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.plan !== 'paid') return <Navigate to="/pricing" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"  element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Schedule list — default landing page */}
      <Route
        path="/schedules"
        element={
          <ProtectedRoute>
            <ScheduleList />
          </ProtectedRoute>
        }
      />

      {/* Schedule editor — parameterised by run ID */}
      <Route
        path="/schedules/:runId"
        element={
          <ProtectedRoute>
            <ScheduleEditor />
          </ProtectedRoute>
        }
      />

      <Route
        path="/employees"
        element={
          <ProRoute>
            <Employees />
          </ProRoute>
        }
      />

      <Route
        path="/clock"
        element={
          <ProRoute>
            <ClockEvents />
          </ProRoute>
        }
      />

      <Route
        path="/rules"
        element={
          <ProtectedRoute>
            <Rules />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <ProtectedRoute>
            <Pricing />
          </ProtectedRoute>
        }
      />

      {/* Legacy / root → schedules list */}
      <Route path="/" element={<Navigate to="/schedules" replace />} />
      <Route path="*" element={<Navigate to="/schedules" replace />} />
    </Routes>
  )
}
