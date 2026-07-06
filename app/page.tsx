const steps = [
  {
    number: '01',
    title: 'Scan',
    body: 'A counter QR opens the right store instantly. No download. No account wall.',
  },
  {
    number: '02',
    title: 'Pick',
    body: 'Choose what you want from a live menu built for one-handed, high-speed shopping.',
  },
  {
    number: '03',
    title: 'Pay',
    body: 'Glide validates every price securely, then completes payment in a few clean taps.',
  },
  {
    number: '04',
    title: 'Go',
    body: 'Your verified exit pass appears while the paid order lands at the counter in real time.',
  },
]

function GlideMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  )
}

function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  return (
    <svg
      className={direction === 'down' ? 'arrow arrow-down' : 'arrow'}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export default function HomePage() {
  return (
    <main>
      <section className="hero-section" id="top">
        <nav className="site-nav" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="Glide home">
            <GlideMark />
            Glide
          </a>

          <div className="nav-links">
            <a href="#flow">How it works</a>
            <a href="#merchant">For merchants</a>
          </div>

          <a className="nav-action" href="#merchant">
            Enter the flow
            <Arrow />
          </a>
        </nav>

        <div className="hero-aura" aria-hidden="true">
          <div className="aura-line aura-line-one" />
          <div className="aura-line aura-line-two" />
          <div className="aura-line aura-line-three" />
          <div className="moving-signal">
            <span />
          </div>
        </div>

        <div className="hero-content">
          <p className="eyebrow">
            <span />
            Retail at full speed
          </p>
          <h1>
            Move through.
            <br />
            <span>Not the queue.</span>
          </h1>
          <div className="hero-intro">
            <p>
              Scan. Shop. Pay. Leave. Glide turns any busy counter into a seamless
              self-checkout experience.
            </p>
            <a className="text-action" href="#flow">
              See how it moves
              <Arrow direction="down" />
            </a>
          </div>
        </div>

        <div className="hero-foot">
          <p>Built for the rush</p>
          <p className="flow-sequence">
            <span>Scan</span>
            <i />
            <span>Pick</span>
            <i />
            <span>Pay</span>
            <i />
            <span>Go</span>
          </p>
          <p>Glide / 001</p>
        </div>
      </section>

      <section className="flow-section" id="flow">
        <div className="section-heading">
          <p className="section-index">01 / The movement</p>
          <h2>
            One scan.
            <br />
            Everything flows.
          </h2>
          <p className="section-note">
            Made for the moments when every second at the counter matters.
          </p>
        </div>

        <ol className="flow-list">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="step-line" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>

      <section className="merchant-section" id="merchant">
        <div className="merchant-orbit" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="orbit orbit-three" />
          <span className="orbit-core">
            <GlideMark />
          </span>
        </div>

        <div className="merchant-topline">
          <p className="section-index">02 / The operating system</p>
          <p>Customer calm. Counter clarity.</p>
        </div>

        <div className="merchant-copy">
          <h2>
            Your busiest hour
            <br />
            should be your <em>best.</em>
          </h2>
          <div className="merchant-summary">
            <p>
              Glide keeps orders moving, payments verified, and your team focused on
              serving—not managing a queue.
            </p>
            <a className="primary-action" href="#flow">
              Discover the Glide flow
              <Arrow />
            </a>
            <span className="availability">Pilot access opening soon</span>
          </div>
        </div>

        <footer>
          <a className="brand" href="#top" aria-label="Back to the top">
            <GlideMark />
            Glide
          </a>
          <p>Queue-free retail, by design.</p>
          <p>© 2026 Glide</p>
        </footer>
      </section>
    </main>
  )
}
