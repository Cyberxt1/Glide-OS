import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDateTime, formatNaira } from '@/lib/store/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReceiptActions } from './receipt-actions'
import './receipt.css'

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, short_code, purchase_code, status, total_kobo, currency, paid_at, created_at, merchants(name), store_locations(name, address, city), order_items(id, product_name, quantity, unit_price_kobo, line_total_kobo)')
    .eq('receipt_token', token)
    .maybeSingle()

  if (!order || !['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)) {
    notFound()
  }

  const merchant = order.merchants as unknown as { name: string }
  const location = order.store_locations as unknown as { name: string; address: string | null; city: string | null }
  const items = order.order_items as unknown as {
    id: string
    product_name: string
    quantity: number
    unit_price_kobo: number
    line_total_kobo: number
  }[]
  const orderUuid = order.id

  return (
    <main className="receipt-page live-token-page">
      <ReceiptActions />
      <article className="receipt-paper live-token-card">
        <header>
          <Link href="/" className="receipt-brand">Glide</Link>
          <span>LIVE PAID TOKEN</span>
        </header>

        <section className="live-verification-block" aria-label="Live payment verification">
          <div className="live-checkmark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p>Payment confirmed</p>
            <strong>Exit token active</strong>
            <small>This animated mark should be moving during door clearance.</small>
          </div>
        </section>

        <section className="receipt-store">
          <p>Secure receipt</p>
          <h1>{merchant.name}</h1>
          <span>{location.name}{location.city ? ` - ${location.city}` : ''}</span>
          {location.address ? <small>{location.address}</small> : null}
        </section>

        <dl className="receipt-meta">
          <div><dt>Order</dt><dd>#{order.short_code}</dd></div>
          <div><dt>Paid</dt><dd>{formatDateTime(order.paid_at ?? order.created_at)}</dd></div>
          <div><dt>Status</dt><dd>{order.status.replaceAll('_', ' ')}</dd></div>
          <div><dt>UUID</dt><dd>{orderUuid}</dd></div>
        </dl>

        <section className="receipt-lines">
          {items.map((item) => (
            <div key={item.id}>
              <span><strong>{item.quantity}x {item.product_name}</strong><small>{formatNaira(item.unit_price_kobo)} each</small></span>
              <strong>{formatNaira(item.line_total_kobo)}</strong>
            </div>
          ))}
        </section>

        <section className="receipt-total">
          <span>Total paid</span>
          <strong>{formatNaira(order.total_kobo)}</strong>
        </section>

        <section className="purchase-barcode live-token-code">
          <p>Door clearance QR</p>
          <img
            src={`/api/barcode?type=qr&format=svg&text=${encodeURIComponent(orderUuid)}`}
            alt={`Secure order QR code ${orderUuid}`}
          />
          <strong>{orderUuid}</strong>
          <small>Fallback code: {order.purchase_code}</small>
        </section>

        <footer><span>Verified by Glide</span><span>Merchant counter parse token</span></footer>
      </article>
    </main>
  )
}
