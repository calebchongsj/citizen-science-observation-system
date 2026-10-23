import { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'auto'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  effectiveTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// External store for system theme preference
function subscribeToSystemTheme(callback: () => void) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getSystemThemeSnapshot(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme')
    return (savedTheme as Theme) || 'auto'
  })

  // Subscribe to system theme changes
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => 'light' as const // Server-side fallback
  )

  // Derive effective theme from current theme setting and system preference
  const effectiveTheme: 'light' | 'dark' = (() => {
    if (theme === 'auto') return systemTheme
    if (theme === 'light') return 'light'
    return 'dark'
  })()

  // Always publish the effective theme on the DOM so component-level
  // light/dark styles stay consistent even when the saved preference is "auto".
  useEffect(() => {
    const root = document.documentElement

    root.setAttribute('data-theme', effectiveTheme)
    root.setAttribute('data-theme-mode', theme)
    localStorage.setItem('theme', theme)
  }, [theme, effectiveTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
