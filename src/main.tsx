import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import { App } from './App'
import { ErrorBoundary } from './components/error-boundary'
import { installGlobalErrorLogging } from './lib/error-log'

installGlobalErrorLogging(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
