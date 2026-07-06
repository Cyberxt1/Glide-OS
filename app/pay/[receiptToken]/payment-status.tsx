'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type PaymentStatusProps = {
  cancelled: boolean
  receiptToken: string
  reference: string
}

type PaymentState = {
  merchantId: string | null
  qrCode: string | null
  receiptToken: string
  shortCode: string
  purchaseCode: string
  status: string
  receiptUrl: string | null
  returnUrl: string | null
}

const successfulStatuses = new Set(['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'])

export function PaymentStatus({ cancelled, receiptToken, reference }: PaymentStatusProps) {
  const [state, setState] = useState<PaymentState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let timer: number | null = null

    const poll = async () => {
      try {
        const params = new URLSearchParams()
        if (reference) params.set('reference', reference)

        const response = await fetch(`/api/checkout/${receiptToken}/status?${params.toString()}`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Payment status could not be loaded.')
        }

        const next = (await response.json()) as PaymentState
        if (!active) return
        setState(next)
        setError('')

        if (successfulStatuses.has(next.status)) {
          if (next.merchantId && next.qrCode) {
            localStorage.removeItem(`glide-cart:${next.merchantId}:${next.qrCode}`)
            localStorage.removeItem(`glide-session:${next.merchantId}:${next.qrCode}`)
          }
          return
        }

        timer = window.setTimeout(poll, 2500)
      } catch (caughtError) {
        if (!active) return
        setError(caughtError instanceof Error ? caughtError.message : 'Payment status could not be loaded.')
        timer = window.setTimeout(poll, 4000)
      }
    }

    void poll()

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [receiptToken, reference])

  const status = state?.status ?? 'pending_payment'
  const settled = successfulStatuses.has(status)

  return (
    <main className="payment-status-page">
      <section className="payment-status-card">
        <p className="payment-kicker">Payment status</p>
        <h1>
          {settled
            ? 'Payment confirmed.'
            : cancelled
              ? 'Payment cancelled.'
              : 'Waiting for confirmation.'}
        </h1>
        <p className="payment-copy">
          {settled
            ? `Order #${state?.shortCode ?? 'GLIDE'} is now verified. Your receipt and purchase barcode are ready.`
            : cancelled
              ? 'You left the payment flow before confirmation. Your cart stays on this device so you can try again.'
              : 'Glide is checking your payment and preparing your receipt.'}
        </p>

        {state ? (
          <dl className="payment-meta">
            <div><dt>Order</dt><dd>#{state.shortCode}</dd></div>
            <div><dt>Status</dt><dd>{state.status.replaceAll('_', ' ')}</dd></div>
            <div><dt>Purchase code</dt><dd>{state.purchaseCode}</dd></div>
          </dl>
        ) : null}

        {error ? <p className="payment-error">{error}</p> : null}

        <div className="payment-actions">
          {settled && state?.receiptUrl ? (
            <Link className="payment-primary" href={state.receiptUrl}>
              Open receipt
            </Link>
          ) : null}
          {state?.returnUrl ? (
            <Link className="payment-secondary" href={state.returnUrl}>
              Back to store
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  )
}
