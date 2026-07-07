export function LegalPage({ page }: { page: 'privacy' | 'terms' | 'docs' }) {
  const copy = {
    privacy: ['Privacy Policy', 'Glide stores operational checkout data for store workflows, fraud prevention, and support.'],
    terms: ['Terms of Infrastructure Use', 'Merchants remain responsible for product accuracy, staff access, and local retail obligations.'],
    docs: ['Developer Documentation', 'Core surfaces are QR shopper routes, checkout functions, Paystack webhooks, and merchant dashboards.'],
  }[page]

  return (
    <main className="simple-page">
      <a href="/" className="brand"><span className="mark" /> Glide</a>
      <section><p className="kicker">{copy[0]}</p><h1>{copy[1]}</h1></section>
    </main>
  )
}
