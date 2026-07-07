import { randomBytes } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { isEmail, json, readJson, requireMerchantAccess } from './_shared'

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<{ vendorId?: string; displayName?: string; email?: string; password?: string; roles?: string[] }>(event)
    if (!body.vendorId) return json(400, { error: 'Store is required.' })
    const displayName = String(body.displayName ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const roles = (body.roles ?? []).filter((role) => role === 'cashier' || role === 'security')
    if (!displayName || !isEmail(email) || password.length < 8 || !roles.length) return json(400, { error: 'Enter a name, valid email, password, and at least one role.' })
    const { client, merchant } = await requireMerchantAccess(event, body.vendorId, ['admin'])
    const { data: location } = await client.from('store_locations').select('id').eq('merchant_id', merchant.id).eq('is_active', true).limit(1).maybeSingle()
    const { data: authData, error: authError } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
    if (authError || !authData.user) return json(409, { error: authError?.message ?? 'Account could not be created.' })
    const { error: staffError } = await client.from('merchant_staff').insert({
      merchant_id: merchant.id,
      location_id: location?.id ?? null,
      user_id: authData.user.id,
      display_name: displayName,
      staff_code: `STF-${randomBytes(3).toString('hex').toUpperCase()}`,
      roles,
    })
    if (staffError) {
      await client.auth.admin.deleteUser(authData.user.id)
      return json(500, { error: staffError.message })
    }
    return json(200, { ok: true })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Team member could not be created.' })
  }
}
