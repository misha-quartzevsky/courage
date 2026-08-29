import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initPwaUpdates } from './lib/pwa-update'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

initPwaUpdates()