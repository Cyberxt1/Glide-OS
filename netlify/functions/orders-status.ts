import type { Handler } from '@netlify/functions'
import { json, readJson, requireUser } from './_shared'

export const handler: Handler = async (event) => {
  const id = event.queryStringParameters?.id
  const body = await readJson<{ status?: string }>(event)
  if (!id || !body.status) return json(400, { error: 'Order and status are required.' })
  const user = await requireUser(event)
  const { admin } = await import('./_shared')
  const client = admin()
  const { data: order } = await client
    .from('orders')
    .select('id, merchant_id')
    .eq('id', id)
    .maybeSingle()

  if (!order) return json(404, { error: 'Order not found.' })
  const { data: merchant } = await client.from('merchants').select('owner_id').eq('id', order.merchant_id).maybeSingle()
  const { data: staffRows } = await client
    .from('merchant_staff')
    .select('user_id, roles, is_active')
    .eq('merchant_id', order.merchant_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
  const isOwner = merchant?.owner_id === user.id
  const isStaff = (staffRows ?? []).some((staff) => staff.roles?.includes('cashier') || staff.roles?.includes('security'))
  if (!order || (!isOwner && !isStaff)) return json(403, { error: 'This account cannot update that order.' })

  const allowed = ['paid', 'preparing', 'ready_for_exit', 'exited']
  if (!allowed.includes(body.status)) return json(400, { error: 'Unsupported order status.' })

  const patch: Record<string, string> = { status: body.status }
  if (body.status === 'paid') patch.paid_at = new Date().toISOString()
  const { error } = await client.from('orders').update(patch).eq('id', id)
  if (error) return json(500, { error: error.message })
  return json(200, { ok: true })
}
