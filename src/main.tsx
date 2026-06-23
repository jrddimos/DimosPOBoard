import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Capturer le type d'auth AVANT que Supabase efface le hash de l'URL
const _hash = window.location.hash
if (_hash.includes('type=invite'))   sessionStorage.setItem('auth_flow', 'invite')
if (_hash.includes('type=recovery')) sessionStorage.setItem('auth_flow', 'recovery')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
