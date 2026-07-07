import type { Handler } from '@netlify/functions'
import { admin, json } from './_shared'

function merchant(row: { merchants?: unknown }) {
  return Array.isArray(row.merchants) ? row.merchants[0] : row.merchants as { id?: string; slug?: string; name?: string } | null
}

export const handler: Handler = async (event) => {
  const q = event.queryStringParameters?.q?.trim().toLowerCase() ?? ''
  if (q.length < 2) return json(400, { error: 'Type at least 2 characters.' })
  const supabase = admin()
  const { data: exact } = await supabase.from('qr_codes').select('code, merchant_id, merchants(id, slug, name)').eq('status', 'active').ilike('code', q).limit(1).maybeSingle()
  if (exact) return json(200, { storeName: merchant(exact)?.name ?? 'Partner store', shoppingUrl: `/s/${exact.code}${exact.merchant_id ? `?vendor_id=${exact.merchant_id}` : ''}` })
  const { data } = await supabase.from('qr_codes').select('code, merchant_id, merchants!inner(id, slug, name)').eq('status', 'active').or(`slug.ilike.%${q}%,name.ilike.%${q}%`, { referencedTable: 'merchants' }).limit(1)
  const row = data?.[0]
  if (!row) return json(404, { error: 'No active Glide store matched that name or code.' })
  return json(200, { storeName: merchant(row)?.name ?? 'Partner store', shoppingUrl: `/s/${row.code}${row.merchant_id ? `?vendor_id=${row.merchant_id}` : ''}` })
}
