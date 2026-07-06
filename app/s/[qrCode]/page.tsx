import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatNaira } from '@/lib/store/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ScanPageProps = {
  params: Promise<{ qrCode: string }>
  searchParams: Promise<{ start?: string }>
}

export default async function ScanPage({ params, searchParams }: ScanPageProps) {
  const { qrCode } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: qr } = await supabase
    .from('qr_codes')
    .select(`
      id,
      code,
      merchant_id,
      merchants(name, slug),
      store_locations(name, city)
    `)
    .eq('code', qrCode)
    .eq('status', 'active')
    .maybeSingle()

  if (!qr || !qr.merchant_id) notFound()

  const admin = createAdminClient()
  const { data: qrStats } = await admin
    .from('qr_codes')
    .select('scan_count')
    .eq('id', qr.id)
    .maybeSingle()

  await admin
    .from('qr_codes')
    .update({
      scan_count: (qrStats?.scan_count ?? 0) + 1,
      last_scanned_at: new Date().toISOString(),
    })
    .eq('id', qr.id)

  const merchant = qr.merchants as unknown as { name: string; slug: string }
  const location = qr.store_locations as unknown as { name: string; city: string | null } | null
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, price_kobo')
    .eq('merchant_id', qr.merchant_id)
    .eq('is_available', true)
    .order('name')

  const started = query.start === '1'

  return (
    <main className="scan-page">
      <section className="scan-shell">
        {!started ? (
          <div className="scan-welcome">
            <p className="scan-kicker">Welcome to Glide</p>
            <h1>Skip the queue. Start from where you stand.</h1>
            <p className="scan-copy">
              You are now shopping at {merchant.name}
              {location ? ` - ${location.name}${location.city ? `, ${location.city}` : ''}` : ''}.
            </p>
            <div className="scan-actions">
              <Link className="scan-primary" href={`/s/${qrCode}?start=1`}>
                Start Self-Checkout
              </Link>
            </div>
          </div>
        ) : (
          <div className="scan-catalog">
            <header className="scan-catalog-head">
              <div>
                <p className="scan-kicker">Now shopping</p>
                <h1>{merchant.name}</h1>
                <p>
                  {location ? `${location.name}${location.city ? `, ${location.city}` : ''}` : 'Store catalog'}
                </p>
              </div>
              <Link className="scan-secondary" href={`/s/${qrCode}`}>
                Back
              </Link>
            </header>

            <section className="scan-surface">
              <div className="scan-surface-head">
                <strong>{products?.length ?? 0} live products</strong>
                <span>Checkout connection comes next</span>
              </div>
              {products?.length ? (
                <div className="scan-product-list">
                  {products.map((product) => (
                    <article className="scan-product-row" key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.category || 'General merchandise'}</span>
                      </div>
                      <strong>{formatNaira(product.price_kobo)}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="scan-empty">
                  <strong>No products are live yet.</strong>
                  <p>The store catalog will appear here as soon as products are added in Glide.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
