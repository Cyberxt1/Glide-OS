import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/">Glide</Link>
      <section>
        <p>Terms of Infrastructure Use</p>
        <h1>Glide is store checkout infrastructure.</h1>
        <span>
          Merchants are responsible for product accuracy, staff access, customer
          disputes, and compliance with local retail and payment obligations while
          using Glide operating tools.
        </span>
      </section>
    </main>
  )
}
