import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PaystackCharge = {
  status?: string
  reference?: string
  amount?: number
  currency?: string
  paid_at?: string | null
}

type PaystackEvent = {
  event?: string
  data?: PaystackCharge
}

type PaystackVerification = {
  status: boolean
  data?: PaystackCharge
}

function hasValidSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const receivedBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  )
}

async function verifyTransaction(reference: string, secret: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    },
  )

  if (!response.ok) return null
  return (await response.json()) as PaystackVerification
}

export async function GET() {
  return NextResponse.json({
    service: 'Glide Paystack webhook',
    configured: Boolean(
      process.env.PAYSTACK_SECRET_KEY &&
        process.env.SUPABASE_SECRET_KEY &&
        process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
  })
}

export async function POST(request: Request) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY
  if (!paystackSecret || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 })
  }

  const signature = request.headers.get('x-paystack-signature')
  const rawBody = await request.text()

  if (!signature || !hasValidSignature(rawBody, signature, paystackSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload: PaystackEvent
  try {
    payload = JSON.parse(rawBody) as PaystackEvent
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  if (payload.event !== 'charge.success') {
    return NextResponse.json({ received: true })
  }

  const reference = payload.data?.reference
  if (!reference) {
    return NextResponse.json({ error: 'Payment reference is missing.' }, { status: 400 })
  }

  const verification = await verifyTransaction(reference, paystackSecret)
  const verifiedPayment = verification?.data

  if (
    !verification?.status ||
    verifiedPayment?.status !== 'success' ||
    verifiedPayment.reference !== reference
  ) {
    return NextResponse.json({ error: 'Transaction verification failed.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, merchant_id, status, total_kobo, currency')
    .eq('payment_reference', reference)
    .maybeSingle()

  if (orderError) {
    return NextResponse.json({ error: 'Order lookup failed.' }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ received: true, matched: false })
  }

  if (
    verifiedPayment.amount !== order.total_kobo ||
    verifiedPayment.currency !== order.currency
  ) {
    await supabase.from('order_events').insert({
      order_id: order.id,
      merchant_id: order.merchant_id,
      event_type: 'payment_mismatch',
      from_status: order.status,
      to_status: order.status,
      metadata: {
        reference,
        expected_amount: order.total_kobo,
        received_amount: verifiedPayment.amount,
        expected_currency: order.currency,
        received_currency: verifiedPayment.currency,
      },
    })
    return NextResponse.json({ error: 'Payment amount does not match.' }, { status: 400 })
  }

  if (['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  if (order.status !== 'pending_payment') {
    return NextResponse.json({ error: 'Order is not awaiting payment.' }, { status: 409 })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      paid_at: verifiedPayment.paid_at ?? new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'pending_payment')

  if (updateError) {
    return NextResponse.json({ error: 'Payment could not be applied.' }, { status: 500 })
  }

  return NextResponse.json({ received: true, matched: true })
}

