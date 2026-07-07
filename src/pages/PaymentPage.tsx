import { useEffect, useState } from 'react'
import { navigate } from '../lib/route'

export function PaymentPage({ token }: { token: string }) {
  const [message, setMessage] = useState('Checking payment...')

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference') || params.get('trxref') || ''

    async function poll() {
      const response = await fetch(`/api/checkout-status?token=${encodeURIComponent(token)}&reference=${encodeURIComponent(reference)}`)
      const result = (await response.json().catch(() => null)) as { status?: string; receiptUrl?: string; error?: string } | null
      if (cancelled) return
      if (!response.ok) {
        setMessage(result?.error ?? 'Payment status could not be loaded.')
        window.setTimeout(poll, 3500)
        return
      }
      if (result?.receiptUrl) {
        navigate(result.receiptUrl)
        return
      }
      setMessage(`Payment status: ${result?.status ?? 'pending'}`)
      window.setTimeout(poll, 2500)
    }

    void poll()
    return () => { cancelled = true }
  }, [token])

  return <main className="simple-page"><section><p className="kicker">Payment status</p><h1>{message}</h1></section></main>
}
