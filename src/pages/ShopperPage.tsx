import { useEffect, useMemo, useRef, useState } from 'react'
import { formatNaira } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'

type QrContext = {
  code: string
  merchant_id: string
  location_id: string
  merchants: { name: string; slug: string } | { name: string; slug: string }[] | null
  store_locations: { name: string; city: string | null } | { name: string; city: string | null }[] | null
}

type Cart = Record<string, number>

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function ShopperPage({ qrCode }: { qrCode: string }) {
  const [qr, setQr] = useState<QrContext | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Cart>({})
  const [manual, setManual] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [view, setView] = useState<'splash' | 'scan' | 'cart'>('splash')
  const [message, setMessage] = useState('')
  const [camera, setCamera] = useState<'idle' | 'starting' | 'live' | 'blocked'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    void supabase
      .from('qr_codes')
      .select('code, merchant_id, location_id, merchants(name, slug), store_locations(name, city)')
      .eq('code', qrCode)
      .eq('status', 'active')
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data?.merchant_id) return
        setQr(data as unknown as QrContext)
        const { data: rows } = await supabase
          .from('products')
          .select('id, name, sku, barcode, category, price_kobo, is_available')
          .eq('merchant_id', data.merchant_id)
          .eq('is_available', true)
        setProducts((rows ?? []) as Product[])
      })
  }, [qrCode])

  useEffect(() => () => stopCamera(), [])

  const lines = useMemo(() => Object.entries(cart).map(([id, qty]) => {
    const product = products.find((item) => item.id === id)
    return product ? { product, quantity: qty, total: product.price_kobo * qty } : null
  }).filter(Boolean) as { product: Product; quantity: number; total: number }[], [cart, products])

  const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0)
  const totalKobo = lines.reduce((sum, line) => sum + line.total, 0)
  const merchant = one(qr?.merchants)
  const location = one(qr?.store_locations)

  function findProduct(value: string) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '')
    return products.find((product) =>
      product.id.toLowerCase() === normalized ||
      product.barcode?.toLowerCase().replace(/\s+/g, '') === normalized ||
      product.name.toLowerCase().replace(/\s+/g, '') === normalized,
    )
  }

  function openProduct(product: Product) {
    setSelected(product)
    setQuantity(cart[product.id] ?? 1)
    setManual('')
    setMessage('')
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    const product = findProduct(manual)
    if (!product) {
      setMessage('No live product matched that barcode.')
      return
    }
    openProduct(product)
  }

  function updateCart(productId: string, nextQuantity: number) {
    setCart((current) => {
      const next = { ...current }
      if (nextQuantity <= 0) delete next[productId]
      else next[productId] = nextQuantity
      return next
    })
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera((current) => current === 'live' || current === 'starting' ? 'idle' : current)
  }

  async function startCamera() {
    setMessage('')
    try {
      setCamera('starting')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamera('live')
    } catch {
      setCamera('blocked')
      setMessage('Camera access is required to scan. You can type the barcode instead.')
    }
  }

  async function checkout() {
    if (!qr || !lines.length) return
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode,
        sessionId: localStorage.getItem(`glide-session:${qrCode}`) || crypto.randomUUID(),
        items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      }),
    })
    const result = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null
    if (!response.ok || !result?.checkoutUrl) {
      setMessage(result?.error ?? 'Checkout could not be started.')
      return
    }
    window.location.href = result.checkoutUrl
  }

  if (!qr) return <main className="shopper"><section className="shop-card"><p>Opening store...</p></section></main>

  return (
    <main className="shopper">
      {view === 'splash' ? (
        <section className="shop-splash">
          <p>Welcome to {merchant?.name ?? 'this store'}</p>
          <h1>Jump the Queue</h1>
          <button className="button primary" onClick={() => setView('scan')}>Start Scanning</button>
          <small>{location?.name ?? 'In-store checkout'}</small>
        </section>
      ) : null}

      {view === 'scan' ? (
        <section className="shop-shell">
          <header><div><span>Glide basket</span><strong>{merchant?.name}</strong></div></header>
          <div className="camera-box">
            {camera === 'live' || camera === 'starting' ? <video ref={videoRef} playsInline muted /> : null}
            <div><span>{camera === 'live' ? 'Scanner live' : 'Camera access'}</span><strong>{camera === 'live' ? 'Scan barcode' : 'Allow camera usage'}</strong><small>Point at a product barcode.</small>{camera === 'live' ? <button onClick={stopCamera}>Stop camera</button> : <button onClick={() => void startCamera()}>{camera === 'starting' ? 'Opening...' : 'Allow Camera'}</button>}</div>
          </div>
          <form className="manual" onSubmit={submitManual}><label>Can&apos;t scan?</label><div><input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Type barcode" /><button>Add</button></div></form>
          {message ? <p className="notice">{message}</p> : null}
        </section>
      ) : null}

      {view === 'cart' ? (
        <section className="shop-shell">
          <header><button onClick={() => setView('scan')}>Back</button><strong>{totalItems} items</strong></header>
          <div className="cart-lines">
            {lines.map((line) => <article key={line.product.id}><div><strong>{line.product.name}</strong><span>{formatNaira(line.product.price_kobo)} each</span></div><div className="stepper"><button onClick={() => updateCart(line.product.id, line.quantity - 1)}>-</button><output>{line.quantity}</output><button onClick={() => updateCart(line.product.id, line.quantity + 1)}>+</button></div><strong>{formatNaira(line.total)}</strong></article>)}
            {!lines.length ? <p>No items scanned yet.</p> : null}
          </div>
          {message ? <p className="notice">{message}</p> : null}
          <button className="button primary wide" disabled={!lines.length} onClick={() => void checkout()}>Proceed to Checkout ({formatNaira(totalKobo)})</button>
        </section>
      ) : null}

      {selected ? (
        <div className="drawer">
          <section>
            <span>Scanned item</span>
            <h2>{selected.name}</h2>
            <strong>{formatNaira(selected.price_kobo)}</strong>
            <div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button><output>{quantity}</output><button onClick={() => setQuantity(quantity + 1)}>+</button></div>
            <button className="button primary wide" onClick={() => { updateCart(selected.id, quantity); setSelected(null) }}>Add to Cart</button>
          </section>
        </div>
      ) : null}

      {view !== 'splash' ? <button className="cart-bar" onClick={() => setView('cart')}><span>Cart ({totalItems} items)</span><strong>{formatNaira(totalKobo)}</strong></button> : null}
    </main>
  )
}
