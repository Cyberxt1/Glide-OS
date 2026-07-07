import { randomBytes } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { admin, json, readJson } from './_shared'

type CheckoutItem = { productId?: string; quantity?: number }

function guestEmail(sessionId?: string) {
  const safe = (sessionId || randomBytes(6).toString('hex')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18)
  return `guest-${safe || randomBytes(6).toString('hex')}@glidecheckout.com`
}

async function initializePaystack(input: {
  email: string
  amount: number
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return { error: 'Payments are not configured yet.' }
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amount),
      currency: 'NGN',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.status || !result?.data?.authorization_url) {
    return { error: result?.message ?? 'Payment could not be started.' }
  }
  return { checkoutUrl: result.data.authorization_url as string }
}

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<{ qrCode?: string; sessionId?: string; items?: CheckoutItem[] }>(event)
    const qrCode = body.qrCode?.trim()
    const items = body.items ?? []
    if (!qrCode) return json(400, { error: 'This store QR is no longer active.' })
    if (!items.length) return json(400, { error: 'Add at least one item before checkout.' })

    const normalized = items.map((item) => ({
      productId: item.productId?.trim(),
      quantity: Number(item.quantity ?? 0),
    })).filter((item) => item.productId && Number.isInteger(item.quantity) && item.quantity > 0)
    if (normalized.length !== items.length) return json(400, { error: 'The cart contains an invalid item.' })

    const supabase = admin()
    const { data: qr } = await supabase.from('qr_codes').select('id, merchant_id, location_id').eq('code', qrCode).eq('status', 'active').maybeSingle()
    if (!qr?.merchant_id || !qr.location_id) return json(404, { error: 'This store QR is no longer active.' })

    const productIds = [...new Set(normalized.map((item) => item.productId as string))]
    const { data: products } = await supabase.from('products').select('id, name, price_kobo, tracks_inventory').eq('merchant_id', qr.merchant_id).eq('is_available', true).in('id', productIds)
    if (!products || products.length !== productIds.length) return json(409, { error: 'One selected item is no longer available.' })

    const stockByProduct = new Map<string, number>()
    const tracked = products.filter((product) => product.tracks_inventory).map((product) => product.id)
    if (tracked.length) {
      const { data: stock } = await supabase.from('location_inventory').select('product_id, quantity').eq('merchant_id', qr.merchant_id).eq('location_id', qr.location_id).in('product_id', tracked)
      for (const row of stock ?? []) stockByProduct.set(row.product_id, row.quantity)
    }

    const productMap = new Map(products.map((product) => [product.id, product]))
    const running = new Map<string, number>()
    const orderItems = normalized.map((item) => {
      const product = productMap.get(item.productId as string)
      if (!product) return null
      const nextQuantity = (running.get(product.id) ?? 0) + item.quantity
      running.set(product.id, nextQuantity)
      if (product.tracks_inventory && nextQuantity > (stockByProduct.get(product.id) ?? 0)) {
        throw new Error(`${product.name} does not have enough stock right now.`)
      }
      return {
        product_id: product.id,
        product_name: product.name,
        unit_price_kobo: product.price_kobo,
        quantity: item.quantity,
        line_total_kobo: product.price_kobo * item.quantity,
      }
    }).filter(Boolean) as { product_id: string; product_name: string; unit_price_kobo: number; quantity: number; line_total_kobo: number }[]

    const totalKobo = orderItems.reduce((sum, item) => sum + item.line_total_kobo, 0)
    const reference = `GLD_${Date.now()}_${randomBytes(4).toString('hex').toUpperCase()}`
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      merchant_id: qr.merchant_id,
      location_id: qr.location_id,
      qr_code_id: qr.id,
      payment_reference: reference,
      status: 'pending_payment',
      items: orderItems,
      total_kobo: totalKobo,
    }).select('id').single()
    if (orderError || !order) return json(500, { error: orderError?.message ?? 'The order could not be created.' })

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price_kobo: item.unit_price_kobo,
      quantity: item.quantity,
    })))
    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id)
      return json(500, { error: itemsError.message })
    }

    const origin = event.headers.origin || process.env.URL || 'http://localhost:3000'
    const callbackUrl = `${origin}/pay/${order.id}`
    const paystack = await initializePaystack({
      email: guestEmail(body.sessionId),
      amount: totalKobo,
      reference,
      callbackUrl,
      metadata: { glide_order_id: order.id, glide_session_id: body.sessionId ?? null },
    })
    if ('error' in paystack) return json(502, { error: paystack.error })

    return json(200, { checkoutUrl: paystack.checkoutUrl, orderId: order.id, receiptToken: order.id, reference })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Checkout failed.' })
  }
}
