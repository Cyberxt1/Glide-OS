'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatNaira, formatTime } from '@/lib/store/format'
import type { OperationalOrder } from '@/lib/store/types'

type OperationRole = 'cashier' | 'security'

function playArrivalTone() {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const gain = context.createGain()
  const oscillator = context.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(620, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(940, context.currentTime + 0.12)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.34)
}

export function OperationsBoard({
  merchantId,
  role,
  orders,
}: {
  merchantId: string
  role: OperationRole
  orders: OperationalOrder[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [verifiedCode, setVerifiedCode] = useState('')
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  const readyRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`store-operations-${merchantId}-${role}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const nextStatus = (payload.new as { status?: string } | null)?.status
          const relevant =
            role === 'cashier'
              ? nextStatus === 'paid'
              : nextStatus === 'ready_for_exit'

          if (readyRef.current && relevant) playArrivalTone()
          router.refresh()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') readyRef.current = true
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [merchantId, role, router])

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toUpperCase()
    if (!normalized) return orders
    return orders.filter(
      (order) =>
        order.short_code.includes(normalized) ||
        order.purchase_code.includes(normalized) ||
        order.exit_token?.includes(normalized),
    )
  }, [orders, query])

  function verifyScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = query.trim().toUpperCase()
    const matched = orders.find(
      (order) =>
        order.purchase_code === normalized ||
        order.short_code === normalized ||
        order.exit_token === normalized,
    )

    if (!matched) {
      setVerifiedCode('')
      setError('No paid order matches that barcode.')
      return
    }

    setVerifiedCode(matched.purchase_code)
    setQuery(role === 'cashier' ? matched.purchase_code : matched.exit_token ?? matched.short_code)
    setError('')
    playArrivalTone()
  }

  async function advanceOrder(orderId: string, status: string) {
    setPendingId(orderId)
    setError('')
    const response = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? 'The order could not be updated.')
      setPendingId('')
      return
    }

    setPendingId('')
    router.refresh()
  }

  return (
    <>
      <div className="operations-toolbar">
        <form onSubmit={verifyScan}>
          <label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v4M3 5h4M21 5h-4M21 5v4M3 19v-4M3 19h4M21 19h-4M21 19v-4M7 9v6M10 8v8M13 9v6M17 8v8" /></svg>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value.toUpperCase())
                setVerifiedCode('')
              }}
              placeholder={role === 'security' ? 'Scan or enter exit code' : 'Scan purchase barcode'}
              aria-label={role === 'security' ? 'Scan exit code' : 'Scan purchase barcode'}
              autoComplete="off"
              autoFocus
            />
          </label>
          <button type="submit">Verify</button>
        </form>
        <span><i /> Realtime listening</span>
      </div>

      {error ? <p className="operation-error">{error}</p> : null}

      {visibleOrders.length ? (
        <div className={`operations-grid ${role === 'security' ? 'security-grid' : ''}`}>
          {visibleOrders.map((order) => (
            <article className={`operation-order ${verifiedCode === order.purchase_code ? 'scan-verified' : ''}`} key={order.id}>
              <header>
                <span><small>{role === 'security' ? 'Exit code' : 'Paid order'}</small><strong>{role === 'security' ? order.exit_token : `#${order.short_code}`}</strong></span>
                <time>{formatTime(order.paid_at ?? order.created_at)}</time>
              </header>
              {role === 'cashier' && verifiedCode === order.purchase_code ? <p className="scan-confirmed"><span>✓</span> Purchase barcode verified</p> : null}

              {role === 'security' ? (
                <div className="verified-signal">
                  <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></span>
                  <strong>PAID &amp; VERIFIED</strong>
                  <small>Order #{order.short_code} · {formatNaira(order.total_kobo)}</small>
                </div>
              ) : (
                <div className="order-lines">
                  {order.order_items.map((item) => (
                    <div key={item.id}><strong>{item.quantity}×</strong><span>{item.product_name}</span></div>
                  ))}
                  {!order.order_items.length ? <p>Item detail is being synchronised.</p> : null}
                </div>
              )}

              <footer>
                {role === 'cashier' ? (
                  <>
                    <span><small>Total paid</small><strong>{formatNaira(order.total_kobo)}</strong></span>
                    <div className="order-actions"><a href={`/receipt/${order.receipt_token}`} target="_blank" rel="noreferrer">Receipt</a><button
                        type="button"
                        disabled={pendingId === order.id}
                        onClick={() =>
                          advanceOrder(
                            order.id,
                            order.status === 'paid' ? 'preparing' : 'ready_for_exit',
                          )
                        }
                      >
                        {pendingId === order.id
                          ? 'Updating…'
                          : order.status === 'paid'
                            ? 'Start packing'
                            : 'Ready for exit'}
                        <span>→</span>
                      </button></div>
                  </>
                ) : (
                  <button
                    className="confirm-exit"
                    type="button"
                    disabled={pendingId === order.id}
                    onClick={() => advanceOrder(order.id, 'exited')}
                  >
                    {pendingId === order.id ? 'Confirming…' : 'Confirm exit'}
                    <span>→</span>
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="operations-empty">
          <span className="empty-radar"><i /><i /><i /></span>
          <p>{query ? 'No matching order' : role === 'cashier' ? 'Waiting for a paid order' : 'The gate queue is clear'}</p>
          <small>{query ? 'Check the code and try again.' : 'New activity will arrive here automatically.'}</small>
        </div>
      )}
    </>
  )
}
