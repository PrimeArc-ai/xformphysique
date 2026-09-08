import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './design-tokens.css'
import './styles.css'
import './profile-photos.css'
import './admin.css'
import './precision.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
