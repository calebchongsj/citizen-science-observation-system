import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const mockUseCurrentUser = vi.fn()
const mockOnAuthStateChanged = vi.fn()

vi.mock('../lib/firebase', () => ({
  auth: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: Parameters<typeof mockOnAuthStateChanged>) =>
    mockOnAuthStateChanged(...args),
}))

vi.mock('../contexts/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

vi.mock('../pages/LoginPage', () => ({
  default: () => <div>Login page</div>,
}))

vi.mock('../pages/Dashboard', () => ({
  default: () => <div>Dashboard page</div>,
}))

vi.mock('../pages/CreateWalkPage', () => ({
  default: () => <div>Create walk page</div>,
}))

vi.mock('../pages/WalksPage', () => ({
  default: () => <div>Walks page</div>,
}))

vi.mock('../pages/WalkDetailPage', () => ({
  default: () => <div>Walk detail page</div>,
}))

vi.mock('../pages/MyWalksPage', () => ({
  default: () => <div>My walks page</div>,
}))

vi.mock('../pages/ManageUsersPage', () => ({
  default: () => <div>Manage users page</div>,
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'admin-uid' })
      return () => {}
    })
  })

  it('waits for current user hydration before rendering protected content', () => {
    mockUseCurrentUser.mockReturnValue({
      loading: true,
      isAdmin: false,
      isDeactivated: false,
      role: null,
      error: null,
      isVolunteer: false,
      mode: 'volunteer',
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Loading your account...')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })

  it('renders the protected page once the current user is hydrated', () => {
    mockUseCurrentUser.mockReturnValue({
      loading: false,
      isAdmin: true,
      isDeactivated: false,
      role: 'admin',
      error: null,
      isVolunteer: false,
      mode: 'admin',
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.queryByText('Loading your account...')).not.toBeInTheDocument()
  })
})
