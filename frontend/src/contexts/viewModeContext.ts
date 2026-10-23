export type ViewMode = 'admin' | 'volunteer'

/** Role-driven UI: mode and booleans from API role (GET /api/users/me). */
export type ViewModeContextValue = {
  mode: ViewMode
  isAdmin: boolean
  isVolunteer: boolean
  isDeactivated: boolean
}
