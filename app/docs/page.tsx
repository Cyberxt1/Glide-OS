import Link from 'next/link'

export default function DocsPage() {
  return (
    <main className="legal-page">
      <Link href="/">Glide</Link>
      <section>
        <p>Developer Documentation</p>
        <h1>Integration surface is being formalized.</h1>
        <span>
          Current integration anchors include active QR routes, the shopper PWA,
          checkout initialization, Paystack webhooks, and secure receipt token
          verification.
        </span>
      </section>
    </main>
  )
}
