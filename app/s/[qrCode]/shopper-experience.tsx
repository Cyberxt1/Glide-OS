'use client'

import Link from 'next/link'
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
  const sessionKey = `glide-session:${merchantId}:${qrCode}`
  const emailKey = `glide-email:${merchantId}:${qrCode}`
  const [started, setStarted] = useState(initialStarted)
  const [hydrated, setHydrated] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [customerEmail, setCustomerEmail] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [cartOpen, setCartOpen] = useState(false)
  const [scanError, setScanError] = useState('')
  const [checkoutError, setCheckoutError] = useState(paymentCancelled ? 'Payment was cancelled. Your cart is still here.' : '')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scannerReady, setScannerReady] = useState(false)
  const [cartPulse, setCartPulse] = useState(false)
  const [lastAddedId, setLastAddedId] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const cartLines: CartLine[] = Object.entries(cart).map(([productId, quantity]) => ({
    productId,
    quantity,
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

    const storedEmail = localStorage.getItem(emailKey)
    if (storedEmail) setCustomerEmail(storedEmail)
    setHydrated(true)
  }, [cartKey, emailKey, sessionKey])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(cartKey, JSON.stringify(cart))
  }, [cart, cartKey, hydrated])

  useEffect(() => {
    if (!hydrated) return
    if (customerEmail) localStorage.setItem(emailKey, customerEmail)
  }, [customerEmail, emailKey, hydrated])

  useEffect(() => {
    if (!cartPulse) return
    const timer = window.setTimeout(() => setCartPulse(false), 360)
    return () => window.clearTimeout(timer)
  }, [cartPulse])

  useEffect(() => {
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
      }
    }
  }, [])

  function findProductByBarcode(barcode: string) {
    const normalized = normalizeBarcode(barcode)
    return products.find((product) => product.barcode && normalizeBarcode(product.barcode) === normalized) ?? null
  }

  function openScannedProduct(product: Product) {
    setSelectedProduct(product)
    setSelectedQuantity(1)
    setScanError('')
    setStarted(true)
  }

  function handleBarcode(barcode: string) {
    const product = findProductByBarcode(barcode)
    if (!product) {
      setScanError('That barcode does not match any live product in this store.')
      return false
    }

    openScannedProduct(product)
    return true
  }

  function submitBarcode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const matched = handleBarcode(barcodeInput)
    if (matched) setBarcodeInput('')
  }

  function updateCart(productId: string, quantity: number) {
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[productId]
      else next[productId] = quantity
      return next
    })
  }

  function addSelectionToCart() {
    if (!selectedProduct) return
    const nextQuantity = (cart[selectedProduct.id] ?? 0) + selectedQuantity
    updateCart(selectedProduct.id, nextQuantity)
    setCartPulse(true)
    setLastAddedId(selectedProduct.id)
    setCartOpen(true)
  }

  useEffect(() => {
    if (!scannerOpen) return
    if (!window.BarcodeDetector) {
      setScannerError('Camera barcode scanning is not supported on this device yet. Use the barcode input instead.')
      setScannerOpen(false)
      return
    }

    let active = true

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
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
        if (!Detector) {
          setScannerError('Camera barcode scanning is not supported on this device yet. Use the barcode input instead.')
          closeScanner()
          return
        }

        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        const scanFrame = async () => {
          if (!videoRef.current || !active) return
          try {
            const results = await detector.detect(videoRef.current)
            const barcode = results[0]?.rawValue
            if (barcode && handleBarcode(barcode)) {
              closeScanner()
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

  function beginScanner() {
    setScannerError('')
    setScannerReady(false)
    setScannerOpen(true)
  }

  function closeScanner() {
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

  async function checkoutNow() {
    if (!totalItems) {
      setCheckoutError('Add at least one item to the cart before checkout.')
      return
    }

    if (!customerEmail.trim()) {
      setCheckoutError('Enter the customer email to receive the receipt.')
      setCartOpen(true)
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

    const payload = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null
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
      <section className="scan-shell">
        <header className={`shopper-topbar ${cartPulse ? 'cart-pulse' : ''}`}>
          <button className="shopper-store" type="button" onClick={() => setStarted(false)}>
            <span className="scan-kicker">Now shopping</span>
            <strong>{merchant.name}</strong>
            <small>{location ? `${location.name}${location.city ? `, ${location.city}` : ''}` : 'Glide store'}</small>
          </button>

          <div className="shopper-top-actions">
            <div className="shopper-total">
              <span>Running total</span>
              <strong>{formatNaira(totalKobo)}</strong>
            </div>
            <button className={`cart-chip ${cartPulse ? 'is-bouncing' : ''}`} type="button" onClick={() => setCartOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2.1 9.2a1 1 0 0 0 1 .8h7.7a1 1 0 0 0 1-.8L20 8H8" /><circle cx="10" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>
              <span>{totalItems}</span>
            </button>
            <button className="checkout-chip" type="button" disabled={!totalItems || checkoutBusy} onClick={() => {
              setCartOpen(true)
              void checkoutNow()
            }}>
              {checkoutBusy ? 'Redirecting...' : 'Checkout now'}
            </button>
          </div>
        </header>

        {!started ? (
          <div className="scan-welcome">
            <p className="scan-kicker">Welcome to Glide</p>
            <h1>Skip the queue. Start from where you stand.</h1>
            <p className="scan-copy">
              You are now shopping at {merchant.name}
              {location ? ` - ${location.name}${location.city ? `, ${location.city}` : ''}` : ''}.
            </p>
            <div className="scan-actions">
              <button className="scan-primary" type="button" onClick={() => setStarted(true)}>
                Start Self-Checkout
              </button>
            </div>
          </div>
        ) : (
          <section className="shopper-stage">
            <div className="scan-console">
              <div className="scan-console-copy">
                <p className="scan-kicker">Store session live</p>
                <h1>Scan what you want.</h1>
                <p>Use the camera scanner or type the product barcode. Each scan pulls the live store price directly from Glide.</p>
              </div>

              <div className="scan-console-actions">
                <button className="scan-primary" type="button" onClick={() => void beginScanner()}>
                  Scan item
                </button>
                <form className="barcode-form" onSubmit={submitBarcode}>
                  <label>
                    <span>Barcode</span>
                    <input
                      value={barcodeInput}
                      onChange={(event) => setBarcodeInput(event.target.value)}
                      inputMode="numeric"
                      placeholder="Type or scan product barcode"
                      autoComplete="off"
                    />
                  </label>
                  <button type="submit">Find item</button>
                </form>
              </div>
            </div>

            {scanError ? <p className="scan-feedback error">{scanError}</p> : null}
            {checkoutError ? <p className="scan-feedback error">{checkoutError}</p> : null}

            {selectedProduct ? (
              <section className={`scan-hit-card ${lastAddedId === selectedProduct.id ? 'is-added' : ''}`}>
                <div>
                  <p className="scan-kicker">Scanned item</p>
                  <h2>{selectedProduct.name}</h2>
                  <p>{selectedProduct.category || 'General merchandise'}</p>
                </div>
                <div className="scan-hit-actions">
                  <strong>{formatNaira(selectedProduct.priceKobo)}</strong>
                  <div className="quantity-stepper">
                    <button type="button" onClick={() => setSelectedQuantity((current) => Math.max(1, current - 1))}>-</button>
                    <span>{selectedQuantity}</span>
                    <button type="button" onClick={() => setSelectedQuantity((current) => current + 1)}>+</button>
                  </div>
                  <button className="scan-primary compact" type="button" onClick={addSelectionToCart}>
                    Add to cart
                  </button>
                </div>
              </section>
            ) : (
              <section className="scan-empty-state">
                <span>Ready for the first scan</span>
                <p>Point the camera at a product barcode or enter the digits manually.</p>
              </section>
            )}

            <section className="catalog-strip">
              <div className="scan-surface-head">
                <strong>{products.length} live products</strong>
                <span>Tap any product to add it manually</span>
              </div>
              <div className="catalog-grid">
                {products.map((product) => (
                  <button className="catalog-card" key={product.id} type="button" onClick={() => openScannedProduct(product)}>
                    <span>{product.category || 'General'}</span>
                    <strong>{product.name}</strong>
                    <small>{formatNaira(product.priceKobo)}</small>
                  </button>
                ))}
              </div>
            </section>
          </section>
        )}
      </section>

      {scannerOpen ? (
        <div className="scanner-overlay">
          <div className="scanner-card">
            <div className="scanner-head">
              <div>
                <p className="scan-kicker">Camera scanner</p>
                <strong>{scannerReady ? 'Align the barcode inside the frame.' : 'Starting camera...'}</strong>
              </div>
              <button type="button" onClick={closeScanner}>Close</button>
            </div>
            <div className="scanner-frame">
              <video ref={videoRef} playsInline muted />
              <div className="scanner-target" />
            </div>
            {scannerError ? <p className="scan-feedback error">{scannerError}</p> : null}
          </div>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="cart-overlay">
          <aside className="cart-panel">
            <header>
              <div>
                <p className="scan-kicker">Your cart</p>
                <h2>{totalItems} item{totalItems === 1 ? '' : 's'}</h2>
              </div>
              <button type="button" onClick={() => setCartOpen(false)}>Close</button>
            </header>

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
              <div className="cart-lines">
                {enrichedCart.map((line) => (
                  <article className="cart-line" key={line.product.id}>
                    <div>
                      <strong>{line.product.name}</strong>
                      <span>{formatNaira(line.product.priceKobo)} each</span>
                    </div>
                    <div className="cart-line-actions">
                      <div className="quantity-stepper">
                        <button type="button" onClick={() => updateCart(line.product.id, line.quantity - 1)}>-</button>
                        <span>{line.quantity}</span>
                        <button type="button" onClick={() => updateCart(line.product.id, line.quantity + 1)}>+</button>
                      </div>
                      <strong>{formatNaira(line.total)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="scan-empty-state cart-empty">
                <span>No items yet</span>
                <p>Scan a product or tap one from the live catalog to start building the cart.</p>
              </div>
            )}

            <footer className="cart-footer">
              <div>
                <span>Total</span>
                <strong>{formatNaira(totalKobo)}</strong>
              </div>
              <button className="scan-primary" type="button" disabled={!totalItems || checkoutBusy} onClick={() => void checkoutNow()}>
                {checkoutBusy ? 'Redirecting...' : 'Pay now'}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </main>
  )
}
