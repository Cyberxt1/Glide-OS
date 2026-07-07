import type { Handler } from '@netlify/functions'
import { json, readJson, requireMerchantAccess } from './_shared'

type Body = {
  vendorId?: string
  name?: string
  barcode?: string | null
  sku?: string | null
  category?: string | null
  priceKobo?: number
  quantity?: number
}

function clean(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<Body>(event)
    if (!body.vendorId) return json(400, { error: 'Store is required.' })
    const name = String(body.name ?? '').trim()
    const priceKobo = Math.round(Number(body.priceKobo))
    const quantity = Math.floor(Math.max(0, Number(body.quantity) || 0))
    if (!name || !Number.isInteger(priceKobo) || priceKobo < 0) return json(400, { error: 'Enter a product name and valid price.' })
    const { client, merchant } = await requireMerchantAccess(event, body.vendorId, ['admin'])
    const { data: location } = await client.from('store_locations').select('id').eq('merchant_id', merchant.id).eq('is_active', true).limit(1).maybeSingle()
    if (!location) return json(400, { error: 'Create a store location before adding products.' })

    const barcode = clean(body.barcode)
    const sku = clean(body.sku)
    const duplicateChecks = await Promise.all([
      client.from('products').select('id').eq('merchant_id', merchant.id).eq('name', name).limit(1).maybeSingle(),
      barcode ? client.from('products').select('id').eq('merchant_id', merchant.id).eq('barcode', barcode).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
      sku ? client.from('products').select('id').eq('merchant_id', merchant.id).eq('sku', sku).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    if (duplicateChecks.some((result) => result.data)) return json(409, { error: 'A product with that name, barcode, or SKU already exists.' })

    const { data: product, error } = await client.from('products').insert({
      merchant_id: merchant.id,
      name,
      barcode,
      sku,
      category: clean(body.category),
      price_kobo: priceKobo,
      tracks_inventory: true,
    }).select('id').single()
    if (error || !product) return json(500, { error: error?.message ?? 'Product could not be created.' })

    const { error: stockError } = await client.from('location_inventory').insert({
      merchant_id: merchant.id,
      location_id: location.id,
      product_id: product.id,
      quantity,
      low_stock_threshold: 5,
    })
    if (stockError) {
      await client.from('products').delete().eq('id', product.id)
      return json(500, { error: stockError.message })
    }

    return json(200, { id: product.id })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Product could not be created.' })
  }
}
