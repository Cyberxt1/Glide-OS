import { useState } from 'react'
import { navigate } from '../lib/route'
import { resolveDefaultDashboard } from '../lib/store'
import { supabase } from '../lib/supabase'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    if (mode === 'register') {
      const response = await fetch('/api/auth-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        setMessage(result?.error ?? 'Account could not be created.')
        setBusy(false)
        return
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setMessage(error?.message ?? 'Sign in failed.')
      setBusy(false)
      return
    }

    const destination = await resolveDefaultDashboard(data.user)
    navigate(destination)
  }

  return (
    <main className="auth-page-lite">
      <a className="brand" href="/"><span className="mark" /> Glide</a>
      <form className="auth-card" onSubmit={submit}>
        <p className="kicker">{mode === 'login' ? 'Store operations' : 'Merchant onboarding'}</p>
        <h1>{mode === 'login' ? 'Open your store.' : 'Create store access.'}</h1>
        <label><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
        <label><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required /></label>
        {message ? <p className="form-message">{message}</p> : null}
        <button className="button primary" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Open dashboard' : 'Create account'}</button>
        <small>{mode === 'login' ? 'New to Glide?' : 'Already registered?'} <a href={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Register store' : 'Sign in'}</a></small>
      </form>
    </main>
  )
}
