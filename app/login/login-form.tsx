'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({
  nextPath,
  accessError,
}: {
  nextPath?: string
  accessError?: string
}) {
  const router = useRouter()
  const [error, setError] = useState(
    accessError === 'confirmation'
      ? 'The email confirmation link is invalid or expired.'
      : accessError
        ? 'This account does not have access to that store.'
        : '',
  )
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })

    if (signInError) {
      setError('The email or password is incorrect.')
      setPending(false)
      return
    }

    router.replace(nextPath?.startsWith('/') ? nextPath : '/dash')
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
        {pending ? 'Opening store…' : 'Open dashboard'}
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  )
}
