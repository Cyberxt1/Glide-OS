import { StoreLookup } from './store-lookup'

export const dynamic = 'force-static'

const pillars = [
  {
    title: 'Scan',
    body: 'Customers scan a localized counter or shelf QR code to launch an instant, zero-download digital inventory ledger directly in their native phone browser.',
  },
  {
    title: 'Pay',
    body: 'Items are added to a secure, server-verified basket. Checkout triggers a direct, lightning-fast web transfer link handled securely via Paystack.',
  },
  {
    title: 'Pass',
    body: 'Successful payment generates a dynamic, synchronized visual exit token. Store security inspects the token barcode at the gate for instant loss prevention clearance.',
  },
]

const ledger = [
  {
    title: 'Anti-Fraud Clearance',
    body: 'Dynamic, clock-synchronized exit tokens prevent screenshot reuse at the exit gate and keep every paid basket inspectable.',
  },
  {
    title: 'Terminal Lockdown',
    body: 'Hardware fingerprinting and location-binding protocols restrict staff dashboard access to authorized devices inside the physical store network.',
  },
  {
    title: 'Isolated Liquidity',
    body: 'Transaction funds split automatically at purchase, routing merchant earnings directly to their bank accounts while separating platform fees.',
  },
]

function GlideMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  )
}

export default function HomePage() {
  const demoScanUrl = process.env.NEXT_PUBLIC_DEMO_SCAN_URL || '#store-lookup'
  const databaseStatus = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Operational' : 'Configuration Required'
  const paystackStatus = process.env.PAYSTACK_SECRET_KEY ? 'Nominal' : 'Setup Required'

  return (
    <main className="landing-os">
      <header className="global-header">
        <a className="landing-brand" href="/" aria-label="Glide home">
          <GlideMark />
          <span>
            <strong>Glide</strong>
            <small>Operating system by SpaceV</small>
          </span>
        </a>
        <nav className="global-actions" aria-label="Merchant navigation">
          <a href="/login">Merchant Login</a>
          <a className="register-action" href="/register">Register Store</a>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-command">
          <p>Self-checkout infrastructure for dense retail environments</p>
          <h1>Vaporize Retail Checkout Queues.</h1>
          <span>
            A zero-download, high-velocity self-checkout utility built to eliminate
            transaction friction and loss in dense consumer hubs.
          </span>
          <div className="hero-command-actions">
            <a className="deploy-action" href="/register">Deploy Glide in Your Store</a>
            <a className="simulate-action" href={demoScanUrl}>Simulate a Customer Scan</a>
          </div>
        </div>

        <div id="store-lookup" className="route-interceptor">
          <StoreLookup />
        </div>
      </section>

      <section className="pillar-section" id="operation">
        <div className="landing-section-head">
          <p>Operational loop</p>
          <h2>How It Operates</h2>
        </div>
        <div className="pillar-grid">
          {pillars.map((pillar, index) => (
            <article key={pillar.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="security-ledger" id="security">
        <div className="landing-section-head">
          <p>Security and compliance ledger</p>
          <h2>Built for Rigorous Retail Environments.</h2>
        </div>
        <div className="ledger-matrix">
          {ledger.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer-hub">
        <div>
          <a className="landing-brand compact" href="/">
            <GlideMark />
            <span>
              <strong>Glide</strong>
              <small>SpaceV infrastructure</small>
            </span>
          </a>
          <p>Copyright 2026 Glide and SpaceV. Platform v0.0.0.</p>
        </div>
        <div className="status-column">
          <span>Database: {databaseStatus}</span>
          <span>Paystack Gateway: {paystackStatus}</span>
        </div>
        <nav className="footer-links" aria-label="Operational links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Infrastructure Use</a>
          <a href="/docs">Developer Documentation</a>
        </nav>
      </footer>
    </main>
  )
}
