'use client'

import { startTransition, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatNaira } from '@/lib/store/format'

type Product = {
  id: string
  name: string
  category: string | null
  priceKobo: number
  barcode: string | null
}

type CartLine = {
  productId: string
  quantity: number
}

type CartEntry = CartLine & {
  product: Product
  lineTotalKobo: number
}

type ShopperStage = 'discovery' | 'dashboard' | 'cart' | 'checkout'

type ShopperExperienceProps = {
  qrCode: string
  merchantId: string
  locationId: string
  merchant: { name: string; slug: string }
  location: { name: string; city: string | null } | null
  products: Product[]
  initialStarted: boolean
  paymentCancelled: boolean
}

function createGuestSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest_${crypto.randomUUID()}`
  }

  return `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function pluralizeItems(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`
}

export function ShopperExperience({
  qrCode,
  merchantId,
  locationId,
  merchant,
  location,
  products,
  initialStarted,
  paymentCancelled,
}: ShopperExperienceProps) {
  const searchParams = useSearchParams()
  const vendorIdFromUrl = searchParams.get('vendor_id')?.trim() || merchantId
  const storageScope = `${vendorIdFromUrl}:${qrCode}`
  const cartKey = `glide-cart:${storageScope}`
  const cartOrderKey = `glide-cart-order:${storageScope}`
  const sessionKey = `glide-guest-session:${storageScope}`
  const emailKey = `glide-email:${storageScope}`

  const [stage, setStage] = useState<ShopperStage>(initialStarted ? 'dashboard' : 'discovery')
  const [hydrated, setHydrated] = useState(false)
  const [guestSessionId, setGuestSessionId] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOrder, setCartOrder] = useState<string[]>([])
  const [manualCode, setManualCode] = useState('')
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [activeQuantity, setActiveQuantity] = useState(1)
  const [customerEmail, setCustomerEmail] = useState('')
  const [scanNotice, setScanNotice] = useState('')
  const [checkoutError, setCheckoutError] = useState(
    paymentCancelled ? 'Payment was cancelled. Your staged cart is still ready.' : '',
  )
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  const cartEntries = useMemo<CartEntry[]>(() => {
    const orderedIds = [
      ...cartOrder.filter((productId) => cart[productId] > 0),
      ...Object.keys(cart).filter((productId) => cart[productId] > 0 && !cartOrder.includes(productId)),
    ]

    return orderedIds
      .map((productId) => {
        const product = productById.get(productId)
        const quantity = cart[productId] ?? 0
        if (!product || quantity <= 0) return null

        return {
          productId,
          quantity,
          product,
          lineTotalKobo: product.priceKobo * quantity,
        }
      })
      .filter(Boolean) as CartEntry[]
  }, [cart, cartOrder, productById])

  const totalItems = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0)
  const totalKobo = cartEntries.reduce((sum, entry) => sum + entry.lineTotalKobo, 0)
  const shortGuestId = guestSessionId ? guestSessionId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() : 'NEW'
  const storeLine = location ? `${location.name}${location.city ? `, ${location.city}` : ''}` : 'In-store session'

  useEffect(() => {
    if (stage !== 'dashboard' && stage !== 'cart' && stage !== 'checkout') return
    if (hydrated) return

    const existingSession = localStorage.getItem(sessionKey)
    const nextSession = existingSession || createGuestSessionId()
    localStorage.setItem(sessionKey, nextSession)
    setGuestSessionId(nextSession)

    const storedCart = localStorage.getItem(cartKey)
    if (storedCart) {
      try {
        setCart(JSON.parse(storedCart) as Record<string, number>)
      } catch {
        localStorage.removeItem(cartKey)
      }
    }

    const storedOrder = localStorage.getItem(cartOrderKey)
    if (storedOrder) {
      try {
        setCartOrder(JSON.parse(storedOrder) as string[])
      } catch {
        localStorage.removeItem(cartOrderKey)
      }
    }

    const storedEmail = localStorage.getItem(emailKey)
    if (storedEmail) setCustomerEmail(storedEmail)
    setHydrated(true)
  }, [cartKey, cartOrderKey, emailKey, hydrated, sessionKey, stage])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(cartKey, JSON.stringify(cart))
    localStorage.setItem(cartOrderKey, JSON.stringify(cartOrder))
  }, [cart, cartKey, cartOrder, cartOrderKey, hydrated])

  useEffect(() => {
    if (!hydrated) return
    if (customerEmail.trim()) localStorage.setItem(emailKey, customerEmail.trim())
  }, [customerEmail, emailKey, hydrated])

  function enterDashboard() {
    setStage('dashboard')
  }

  function findScannedProduct(value: string) {
    const normalized = normalizeLookup(value)
    if (!normalized) return null

    return (
      products.find((product) => {
        return (
          normalizeLookup(product.id) === normalized ||
          normalizeLookup(product.barcode ?? '') === normalized ||
          normalizeLookup(product.name) === normalized
        )
      }) ?? null
    )
  }

  function openScannedProduct(product: Product) {
    setActiveProduct(product)
    setActiveQuantity(cart[product.id] ?? 1)
    setManualCode('')
    setScanNotice('')
  }

  function simulateScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const product = findScannedProduct(manualCode)

    if (!product) {
      setScanNotice('No live product matched that mock product ID.')
      return
    }

    openScannedProduct(product)
  }

  function updateCart(productId: string, quantity: number) {
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[productId]
      else next[productId] = quantity
      return next
    })

    setCartOrder((current) => {
      if (quantity <= 0) return current.filter((id) => id !== productId)
      if (current.includes(productId)) return current
      return [...current, productId]
    })
  }

  function addActiveProductToCart() {
    if (!activeProduct) return
    updateCart(activeProduct.id, activeQuantity)
    setActiveProduct(null)
  }

  function clearCart() {
    setCart({})
    setCartOrder([])
    setCheckoutError('')
  }

  async function proceedToCheckout() {
    if (!totalItems) {
      setCheckoutError('Scan at least one item before checkout.')
      return
    }

    if (!customerEmail.trim()) {
      setCheckoutError('Enter an email so Paystack can issue the payment receipt.')
      return
    }

    setCheckoutBusy(true)
    setCheckoutError('')
    setStage('checkout')

    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode,
        merchantId,
        locationId,
        customerEmail: customerEmail.trim(),
        sessionId: guestSessionId,
        items: cartEntries.map((entry) => ({
          productId: entry.productId,
          quantity: entry.quantity,
        })),
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | { checkoutUrl?: string; error?: string }
      | null

    if (!response.ok || !payload?.checkoutUrl) {
      setCheckoutBusy(false)
      setStage('cart')
      setCheckoutError(payload?.error ?? 'Checkout could not be started.')
      return
    }

    startTransition(() => {
      window.location.href = payload.checkoutUrl as string
    })
  }

  return (
    <main className="queue-app">
      {stage === 'discovery' ? (
        <section className="queue-splash" aria-label="Discovery splash">
          <div className="queue-splash-top">
            <span>Glide guest session</span>
            <strong>{vendorIdFromUrl}</strong>
          </div>
          <div className="queue-splash-center">
            <p>Welcome to {merchant.name}</p>
            <h1>Skip the line.</h1>
            <button className="queue-jump-button" type="button" onClick={enterDashboard}>
              Jump the Queue
            </button>
          </div>
          <div className="queue-splash-bottom">
            <span>{storeLine}</span>
            <span>Secure basket opens on device</span>
          </div>
        </section>
      ) : null}

      {stage !== 'discovery' ? (
        <section className="queue-shell" aria-label="In-app scanning dashboard">
          <header className="queue-header">
            <div>
              <span>Guest {shortGuestId}</span>
              <strong>{merchant.name}</strong>
              <small>{storeLine}</small>
            </div>
            <button className="queue-header-total" type="button" onClick={() => setStage('cart')}>
              <span>Total</span>
              <strong>{formatNaira(totalKobo)}</strong>
            </button>
          </header>

          {stage === 'dashboard' || stage === 'checkout' ? (
            <div className="queue-dashboard">
              <section className="queue-camera-module">
                <div className="queue-camera-view" aria-label="Barcode scanner placeholder">
                  <div className="queue-camera-grid" />
                  <div className="queue-camera-frame">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="queue-camera-copy">
                    <span>In-browser scanner</span>
                    <strong>Camera view ready</strong>
                    <small>Point at a product barcode to stage an item.</small>
                  </div>
                </div>

                <form className="queue-manual-scan" onSubmit={simulateScan}>
                  <label htmlFor="mock-product-id">Manual simulation</label>
                  <div>
                    <input
                      id="mock-product-id"
                      value={manualCode}
                      onChange={(event) => {
                        setManualCode(event.target.value)
                        setScanNotice('')
                      }}
                      placeholder="Type mock product ID or barcode"
                      autoComplete="off"
                    />
                    <button type="submit">Simulate</button>
                  </div>
                </form>

                {scanNotice ? <p className="queue-alert">{scanNotice}</p> : null}

                <div className="queue-product-shortcuts">
                  {products.slice(0, 4).map((product) => (
                    <button key={product.id} type="button" onClick={() => openScannedProduct(product)}>
                      <span>{product.category || 'Item'}</span>
                      <strong>{product.name}</strong>
                      <small>{formatNaira(product.priceKobo)}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {stage === 'cart' ? (
            <section className="queue-cart-view" aria-label="Expanded cart">
              <div className="queue-cart-head">
                <button type="button" onClick={() => setStage('dashboard')}>
                  Back to scanner
                </button>
                <div>
                  <span>Staged basket</span>
                  <strong>{pluralizeItems(totalItems)}</strong>
                </div>
              </div>

              <div className="queue-cart-list">
                {cartEntries.length ? (
                  cartEntries.map((entry) => (
                    <article className="queue-cart-line" key={entry.productId}>
                      <div>
                        <span>{entry.product.category || 'Product'}</span>
                        <strong>{entry.product.name}</strong>
                        <small>{formatNaira(entry.product.priceKobo)} each</small>
                      </div>
                      <div className="queue-line-controls">
                        <button type="button" onClick={() => updateCart(entry.productId, entry.quantity - 1)}>
                          -
                        </button>
                        <output>{entry.quantity}</output>
                        <button type="button" onClick={() => updateCart(entry.productId, entry.quantity + 1)}>
                          +
                        </button>
                      </div>
                      <strong>{formatNaira(entry.lineTotalKobo)}</strong>
                      <button className="queue-remove-line" type="button" onClick={() => updateCart(entry.productId, 0)}>
                        Remove
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="queue-empty-cart">
                    <strong>No staged items</strong>
                    <span>Scanned products appear here instantly.</span>
                  </div>
                )}
              </div>

              <label className="queue-email-field" htmlFor="queue-customer-email">
                <span>Receipt email</span>
                <input
                  id="queue-customer-email"
                  value={customerEmail}
                  onChange={(event) => {
                    setCustomerEmail(event.target.value)
                    setCheckoutError('')
                  }}
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </label>

              {checkoutError ? <p className="queue-alert">{checkoutError}</p> : null}

              <div className="queue-cart-actions">
                <button type="button" onClick={clearCart} disabled={!totalItems || checkoutBusy}>
                  Clear
                </button>
                <button
                  className="queue-checkout-button"
                  type="button"
                  disabled={!totalItems || checkoutBusy}
                  onClick={() => void proceedToCheckout()}
                >
                  {checkoutBusy ? 'Opening Paystack...' : `Proceed to Checkout (${formatNaira(totalKobo)})`}
                </button>
              </div>
            </section>
          ) : null}

          {activeProduct ? (
            <div className="queue-product-drawer" role="dialog" aria-modal="true" aria-label="Scanned product">
              <button className="queue-drawer-scrim" type="button" onClick={() => setActiveProduct(null)} />
              <section className="queue-drawer-panel">
                <div>
                  <span>Scanned item</span>
                  <h2>{activeProduct.name}</h2>
                  <p>{activeProduct.category || 'General product'}</p>
                  <strong>{formatNaira(activeProduct.priceKobo)}</strong>
                </div>
                <div className="queue-drawer-controls">
                  <button type="button" onClick={() => setActiveQuantity((current) => Math.max(1, current - 1))}>
                    -
                  </button>
                  <output>{activeQuantity}</output>
                  <button type="button" onClick={() => setActiveQuantity((current) => current + 1)}>
                    +
                  </button>
                </div>
                <button className="queue-add-button" type="button" onClick={addActiveProductToCart}>
                  Add to Cart
                </button>
              </section>
            </div>
          ) : null}

          <button className="queue-running-footer" type="button" onClick={() => setStage('cart')}>
            <span>Cart ({pluralizeItems(totalItems)})</span>
            <strong>{formatNaira(totalKobo)}</strong>
          </button>
        </section>
      ) : null}
    </main>
  )
}
