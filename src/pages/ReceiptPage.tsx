import { useEffect, useState } from 'react'
import { formatDateTime, formatNaira, orderPurchaseCode, orderShortCode } from '../lib/format'

type Receipt = {
  id: string
  status: string
  total_kobo: number
  paid_at: string | null
  created_at: string
  merchants: { name: string } | { name: string }[] | null
  store_locations: { name: string; city: string | null } | { name: string; city: string | null }[] | null
  order_items: { id: string; product_name: string; quantity: number; unit_price_kobo: number; line_total_kobo: number }[]
}

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function ReceiptPage({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/receipt?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Receipt not found.')
        setReceipt(result.order)
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Receipt not found.'))
  }, [token])

  if (error) return <main className="simple-page"><section><h1>{error}</h1></section></main>
  if (!receipt) return <main className="simple-page"><section><p>Loading receipt...</p></section></main>

  const merchant = one(receipt.merchants)
  const location = one(receipt.store_locations)

  return (
    <main className="receipt-live">
      <article>
        <header><a href="/">Glide</a><span>LIVE PAID TOKEN</span></header>
        <section className="live-mark"><i /><div><p>Payment confirmed</p><strong>Exit token active</strong><small>Animated mark should be moving during door clearance.</small></div></section>
        <section><p className="kicker">Secure receipt</p><h1>{merchant?.name ?? 'Store'}</h1><span>{location?.name}{location?.city ? ` - ${location.city}` : ''}</span></section>
        <dl><div><dt>Order</dt><dd>#{orderShortCode(receipt.id)}</dd></div><div><dt>Paid</dt><dd>{formatDateTime(receipt.paid_at ?? receipt.created_at)}</dd></div><div><dt>Status</dt><dd>{receipt.status}</dd></div></dl>
        <div className="receipt-lines">{receipt.order_items.map((item) => <div key={item.id}><span>{item.quantity}x {item.product_name}</span><strong>{formatNaira(item.line_total_kobo)}</strong></div>)}</div>
        <footer><span>Total paid</span><strong>{formatNaira(receipt.total_kobo)}</strong></footer>
        <section className="receipt-code"><img src={`/api/barcode?type=qr&format=svg&text=${encodeURIComponent(receipt.id)}`} alt="Receipt QR" /><strong>{receipt.id}</strong><small>{orderPurchaseCode(receipt.id)}</small></section>
      </article>
    </main>
  )
}
