import type { Handler } from '@netlify/functions'
import { json, readJson, requireMerchantAccess } from './_shared'

type Body = { vendorId?: string; csv?: string }
type Row = {
  name: string
  barcode: string | null
  sku: string | null
  category: string | null
  price_kobo: number
  quantity: number
  low_stock_threshold: number
}

const aliases = {
  name: ['name', 'product', 'product name', 'item', 'item name', 'description', 'product description', 'title'],
  barcode: ['barcode', 'bar code', 'ean', 'ean13', 'ean 13', 'upc', 'code', 'product code', 'item code'],
  price: ['price', 'selling price', 'sale price', 'retail price', 'amount', 'unit price', 'price ngn', 'price (ngn)', 'naira'],
  price_kobo: ['price kobo', 'price_kobo', 'amount kobo'],
  quantity: ['quantity', 'qty', 'stock', 'opening stock', 'stock quantity', 'inventory', 'on hand', 'available quantity'],
  category: ['category', 'department', 'group', 'product category', 'class'],
  sku: ['sku', 'stock keeping unit', 'item sku', 'product sku'],
  low_stock_threshold: ['low_stock_threshold', 'low stock threshold', 'low stock', 'reorder level', 'minimum stock', 'min stock'],
} as const

function norm(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      field += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function indexFor(headers: string[], key: keyof typeof aliases) {
  const normalized = headers.map(norm)
  return aliases[key].map(norm).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0) ?? -1
}

function priceKobo(value: string, header: string) {
  const parsed = Number(value.replace(/[₦,\s]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
  return norm(header).includes('kobo') ? Math.round(parsed) : Math.round(parsed * 100)
}

function intValue(value: string, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value.replace(/,/g, '').trim())
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN
}

function readRows(csv: string): Row[] {
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ''))
  if (parsed.length < 2) throw new Error('CSV needs a header row and at least one product row.')
  const headers = parsed[0]
  const indexes = {
    name: indexFor(headers, 'name'),
    barcode: indexFor(headers, 'barcode'),
    sku: indexFor(headers, 'sku'),
    category: indexFor(headers, 'category'),
    price: indexFor(headers, 'price'),
    priceKobo: indexFor(headers, 'price_kobo'),
    quantity: indexFor(headers, 'quantity'),
    lowStock: indexFor(headers, 'low_stock_threshold'),
  }
  if (indexes.name < 0 || (indexes.price < 0 && indexes.priceKobo < 0)) {
    throw new Error('Could not match product name and price columns.')
  }
  const cell = (row: string[], index: number) => (index >= 0 ? row[index]?.trim() ?? '' : '')
  const rows = parsed.slice(1).map((row) => {
    const priceIndex = indexes.price >= 0 ? indexes.price : indexes.priceKobo
    return {
      name: cell(row, indexes.name),
      barcode: cell(row, indexes.barcode) || null,
      sku: cell(row, indexes.sku) || null,
      category: cell(row, indexes.category) || null,
      price_kobo: priceKobo(cell(row, priceIndex), headers[priceIndex] ?? ''),
      quantity: intValue(cell(row, indexes.quantity), 0),
      low_stock_threshold: intValue(cell(row, indexes.lowStock), 5),
    }
  })
  if (rows.length > 300) throw new Error('Import 300 products or fewer at once.')
  if (rows.some((row) => !row.name || !Number.isInteger(row.price_kobo) || !Number.isInteger(row.quantity))) {
    throw new Error('One or more rows has an invalid product name, price, or stock quantity.')
  }
  return rows
}

function hasDuplicates(values: string[]) {
  return values.length !== new Set(values).size
}

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<Body>(event)
    if (!body.vendorId || !body.csv) return json(400, { error: 'Store and CSV content are required.' })
    const { client, merchant } = await requireMerchantAccess(event, body.vendorId, ['admin'])
    const { data: location } = await client.from('store_locations').select('id').eq('merchant_id', merchant.id).eq('is_active', true).limit(1).maybeSingle()
    if (!location) return json(400, { error: 'Create a store location before importing products.' })

    const rows = readRows(body.csv)
    const names = rows.map((row) => norm(row.name))
    const barcodes = rows.map((row) => norm(row.barcode ?? '')).filter(Boolean)
    const skus = rows.map((row) => norm(row.sku ?? '')).filter(Boolean)
    if (hasDuplicates(names) || hasDuplicates(barcodes) || hasDuplicates(skus)) {
      return json(409, { error: 'The CSV has duplicate product names, barcodes, or SKUs.' })
    }

    const [existingNames, existingBarcodes, existingSkus] = await Promise.all([
      client.from('products').select('id').eq('merchant_id', merchant.id).in('name', rows.map((row) => row.name)),
      barcodes.length ? client.from('products').select('id').eq('merchant_id', merchant.id).in('barcode', rows.map((row) => row.barcode).filter(Boolean) as string[]) : Promise.resolve({ data: [], error: null }),
      skus.length ? client.from('products').select('id').eq('merchant_id', merchant.id).in('sku', rows.map((row) => row.sku).filter(Boolean) as string[]) : Promise.resolve({ data: [], error: null }),
    ])

    if (existingNames.error || existingBarcodes.error || existingSkus.error) return json(500, { error: 'Could not check existing products.' })
    if (existingNames.data?.length || existingBarcodes.data?.length || existingSkus.data?.length) {
      return json(409, { error: 'Some products already exist in this store.' })
    }

    const { data: products, error: productError } = await client
      .from('products')
      .insert(rows.map((row) => ({
        merchant_id: merchant.id,
        name: row.name,
        barcode: row.barcode,
        sku: row.sku,
        category: row.category,
        price_kobo: row.price_kobo,
        tracks_inventory: true,
      })))
      .select('id')
    if (productError || !products || products.length !== rows.length) return json(500, { error: productError?.message ?? 'The product batch could not be created.' })

    const { error: stockError } = await client.from('location_inventory').insert(products.map((product, index) => ({
      merchant_id: merchant.id,
      location_id: location.id,
      product_id: product.id,
      quantity: rows[index].quantity,
      low_stock_threshold: rows[index].low_stock_threshold,
    })))
    if (stockError) {
      await client.from('products').delete().in('id', products.map((product) => product.id))
      return json(500, { error: stockError.message })
    }

    return json(200, { imported: rows.length })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Import failed.' })
  }
}
