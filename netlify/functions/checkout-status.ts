import type { Handler } from '@netlify/functions'
import { admin, json, orderPurchaseCode, orderShortCode } from './_shared'

async function verify(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return null
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (!response.ok) return null
  return response.json() as Promise<{ status: boolean; data?: { status?: string; amount?: number; currency?: string; reference?: string; paid_at?: string } }>
}

export const handler: Handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token
    const reference = event.queryStringParameters?.reference
    if (!token) return json(400, { error: 'Order token is missing.' })
    const supabase = admin()
    const fetchOrder = () => supabase.from('orders').select('id, merchant_id, payment_reference, status, total_kobo, currency, paid_at, qr_codes(code)').eq('id', token).maybeSingle()
    let { data: order } = await fetchOrder()
    if (!order) return json(404, { error: 'Order not found.' })

    if (order.status === 'pending_payment' && reference && reference === order.payment_reference) {
      const verified = await verify(reference)
      const payment = verified?.data
      if (verified?.status && payment?.status === 'success' && payment.amount === order.total_kobo && payment.currency === order.currency) {
        await supabase.from('orders').update({ status: 'paid', paid_at: payment.paid_at ?? new Date().toISOString() }).eq('id', order.id).eq('status', 'pending_payment')
        order = (await fetchOrder()).data ?? order
      }
    }

    const qrValue = order.qr_codes as unknown as { code: string } | { code: string }[] | null
    const qrCode = Array.isArray(qrValue) ? qrValue[0]?.code : qrValue?.code
    const paid = ['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)
    return json(200, {
      id: order.id,
      merchantId: order.merchant_id,
      qrCode,
      receiptToken: order.id,
      shortCode: orderShortCode(order.id),
      purchaseCode: orderPurchaseCode(order.id),
      status: order.status,
      paidAt: order.paid_at,
      totalKobo: order.total_kobo,
      receiptUrl: paid ? `/receipt/${order.id}` : null,
      returnUrl: qrCode ? `/s/${qrCode}?start=1` : null,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Payment status failed.' })
  }
}
