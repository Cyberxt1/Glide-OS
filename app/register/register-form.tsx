'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export function RegisterForm({
  initialError = '',
  initialMessage = '',
}: {
  initialError?: string
  initialMessage?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState(initialMessage)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json()) as {
        error?: string
        requiresConfirmation?: boolean
      }

      if (!response.ok) {
        setError(result.error ?? 'The account could not be created.')
        setPending(false)
        return
      }

      if (result.requiresConfirmation) {
        setMessage('Check your email to confirm the account, then continue to store setup.')
        setPending(false)
        return
      }

      router.replace('/setup')
      router.refresh()
    } catch {
      setError('Glide could not reach the registration service. Check your connection and retry.')
      setPending(false)
    }
  }

  return (
    <form
      className="auth-form"
      method="post"
      action="/api/auth/register"
      onSubmit={handleSubmit}
    >
      <label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
      <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Continue'}<span aria-hidden="true">↗</span></button>
    </form>
  )
}
