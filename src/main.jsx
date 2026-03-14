import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#111827',
          color: '#f9fafb',
          border: '1px solid #374151',
          fontSize: '14px',
        },
      }}
    />
  </StrictMode>,
)
