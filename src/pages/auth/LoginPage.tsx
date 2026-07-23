import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input, FormGroup } from '@/components/ui/Form'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [mode, setMode]         = useState<'login' | 'reset'>('login')
  const [sent, setSent]         = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand rounded-2xl mb-4">
            <img src="/logo.svg" alt="" className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-navy">Dimos <em className="italic">Inside</em></h1>
          <p className="text-subtle text-sm mt-1">By Roofers For Roofers</p>
        </div>

        <div className="bg-card rounded-2xl shadow-card border border-border p-8">
          {mode === 'login' ? (
            <>
              <h2 className="text-lg font-bold text-navy mb-6">Connexion</h2>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <FormGroup label="Email" required>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@dimos.fr" required />
                </FormGroup>
                <FormGroup label="Mot de passe" required>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                </FormGroup>
                {error && <div className="bg-red/10 text-red text-sm rounded-lg px-4 py-3">{error}</div>}
                <Button type="submit" loading={loading} className="w-full mt-2">Se connecter</Button>
              </form>
              <button onClick={() => { setMode('reset'); setError('') }}
                className="mt-4 text-xs text-subtle hover:text-purple transition-colors w-full text-center">
                Mot de passe oublié ?
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-navy mb-2">Réinitialiser</h2>
              {sent ? (
                <div className="bg-green/10 text-green text-sm rounded-lg px-4 py-3">Email envoyé !</div>
              ) : (
                <form onSubmit={handleReset} className="flex flex-col gap-4">
                  <FormGroup label="Email" required>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@dimos.fr" required />
                  </FormGroup>
                  {error && <div className="bg-red/10 text-red text-sm rounded-lg px-4 py-3">{error}</div>}
                  <Button type="submit" loading={loading} className="w-full">Envoyer</Button>
                </form>
              )}
              <button onClick={() => { setMode('login'); setError(''); setSent(false) }}
                className="mt-4 text-xs text-subtle hover:text-purple transition-colors w-full text-center">
                ← Retour
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
