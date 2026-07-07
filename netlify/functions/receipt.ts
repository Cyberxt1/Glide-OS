import type { Handler } from '@netlify/functions'
import { admin, json } from './_shared'

export const handler: Handler = async (event) => {
  const token = event.queryStringParameters?.token
  if (!token) return json(400, { error: 'Receipt token is missing.' })
  const { data: order, error } = await admin()
    .from('orders')
    .select('id, status, total_kobo, currency, paid_at, created_at, merchants(name), store_locations(name, city), order_items(id, product_name, quantity, unit_price_kobo, line_total_kobo)')
    .eq('id', token)
    .maybeSingle()
  if (error || !order || !['paid', 'preparing', 'ready_for_exit', 'exited', 'refunded'].includes(order.status)) {
    return json(404, { error: 'Receipt not found.' })
  }
  return json(200, { order })
}
