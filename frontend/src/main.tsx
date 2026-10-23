import App from './App.tsx'
import { configureApiAuth } from './lib/api-auth.ts'
import { BrowserRouter } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import React from 'react'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { CurrentUserProvider } from './contexts/CurrentUserProvider.tsx'
import { ToastProvider } from './contexts/ToastProvider.tsx'

// Import unified theme system
import './assets/style/main.css'

// Configure API client to include Firebase auth tokens
configureApiAuth()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ToastProvider>
          <CurrentUserProvider>
            <App />
          </CurrentUserProvider>
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
)
