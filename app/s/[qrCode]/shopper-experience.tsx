'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
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

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>
}

type ViewState = 'splash' | 'loading' | 'dashboard'

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike
      getSupportedFormats?: () => Promise<string[]>
    }
  }
}

function normalizeBarcode(value: string) {
  return value.trim().replace(/\s+/g, '')
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
  const cartKey = `glide-cart:${merchantId}:${qrCode}`
  const cartOrderKey = `glide-cart-order:${merchantId}:${qrCode}`
  const sessionKey = `glide-session:${merchantId}:${qrCode}`
  const emailKey = `glide-email:${merchantId}:${qrCode}`
  const [view, setView] = useState<ViewState>(initialStarted ? 'dashboard' : 'splash')
  const [hydrated, setHydrated] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOrder, setCartOrder] = useState<string[]>([])
  const [customerEmail, setCustomerEmail] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [scanError, setScanError] = useState('')
  const [checkoutError, setCheckoutError] = useState(
    paymentCancelled ? 'Payment was cancelled. Your cart is still here.' : '',
  )
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scannerReady, setScannerReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const cartSectionRef = useRef<HTMLElement | null>(null)

  const shopperId = sessionId ? sessionId.replace(/-/g, '').slice(0, 8).toUpperCase() : '...'
  const orderedProductIds = [
    ...cartOrder.filter((productId) => cart[productId] > 0),
    ...Object.keys(cart).filter((productId) => cart[productId] > 0 && !cartOrder.includes(productId)),
  ]
  const cartLines: CartLine[] = orderedProductIds.map((productId) => ({
    productId,
    quantity: cart[productId],
  }))

  const enrichedCart = cartLines
    .map((line) => {
      const product = products.find((item) => item.id === line.productId)
      if (!product) return null
      return {
        ...line,
        product,
        total: product.priceKobo * line.quantity,
      }
    })
    .filter(Boolean) as Array<CartLine & { product: Product; total: number }>

  const totalItems = enrichedCart.reduce((sum, line) => sum + line.quantity, 0)
  const totalKobo = enrichedCart.reduce((sum, line) => sum + line.total, 0)
  const searchResults = searchQuery.trim()
    ? products
        .filter((product) => {
          const query = searchQuery.trim().toLowerCase()
          return (
            product.name.toLowerCase().includes(query) ||
            product.category?.toLowerCase().includes(query) ||
            product.barcode?.includes(query)
          )
        })
        .slice(0, 6)
    : []

  useEffect(() => {
    const existingSession = localStorage.getItem(sessionKey)
    const nextSession = existingSession || crypto.randomUUID()
    localStorage.setItem(sessionKey, nextSession)
    setSessionId(nextSession)

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
  }, [cartKey, cartOrderKey, emailKey, sessionKey])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(cartKey, JSON.stringify(cart))
    localStorage.setItem(cartOrderKey, JSON.stringify(cartOrder))
  }, [cart, cartKey, cartOrder, cartOrderKey, hydrated])

  useEffect(() => {
    if (!hydrated) return
    if (customerEmail) localStorage.setItem(emailKey, customerEmail)
  }, [customerEmail, emailKey, hydrated])

  useEffect(() => {
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
      }
    }
  }, [])

  useEffect(() => {
    if (!scannerOpen) return
    if (!window.BarcodeDetector) {
      setScannerError(
        'Camera barcode scanning is not supported on this device yet. Use search or barcode entry instead.',
      )
      return
    }

    let active = true

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })

        if (!active) {
          for (const track of stream.getTracks()) track.stop()
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setScannerReady(true)

        const Detector = window.BarcodeDetector
        if (!Detector) return
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        })

        const scanFrame = async () => {
          if (!videoRef.current || !active) return
          try {
            const results = await detector.detect(videoRef.current)
            const barcode = results[0]?.rawValue
            if (barcode && handleBarcode(barcode)) {
              stopScanner()
              return
            }
          } catch {
            setScannerError('Camera scanning could not read that barcode yet.')
          }

          frameRef.current = window.requestAnimationFrame(() => {
            void scanFrame()
          })
        }

        void scanFrame()
      } catch {
        setScannerError('Camera access was blocked, so Glide could not start the scanner.')
      }
    }

    void startScanner()

    return () => {
      active = false
    }
  }, [scannerOpen])

  function startSession() {
    setView('loading')
    window.setTimeout(() => {
      setView('dashboard')
    }, 650)
  }

  function stopScanner() {
    setScannerOpen(false)
    setScannerReady(false)
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
  }

  function findProductByBarcode(barcode: string) {
    const normalized = normalizeBarcode(barcode)
    return (
      products.find(
        (product) => product.barcode && normalizeBarcode(product.barcode) === normalized,
      ) ?? null
    )
  }

  function openProduct(product: Product) {
    setSelectedProduct(product)
    setSelectedQuantity(cart[product.id] ?? 1)
    setSearchQuery('')
    setScanError('')
    setView('dashboard')
  }

  function handleBarcode(barcode: string) {
    const product = findProductByBarcode(barcode)
    if (!product) {
      setScanError('That barcode does not match any live product in this store.')
      return false
    }

    openProduct(product)
    return true
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = searchQuery.trim()
    if (!normalized) return

    const matched = handleBarcode(normalized)
    if (matched) {
      setSearchQuery('')
      return
    }

    const firstResult = searchResults[0]
    if (firstResult) {
      openProduct(firstResult)
      return
    }

    setScanError('No matching item found in this store.')
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

  function applyProductSelection() {
    if (!selectedProduct) return
    updateCart(selectedProduct.id, selectedQuantity)
    setSelectedProduct(null)
  }

  function removeSelectedProduct() {
    if (!selectedProduct) return
    updateCart(selectedProduct.id, 0)
    setSelectedProduct(null)
  }

  function beginScanner() {
    setScannerError('')
    setScannerReady(false)
    setScannerOpen(true)
  }

  function endSession() {
    stopScanner()
    localStorage.removeItem(cartKey)
    localStorage.removeItem(cartOrderKey)
    localStorage.removeItem(sessionKey)
    localStorage.removeItem(emailKey)
    const freshSession = crypto.randomUUID()
    localStorage.setItem(sessionKey, freshSession)
    setSessionId(freshSession)
    setCart({})
    setCartOrder([])
    setCustomerEmail('')
    setSearchQuery('')
    setSelectedProduct(null)
    setSelectedQuantity(1)
    setCheckoutError('')
    setScanError('')
    setView('splash')
  }

  async function checkoutNow() {
    if (!totalItems) {
      setCheckoutError('Add at least one item to the cart before checkout.')
      return
    }

    if (!customerEmail.trim()) {
      setCheckoutError('Enter the customer email to receive the receipt.')
      cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    setCheckoutBusy(true)
    setCheckoutError('')

    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode,
        merchantId,
        locationId,
        customerEmail,
        sessionId,
        items: enrichedCart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | { checkoutUrl?: string; error?: string }
      | null

    if (!response.ok || !payload?.checkoutUrl) {
      setCheckoutBusy(false)
      setCheckoutError(payload?.error ?? 'Checkout could not be started.')
      return
    }

    startTransition(() => {
      window.location.href = payload.checkoutUrl as string
    })
  }

  return (
    <main className="scan-page shopper-page">
      {view === 'splash' ? (
        <section className="scan-shell shopper-shell splash-shell">
          <div className="shopper-splash refined">
            <span>Glide Self-Checkout</span>
            <h1>Welcome to {merchant.name}</h1>
            <p>Self Checkout Simplified</p>
            <button className="scan-primary splash-cta" type="button" onClick={startSession}>
              Start Session
            </button>
          </div>
        </section>
      ) : null}

      {view === 'loading' ? (
        <section className="scan-shell shopper-shell splash-shell">
          <div className="shopper-loading">
            <span />
            <h2>Opening Glide</h2>
            <p>Creating shopper {shopperId} for {merchant.name}.</p>
          </div>
        </section>
      ) : null}

      {view === 'dashboard' ? (
        <section className="scan-shell shopper-shell">
          <header className="shopper-topbar refined">
            <div className="shopper-title">
              <p className="scan-kicker">Welcome shopper {shopperId}</p>
              <strong>{merchant.name}</strong>
              <small>{location ? `${location.name}${location.city ? `, ${location.city}` : ''}` : 'Glide session'}</small>
            </div>
            <div className="shopper-total-card">
              <span>Total</span>
              <strong>{formatNaira(totalKobo)}</strong>
            </div>
          </header>

          <section className="shopper-dashboard refined">
            <section className="camera-stage refined">
              <div className="camera-frame live refined">
                {scannerOpen ? (
                  <>
                    <video ref={videoRef} playsInline muted />
                    <div className="camera-guide" />
                    <div className="camera-status">
                      <span>{scannerReady ? 'Scanner live' : 'Opening camera...'}</span>
                      <button type="button" onClick={stopScanner}>Stop</button>
                    </div>
                  </>
                ) : (
                  <div className="camera-idle refined">
                    <p className="scan-kicker">Scan camera</p>
                    <h2>Scan item barcode</h2>
                    <p>Point your camera at an item barcode.</p>
                    <button className="scan-primary compact" type="button" onClick={beginScanner}>
                      Open Camera
                    </button>
                  </div>
                )}
              </div>

              <form className="manual-scan-bar refined" onSubmit={submitSearch}>
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setScanError('')
                  }}
                  inputMode="search"
                  placeholder="Search Item"
                  autoComplete="off"
                />
                <button type="submit">Search</button>
              </form>

              {searchResults.length ? (
                <div className="search-results">
                  {searchResults.map((product) => (
                    <button key={product.id} type="button" onClick={() => openProduct(product)}>
                      <span>{product.category || 'Item'}</span>
                      <strong>{product.name}</strong>
                      <small>{formatNaira(product.priceKobo)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <div className="dashboard-actions">
              <button
                className="cart-chip wide"
                type="button"
                onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                View Cart
                <span>{totalItems}</span>
              </button>
              <button className="checkout-chip wide" type="button" disabled={!totalItems || checkoutBusy} onClick={() => void checkoutNow()}>
                {checkoutBusy ? 'Redirecting...' : 'Checkout'}
              </button>
            </div>

            <button className="session-end wide" type="button" onClick={endSession}>
              End Session
            </button>

            {scanError ? <p className="scan-feedback error">{scanError}</p> : null}
            {scannerError ? <p className="scan-feedback error">{scannerError}</p> : null}
            {checkoutError ? <p className="scan-feedback error">{checkoutError}</p> : null}

            <section className="cart-page-body embedded" ref={cartSectionRef}>
              <div className="cart-section-head">
                <div>
                  <p className="scan-kicker">Cart</p>
                  <h2>Items scanned</h2>
                </div>
                <strong>{totalItems}</strong>
              </div>

              <label className="cart-email-field">
                <span>Receipt email</span>
                <input
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  type="email"
                  placeholder="name@example.com"
                />
              </label>

              {enrichedCart.length ? (
                <div className="cart-page-lines">
                  {enrichedCart.map((line, index) => (
                    <article className="cart-page-line" key={line.product.id}>
                      <button className="cart-line-main" type="button" onClick={() => openProduct(line.product)}>
                        <span className="scan-order">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{line.product.name}</strong>
                          <span>{line.product.category || 'General merchandise'}</span>
                        </div>
                        <small>{formatNaira(line.product.priceKobo)} each</small>
                      </button>
                      <div className="cart-page-meta">
                        <span>{line.quantity} item{line.quantity === 1 ? '' : 's'}</span>
                        <strong>{formatNaira(line.total)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="scan-empty-state cart-empty">
                  <span>No items yet</span>
                  <p>Scanned items will appear here in order.</p>
                </div>
              )}

              <footer className="cart-page-footer">
                <div>
                  <span>Total</span>
                  <strong>{formatNaira(totalKobo)}</strong>
                </div>
                <button className="scan-primary full" type="button" disabled={!totalItems || checkoutBusy} onClick={() => void checkoutNow()}>
                  {checkoutBusy ? 'Redirecting...' : 'Pay Now'}
                </button>
              </footer>
            </section>
          </section>
        </section>
      ) : null}

      {selectedProduct ? (
        <div className="scanner-overlay">
          <div className="item-modal">
            <div className="item-modal-copy">
              <p className="scan-kicker">Selected item</p>
              <h2>{selectedProduct.name}</h2>
              <p>{selectedProduct.category || 'General merchandise'}</p>
              <strong>{formatNaira(selectedProduct.priceKobo)}</strong>
            </div>
            <div className="item-modal-actions">
              <div className="quantity-stepper large">
                <button type="button" onClick={() => setSelectedQuantity((current) => Math.max(1, current - 1))}>-</button>
                <span>{selectedQuantity}</span>
                <button type="button" onClick={() => setSelectedQuantity((current) => current + 1)}>+</button>
              </div>
              <button className="scan-primary full" type="button" onClick={applyProductSelection}>
                Update Cart
              </button>
              {(cart[selectedProduct.id] ?? 0) > 0 ? (
                <button className="modal-ghost danger" type="button" onClick={removeSelectedProduct}>
                  Remove from cart
                </button>
              ) : null}
              <button className="modal-ghost" type="button" onClick={() => setSelectedProduct(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
