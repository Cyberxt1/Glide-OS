'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export function LoginForm({
  nextPath,
  accessError,
}: {
  nextPath?: string
  accessError?: string
}) {
  const router = useRouter()
  const initialError =
    accessError === 'confirmation'
      ? 'The email confirmation link is invalid or expired.'
      : accessError === 'credentials'
        ? 'The email or password is incorrect.'
        : accessError
          ? 'This account does not have access to that store.'
          : ''
  const [error, setError] = useState(initialError)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email')),
        password: String(form.get('password')),
        nextPath,
      }),
    })
    const result = (await response.json().catch(() => null)) as {
      error?: string
      nextPath?: string
    } | null

    if (!response.ok) {
      setError(result?.error ?? 'Sign-in could not be completed. Please retry.')
      setPending(false)
      return
    }

    router.replace(result?.nextPath?.startsWith('/') ? result.nextPath : '/dash')
    router.refresh()
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        <span>Email address</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Opening store...' : 'Open dashboard'}
        <span aria-hidden="true">-&gt;</span>
      </button>
    </form>
  )
}

