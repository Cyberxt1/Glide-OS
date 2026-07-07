import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { admin, json } from './_shared'

type PaystackCharge = { status?: string; reference?: string; amount?: number; currency?: string; paid_at?: string | null }
type PaystackEvent = { event?: string; data?: PaystackCharge }
type PaystackVerification = { status: boolean; data?: PaystackCharge }

function hasValidSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const received = Buffer.from(signature, 'utf8')
  const calculated = Buffer.from(expected, 'utf8')
  return received.length === calculated.length && timingSafeEqual(received, calculated)
}

async function verify(reference: string, secret: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (!response.ok) return null
  return (await response.json()) as PaystackVerification
}

export const handler: Handler = async (event) => {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(503, { error: 'Webhook is not configured.' })
  if (event.httpMethod === 'GET') return json(200, { service: 'Glide Paystack webhook', configured: true })

  const rawBody = event.body ?? ''
  const signature = event.headers['x-paystack-signature']
  if (!signature || !hasValidSignature(rawBody, signature, secret)) return json(401, { error: 'Invalid webhook signature.' })

  const payload = JSON.parse(rawBody) as PaystackEvent
  if (payload.event !== 'charge.success') return json(200, { received: true })
  const reference = payload.data?.reference
  if (!reference) return json(400, { error: 'Payment reference is missing.' })
  const verification = await verify(reference, secret)
  const payment = verification?.data
  if (!verification?.status || payment?.status !== 'success' || payment.reference !== reference) {
    return json(400, { error: 'Transaction verification failed.' })
  }

  const client = admin()
  const { data: order } = await client.from('orders').select('id, status, total_kobo, currency').eq('payment_reference', reference).maybeSingle()
  if (!order) return json(200, { received: true, matched: false })
  if (payment.amount !== order.total_kobo || payment.currency !== order.currency) return json(400, { error: 'Payment amount does not match.' })
  if (['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)) return json(200, { received: true, duplicate: true })
  const { error } = await client.from('orders').update({ status: 'paid', paid_at: payment.paid_at ?? new Date().toISOString() }).eq('id', order.id)
  if (error) return json(500, { error: error.message })
  return json(200, { received: true, matched: true })
}
