import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { ApiError, RafflesGoService } from '../api'
import { CurrentUserContext } from './currentUserContext'
import type { ApiRole } from './currentUserContext'

type TokenIdentity = {
  role: ApiRole | null
  isDeactivated: boolean
}

async function readIdentityFromIdToken(user: User): Promise<TokenIdentity> {
  try {
    const { claims } = await user.getIdTokenResult(true)
    const role = claims.role === 'admin' || claims.role === 'user' ? claims.role : null
    return {
      role,
      isDeactivated: claims.account_disabled === true,
    }
  } catch {
    return {
      role: null,
      isDeactivated: false,
    }
  }
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<ApiRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isDeactivated, setIsDeactivated] = useState(false)

  useEffect(() => {
    let generation = 0

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      generation += 1
      const myGen = generation

      if (!user) {
        setRole(null)
        setLoading(false)
        setError(null)
        setIsDeactivated(false)
        return
      }

      void (async () => {
        setLoading(true)
        setError(null)
        setRole(null)
        setIsDeactivated(false)

        const tokenIdentity = await readIdentityFromIdToken(user)
        if (myGen !== generation) return
        setRole(tokenIdentity.role)
        setIsDeactivated(tokenIdentity.isDeactivated)

        try {
          const me = await RafflesGoService.getCurrentUser()
          if (myGen !== generation) return
          setRole(me.role)
          if (tokenIdentity.isDeactivated) {
            setIsDeactivated(true)
          }
        } catch (e) {
          if (myGen !== generation) return
          if (e instanceof ApiError && e.status === 403) {
            setIsDeactivated(true)
            setError(null)
          } else {
            setError(e instanceof Error ? e : new Error(String(e)))
          }
        } finally {
          if (myGen === generation) {
            setLoading(false)
          }
        }
      })()
    })

    return () => {
      generation += 1
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => {
    const isAdmin = role === 'admin'
    const isVolunteer = role === 'user'
    const mode: 'admin' | 'volunteer' = isAdmin ? 'admin' : 'volunteer'
    return {
      role,
      loading,
      error,
      isDeactivated,
      isAdmin,
      isVolunteer,
      mode,
    }
  }, [role, loading, error, isDeactivated])

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}
