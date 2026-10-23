import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './lib/firebase'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import CreateWalkPage from './pages/CreateWalkPage'
import WalksPage from './pages/WalksPage'
import WalkDetailPage from './pages/WalkDetailPage'
import MyWalksPage from './pages/MyWalksPage'
import ManageUsersPage from './pages/ManageUsersPage'
import { useCurrentUser } from './contexts/useCurrentUser'

import type { ReactNode } from 'react'

function RequireAuth({ user, children }: { user: User | null; children: ReactNode }) {
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useCurrentUser()

  if (loading) {
    return <div style={{ padding: 24 }}>Checking access...</div>
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function RequireActiveAccount({ children }: { children: ReactNode }) {
  const { loading, isDeactivated } = useCurrentUser()

  if (loading) {
    return <div style={{ padding: 24 }}>Checking access...</div>
  }
  if (isDeactivated) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { loading: currentUserLoading } = useCurrentUser()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>
  if (user && currentUserLoading) {
    return <div style={{ padding: 24 }}>Loading your account...</div>
  }

  return (
    <Routes>
      {/* default */}
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />

      {/* public */}
      <Route path="/login" element={<LoginPage user={user} />} />

      {/* protected */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth user={user}>
            <Dashboard user={user!} />
          </RequireAuth>
        }
      />

      <Route
        path="/walks"
        element={
          <RequireAuth user={user}>
            <RequireActiveAccount>
              <WalksPage user={user!} />
            </RequireActiveAccount>
          </RequireAuth>
        }
      />
      <Route
        path="/walks/create"
        element={
          <RequireAuth user={user}>
            <RequireActiveAccount>
              <RequireAdmin>
                <CreateWalkPage user={user!} />
              </RequireAdmin>
            </RequireActiveAccount>
          </RequireAuth>
        }
      />
      <Route
        path="/walks/:id"
        element={
          <RequireAuth user={user}>
            <RequireActiveAccount>
              <WalkDetailPage user={user!} />
            </RequireActiveAccount>
          </RequireAuth>
        }
      />
      <Route
        path="/my-walks"
        element={
          <RequireAuth user={user}>
            <RequireActiveAccount>
              <MyWalksPage user={user!} />
            </RequireActiveAccount>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth user={user}>
            <RequireActiveAccount>
              <RequireAdmin>
                <ManageUsersPage user={user!} />
              </RequireAdmin>
            </RequireActiveAccount>
          </RequireAuth>
        }
      />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
