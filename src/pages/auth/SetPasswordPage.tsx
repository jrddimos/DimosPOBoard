import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Zap } from 'lucide-react'

export default function SetPasswordPage() {
  const navigate  = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return }
    if (password !== confirm)  { setError('Les mots de passe ne correspondent pas'); return }

    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }
    sessionStorage.removeItem('auth_flow')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-navy rounded-2xl flex items-center justify-center">
            <Zap size={24} className="text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
          <h1 className="text-xl font-bold text-navy mb-1">Définir votre mot de passe</h1>
          <p className="text-sm text-subtle mb-6">Choisissez un mot de passe pour accéder au PO Board</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="ds-label mb-1 block">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="ds-input"
                placeholder="8 caractères minimum"
                autoFocus
              />
            </div>
            <div>
              <label className="ds-label mb-1 block">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="ds-input"
                placeholder="Répétez le mot de passe"
              />
            </div>

            {error && (
              <div className="text-xs text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !password || !confirm}
              className="ds-btn-primary w-full py-2.5 font-semibold disabled:opacity-50">
              {loading ? 'Enregistrement…' : 'Définir mon mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
