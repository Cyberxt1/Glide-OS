import { useState } from 'react'
import { navigate } from '../lib/route'

const pillars = [
  ['Scan', 'Customers scan a counter or shelf QR code to open the live store basket in their browser.'],
  ['Pay', 'The basket is verified on the server and checkout opens Paystack securely.'],
  ['Pass', 'Payment creates a live receipt token that cashier and security teams can verify.'],
]

export function HomePage() {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(event: React.FormEvent) {
    event.preventDefault()
    if (query.trim().length < 2) {
      setMessage('Type at least 2 characters.')
      return
    }

    setBusy(true)
    setMessage('')
    const response = await fetch(`/api/stores-lookup?q=${encodeURIComponent(query.trim())}`)
    const result = (await response.json().catch(() => null)) as { shoppingUrl?: string; error?: string } | null
    setBusy(false)

    if (!response.ok || !result?.shoppingUrl) {
      setMessage(result?.error ?? 'No active store matched that name or code.')
      return
    }

    navigate(result.shoppingUrl)
  }

  return (
    <main className="landing">
      <header className="topbar">
        <a className="brand" href="/"><span className="mark" /> <strong>Glide</strong><small>OS by SpaceV</small></a>
        <nav>
          <a href="/login">Merchant Login</a>
          <a className="primary-link" href="/register">Register Store</a>
        </nav>
      </header>

      <section className="hero">
        <p className="kicker">Retail self-checkout infrastructure</p>
        <h1>Vaporize Retail Checkout Queues.</h1>
        <p>A zero-download, high-velocity self-checkout utility built to eliminate transaction friction and loss in dense consumer hubs.</p>
        <div className="hero-actions">
          <a className="button primary" href="/register">Deploy Glide in Your Store</a>
          <a className="button ghost" href="#store-lookup">Simulate a Customer Scan</a>
        </div>
      </section>

      <form id="store-lookup" className="lookup-card" onSubmit={lookup}>
        <label>Standing in a partner store right now without a QR code reader?</label>
        <div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type Store Name or Code (e.g., Campus Kitchen)..." />
          <button disabled={busy}>{busy ? 'Checking...' : 'Find Store'}</button>
        </div>
        {message ? <p>{message}</p> : null}
      </form>

      <section className="section">
        <div className="section-head"><p className="kicker">How it operates</p><h2>Scan. Pay. Pass.</h2></div>
        <div className="pillars">
          {pillars.map(([title, body], index) => (
            <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="section trust">
        <div className="section-head"><p className="kicker">Security ledger</p><h2>Built for Rigorous Retail Environments.</h2></div>
        <article><strong>Anti-Fraud Clearance</strong><p>Live receipt tokens prevent simple screenshot reuse at the exit gate.</p></article>
        <article><strong>Terminal Lockdown</strong><p>Staff dashboards require authenticated store roles and can be narrowed by operational policy.</p></article>
        <article><strong>Isolated Liquidity</strong><p>Checkout runs through server-verified Paystack initialization.</p></article>
      </section>

      <footer className="footer">
        <span>Copyright 2026 Glide and SpaceV. Platform v0.1.0.</span>
        <span>Database: Operational</span>
        <nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/docs">Docs</a></nav>
      </footer>
    </main>
  )
}
