import { createContext } from 'react'

export type ApiRole = 'admin' | 'user'

export type CurrentUserContextValue = {
  role: ApiRole | null
  loading: boolean
  error: Error | null
  isDeactivated: boolean
  isAdmin: boolean
  isVolunteer: boolean
  /** UI-oriented: 'admin' or 'volunteer' (maps from API role) */
  mode: 'admin' | 'volunteer'
}

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)
