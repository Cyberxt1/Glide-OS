import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Store access',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        Glide
      </Link>
      <section className="auth-panel">
        <p className="dash-kicker">Store operations</p>
        <h1>Step into your store.</h1>
        <p>Secure access for owners and registered team members.</p>
        <LoginForm nextPath={params.next} accessError={params.error} />
        <p className="auth-switch">New to Glide? <Link href="/register">Create a store account</Link></p>
      </section>
      <p className="auth-footnote">Glide retail operating system</p>
    </main>
  )
}
