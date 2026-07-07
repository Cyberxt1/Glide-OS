import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/">Glide</Link>
      <section>
        <p>Privacy Policy</p>
        <h1>Retail data stays operationally scoped.</h1>
        <span>
          Glide stores merchant, staff, customer receipt, payment reference, and order
          clearance data only for checkout operation, fraud prevention, support, and
          statutory compliance.
        </span>
      </section>
    </main>
  )
}
