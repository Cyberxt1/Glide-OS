import { randomBytes } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { json, readJson, requireMerchantAccess } from './_shared'

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<{ vendorId?: string }>(event)
    if (!body.vendorId) return json(400, { error: 'Store is required.' })
    const { client, merchant, user } = await requireMerchantAccess(event, body.vendorId, ['admin'])
    const { data: location } = await client.from('store_locations').select('id').eq('merchant_id', merchant.id).eq('is_active', true).limit(1).maybeSingle()
    if (!location) return json(400, { error: 'Create a store location before issuing a QR.' })
    const { data: existing } = await client.from('qr_codes').select('code').eq('merchant_id', merchant.id).eq('status', 'active').limit(1).maybeSingle()
    if (existing?.code) return json(200, { code: existing.code })
    const code = `qr_${randomBytes(9).toString('base64url')}`
    const { error } = await client.from('qr_codes').insert({
      code,
      merchant_id: merchant.id,
      location_id: location.id,
      status: 'active',
      activated_at: new Date().toISOString(),
      activated_by: user.id,
    })
    if (error) return json(500, { error: error.message })
    return json(200, { code })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'QR could not be created.' })
  }
}
