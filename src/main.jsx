import { createRoot } from 'react-dom/client'
import './index.css'
import './components/ui/ui-primitives.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
