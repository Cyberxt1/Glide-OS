import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { initializeTransaction } from '@/lib/paystack'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckoutItemInput = {
  productId?: string
  quantity?: number
}

type CheckoutPayload = {
  qrCode?: string
  customerEmail?: string
  sessionId?: string
  items?: CheckoutItemInput[]
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CheckoutPayload | null
  const qrCode = body?.qrCode?.trim()
  const customerEmail = body?.customerEmail?.trim().toLowerCase()
  const items = body?.items ?? []

  if (!qrCode || !customerEmail || !isValidEmail(customerEmail)) {
    return NextResponse.json({ error: 'A valid customer email is required.' }, { status: 400 })
  }

  if (!items.length) {
    return NextResponse.json({ error: 'Add at least one item before checkout.' }, { status: 400 })
  }

  const normalizedItems = items
    .map((item) => ({
      productId: item.productId?.trim(),
      quantity: Number(item.quantity ?? 0),
    }))
    .filter((item) => item.productId && Number.isInteger(item.quantity) && item.quantity > 0)

  if (!normalizedItems.length || normalizedItems.length !== items.length) {
    return NextResponse.json({ error: 'The cart contains an invalid item.' }, { status: 400 })
  }

  const productIds = [...new Set(normalizedItems.map((item) => item.productId as string))]
  const supabase = createAdminClient()
  const { data: qr } = await supabase
    .from('qr_codes')
    .select('id, merchant_id, location_id')
    .eq('code', qrCode)
    .eq('status', 'active')
    .maybeSingle()

  if (!qr?.merchant_id || !qr.location_id) {
    return NextResponse.json({ error: 'This store QR is no longer active.' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_kobo, barcode, tracks_inventory, is_available')
    .eq('merchant_id', qr.merchant_id)
    .eq('is_available', true)
    .in('id', productIds)

  if (!products || products.length !== productIds.length) {
    return NextResponse.json({ error: 'One of the selected items is no longer available.' }, { status: 409 })
  }

  const trackedIds = products.filter((product) => product.tracks_inventory).map((product) => product.id)
  const inventoryByProduct = new Map<string, number>()

  if (trackedIds.length) {
    const { data: stockRows } = await supabase
      .from('location_inventory')
      .select('product_id, quantity')
      .eq('merchant_id', qr.merchant_id)
      .eq('location_id', qr.location_id)
      .in('product_id', trackedIds)

    for (const row of stockRows ?? []) {
      inventoryByProduct.set(row.product_id, row.quantity)
    }
  }

  const productMap = new Map(products.map((product) => [product.id, product]))
  const quantities = new Map<string, number>()
  const orderItems = normalizedItems.map((item) => {
    const product = productMap.get(item.productId as string)
    if (!product) return null

    const runningQuantity = (quantities.get(product.id) ?? 0) + item.quantity
    quantities.set(product.id, runningQuantity)

    if (product.tracks_inventory) {
      const available = inventoryByProduct.get(product.id) ?? 0
      if (runningQuantity > available) {
        return { error: `${product.name} does not have enough stock right now.` }
      }
    }

    return {
      product_id: product.id,
      product_name: product.name,
      unit_price_kobo: product.price_kobo,
      quantity: item.quantity,
      line_total_kobo: product.price_kobo * item.quantity,
    }
  })

  const stockError = orderItems.find((item) => item && 'error' in item)
  if (stockError && 'error' in stockError) {
    return NextResponse.json({ error: stockError.error }, { status: 409 })
  }

  const cleanOrderItems = orderItems.filter(Boolean) as {
    product_id: string
    product_name: string
    unit_price_kobo: number
    quantity: number
    line_total_kobo: number
  }[]

  const totalKobo = cleanOrderItems.reduce((sum, item) => sum + item.line_total_kobo, 0)
  const reference = `GLD_${Date.now()}_${randomBytes(4).toString('hex').toUpperCase()}`
  const requestUrl = new URL(request.url)

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      merchant_id: qr.merchant_id,
      location_id: qr.location_id,
      qr_code_id: qr.id,
      customer_email: customerEmail,
      payment_reference: reference,
      status: 'pending_payment',
      items: cleanOrderItems,
      total_kobo: totalKobo,
    })
    .select('id, receipt_token')
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'The order could not be created.' }, { status: 500 })
  }

  const { error: itemsError } = await supabase.from('order_items').insert(
    cleanOrderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price_kobo: item.unit_price_kobo,
      quantity: item.quantity,
    })),
  )

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: 'The order items could not be saved.' }, { status: 500 })
  }

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY
  if (!paystackSecret) {
    await supabase
      .from('orders')
      .update({ status: 'payment_failed' })
      .eq('id', order.id)
      .eq('status', 'pending_payment')

    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
  }

  const returnUrl = new URL(`/pay/${order.receipt_token}`, requestUrl).toString()
  const initialization = await initializeTransaction({
    secret: paystackSecret,
    email: customerEmail,
    amount: totalKobo,
    reference,
    callbackUrl: returnUrl,
    metadata: {
      cancel_action: `${returnUrl}?cancelled=1`,
      glide_receipt_token: order.receipt_token,
      glide_session_id: body?.sessionId ?? null,
    },
  })

  const checkoutUrl = initialization?.data?.authorization_url
  if (!initialization?.status || !checkoutUrl) {
    await supabase
      .from('orders')
      .update({ status: 'payment_failed' })
      .eq('id', order.id)
      .eq('status', 'pending_payment')

    return NextResponse.json({ error: 'Payment could not be started.' }, { status: 502 })
  }

  return NextResponse.json({
    checkoutUrl,
    orderId: order.id,
    receiptToken: order.receipt_token,
    reference,
  })
}
