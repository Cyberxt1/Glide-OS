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
    .select('short_code, purchase_code, status, total_kobo, currency, paid_at, created_at, merchants(name), store_locations(name, address, city), order_items(id, product_name, quantity, unit_price_kobo, line_total_kobo)')
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

  return (
    <main className="receipt-page">
      <ReceiptActions />
      <article className="receipt-paper">
        <header>
          <Link href="/" className="receipt-brand">Glide</Link>
          <span>PAID</span>
        </header>
        <section className="receipt-store">
          <p>Digital receipt</p>
          <h1>{merchant.name}</h1>
          <span>{location.name}{location.city ? ` · ${location.city}` : ''}</span>
          {location.address ? <small>{location.address}</small> : null}
        </section>
        <dl className="receipt-meta">
          <div><dt>Order</dt><dd>#{order.short_code}</dd></div>
          <div><dt>Paid</dt><dd>{formatDateTime(order.paid_at ?? order.created_at)}</dd></div>
        </dl>
        <section className="receipt-lines">
          {items.map((item) => (
            <div key={item.id}>
              <span><strong>{item.quantity}× {item.product_name}</strong><small>{formatNaira(item.unit_price_kobo)} each</small></span>
              <strong>{formatNaira(item.line_total_kobo)}</strong>
            </div>
          ))}
        </section>
        <section className="receipt-total"><span>Total paid</span><strong>{formatNaira(order.total_kobo)}</strong></section>
        <section className="purchase-barcode">
          <p>Show this barcode to the cashier</p>
          <img src={`/api/barcode?text=${encodeURIComponent(order.purchase_code)}`} alt={`Purchase barcode ${order.purchase_code}`} />
          <strong>{order.purchase_code}</strong>
        </section>
        <footer><span>Verified by Glide</span><span>Keep this receipt for your records</span></footer>
      </article>
    </main>
  )
}
