/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'
import { CurrentUserProvider } from '../contexts/CurrentUserProvider'
import type { ReactElement } from 'react'

interface AllTheProvidersProps {
  children: React.ReactNode
}

function AllTheProviders({ children }: AllTheProvidersProps) {
  return (
    <MemoryRouter>
      <ThemeProvider>
        <CurrentUserProvider>{children}</CurrentUserProvider>
      </ThemeProvider>
    </MemoryRouter>
  )
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

export * from '@testing-library/react'
export { customRender as render }
