import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RegisterForm } from './register-form'

export const metadata: Metadata = {
  title: 'Create store account',
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string
    password?: string
    error?: string
    status?: string
  }>
}) {
  const params = await searchParams

  if (params.email || params.password) {
    redirect('/register?error=unsafe-get')
  }

  const initialError =
    params.error === 'unsafe-get'
      ? 'The unsafe form request was blocked. Enter a new password before continuing.'
      : params.error
        ? 'The account could not be created. Check your details and retry.'
        : ''
  const initialMessage =
    params.status === 'check-email'
      ? 'Check your email to confirm the account, then continue to store setup.'
      : ''

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        Glide
      </Link>
      <section className="auth-panel">
        <p className="dash-kicker">Merchant onboarding</p>
        <h1>Build your moving store.</h1>
        <p>Create the owner account first. Your store and first branch come next.</p>
        <RegisterForm initialError={initialError} initialMessage={initialMessage} />
        <p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p>
      </section>
      <p className="auth-footnote">Glide retail operating system</p>
    </main>
  )
}
