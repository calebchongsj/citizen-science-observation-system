import { useContext } from 'react'
import { CurrentUserContext } from './currentUserContext'
import type { ViewModeContextValue } from './viewModeContext'

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) {
    throw new Error('useViewMode must be used within CurrentUserProvider')
  }
  return {
    mode: ctx.mode,
    isAdmin: ctx.isAdmin,
    isVolunteer: ctx.isVolunteer,
    isDeactivated: ctx.isDeactivated,
  }
}
