import { NextResponse } from 'next/server'
import { verifyTransaction } from '@/lib/paystack'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptToken: string }> },
) {
  const { receiptToken } = await params
  const url = new URL(request.url)
  const reference = url.searchParams.get('reference')?.trim()
  const supabase = createAdminClient()

  const fetchOrder = async () =>
    supabase
      .from('orders')
      .select(`
        id,
        merchant_id,
        qr_code_id,
        payment_reference,
        status,
        total_kobo,
        currency,
        paid_at,
        qr_codes(code)
      `)
      .eq('id', receiptToken)
      .maybeSingle()

  let { data: order } = await fetchOrder()
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (
    order.status === 'pending_payment' &&
    reference &&
    order.payment_reference === reference &&
    process.env.PAYSTACK_SECRET_KEY
  ) {
    const verification = await verifyTransaction(reference, process.env.PAYSTACK_SECRET_KEY)
    const verifiedPayment = verification?.data

    if (
      verification?.status &&
      verifiedPayment?.status === 'success' &&
      verifiedPayment.reference === reference &&
      verifiedPayment.amount === order.total_kobo &&
      verifiedPayment.currency === order.currency
    ) {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: verifiedPayment.paid_at ?? new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'pending_payment')

      const refreshed = await fetchOrder()
      order = refreshed.data ?? order
    }
  }

  const qrValue = order.qr_codes as unknown as { code: string } | { code: string }[] | null
  const qrCode = Array.isArray(qrValue) ? qrValue[0]?.code : qrValue?.code

  return NextResponse.json({
    id: order.id,
    merchantId: order.merchant_id,
    qrCode,
    receiptToken: order.id,
    shortCode: order.id.replaceAll('-', '').slice(0, 6).toUpperCase(),
    purchaseCode: `GLD-${order.id.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
    status: order.status,
    paidAt: order.paid_at,
    totalKobo: order.total_kobo,
    receiptUrl:
      ['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)
        ? `/receipt/${order.id}`
        : null,
    returnUrl: qrCode ? `/s/${qrCode}?start=1` : null,
  })
}
