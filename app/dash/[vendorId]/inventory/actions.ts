'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStoreContext } from '@/lib/store/context'
import { createClient } from '@/lib/supabase/server'

function cleanOptional(value: FormDataEntryValue | null) {
  const cleaned = String(value ?? '').trim()
  return cleaned || null
}

export async function createProduct(vendorId: string, formData: FormData) {
  const store = await requireStoreContext(vendorId)
  if (!store.roles.includes('admin')) throw new Error('Administrator access is required.')

  const name = String(formData.get('name') ?? '').trim()
  const naira = Number(formData.get('price'))
  if (!name || !Number.isFinite(naira) || naira < 0) {
    throw new Error('Enter a product name and a valid price.')
  }

  const supabase = await createClient()
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      merchant_id: store.id,
      name,
      sku: cleanOptional(formData.get('sku')),
      barcode: cleanOptional(formData.get('barcode')),
      category: cleanOptional(formData.get('category')),
      price_kobo: Math.round(naira * 100),
      tracks_inventory: formData.get('tracks_inventory') === 'on',
    })
    .select('id, tracks_inventory')
    .single()

  if (error) throw new Error(error.message)

  if (product.tracks_inventory && store.location) {
    const initialQuantity = Math.max(0, Number(formData.get('quantity')) || 0)
    const { error: stockError } = await supabase.from('location_inventory').insert({
      merchant_id: store.id,
      location_id: store.location.id,
      product_id: product.id,
      quantity: Math.floor(initialQuantity),
      low_stock_threshold: 5,
    })
    if (stockError) throw new Error(stockError.message)

    if (initialQuantity > 0) {
      await supabase.from('inventory_movements').insert({
        merchant_id: store.id,
        location_id: store.location.id,
        product_id: product.id,
        movement_type: 'restock',
        quantity_delta: Math.floor(initialQuantity),
        note: 'Opening stock entered when product was created',
      })
    }
  }

  revalidatePath(`/dash/${vendorId}/inventory`)
}

type BulkProductRow = {
  name: string
  barcode: string | null
  price_kobo: number
  quantity: number
  category: string | null
  sku: string | null
  low_stock_threshold: number
}

type BulkColumnKey = keyof BulkProductRow | 'price'

const columnAliases: Record<BulkColumnKey, string[]> = {
  name: [
    'name',
    'product',
    'product name',
    'item',
    'item name',
    'description',
    'product description',
    'title',
  ],
  barcode: ['barcode', 'bar code', 'ean', 'ean13', 'ean 13', 'upc', 'code', 'product code', 'item code'],
  price: ['price', 'selling price', 'sale price', 'retail price', 'amount', 'unit price', 'price ngn', 'price (ngn)', 'naira'],
  price_kobo: ['price kobo', 'price_kobo', 'amount kobo'],
  quantity: ['quantity', 'qty', 'stock', 'opening stock', 'stock quantity', 'inventory', 'on hand', 'available quantity'],
  category: ['category', 'department', 'group', 'product category', 'class'],
  sku: ['sku', 'stock keeping unit', 'item sku', 'product sku'],
  low_stock_threshold: ['low_stock_threshold', 'low stock threshold', 'low stock', 'reorder level', 'minimum stock', 'min stock'],
}

const requiredImportColumns = ['name', 'price'] as const

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function normalizeUniqueValue(value: string | null) {
  return value?.trim().toLowerCase() ?? ''
}

function parseInteger(value: string, fallback = 0) {
  if (!value) return fallback
  const cleaned = value.replace(/,/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN
}

function parsePriceKobo(value: string, header: string) {
  const cleaned = value.replace(/[₦,\s]/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN

  return normalizeHeader(header).includes('kobo') ? Math.round(parsed) : Math.round(parsed * 100)
}

function findHeaderIndex(headers: string[], key: BulkColumnKey, override?: string) {
  const normalizedHeaders = headers.map(normalizeHeader)
  const normalizedOverride = normalizeHeader(override ?? '')

  if (normalizedOverride) {
    const overrideIndex = normalizedHeaders.indexOf(normalizedOverride)
    if (overrideIndex >= 0) return overrideIndex
  }

  for (const alias of columnAliases[key]) {
    const aliasIndex = normalizedHeaders.indexOf(normalizeHeader(alias))
    if (aliasIndex >= 0) return aliasIndex
  }

  return -1
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (character === '"' && quoted && next === '"') {
      field += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function readBulkRows(csv: string, formData: FormData): BulkProductRow[] | null {
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ''))
  if (parsed.length < 2) return null

  const headers = parsed[0].map((header) => header.trim())
  const columnIndex = {
    name: findHeaderIndex(headers, 'name', String(formData.get('map_name') ?? '')),
    barcode: findHeaderIndex(headers, 'barcode', String(formData.get('map_barcode') ?? '')),
    price: findHeaderIndex(headers, 'price', String(formData.get('map_price') ?? '')),
    priceKobo: findHeaderIndex(headers, 'price_kobo', String(formData.get('map_price') ?? '')),
    quantity: findHeaderIndex(headers, 'quantity', String(formData.get('map_quantity') ?? '')),
    category: findHeaderIndex(headers, 'category', String(formData.get('map_category') ?? '')),
    sku: findHeaderIndex(headers, 'sku', String(formData.get('map_sku') ?? '')),
    lowStockThreshold: findHeaderIndex(headers, 'low_stock_threshold', String(formData.get('map_low_stock_threshold') ?? '')),
  }

  if (requiredImportColumns.some((key) => columnIndex[key] < 0 && (key !== 'price' || columnIndex.priceKobo < 0))) {
    return null
  }

  const value = (row: string[], index: number) => (index >= 0 ? row[index]?.trim() ?? '' : '')
  const rows = parsed.slice(1).map((row) => {
    const priceIndex = columnIndex.price >= 0 ? columnIndex.price : columnIndex.priceKobo
    const quantity = parseInteger(value(row, columnIndex.quantity), 0)
    const threshold = parseInteger(value(row, columnIndex.lowStockThreshold), 5)
    const barcode = value(row, columnIndex.barcode) || null
    const sku = value(row, columnIndex.sku) || null

    return {
      name: value(row, columnIndex.name),
      barcode,
      price_kobo: parsePriceKobo(value(row, priceIndex), headers[priceIndex] ?? ''),
      quantity,
      category: value(row, columnIndex.category) || null,
      sku,
      low_stock_threshold: threshold,
    }
  })

  const valid = rows.every(
    (row) =>
      row.name &&
      Number.isInteger(row.price_kobo) &&
      row.price_kobo >= 0 &&
      Number.isInteger(row.quantity) &&
      row.quantity >= 0 &&
      Number.isInteger(row.low_stock_threshold) &&
      row.low_stock_threshold >= 0,
  )

  return valid ? rows : null
}

export async function bulkCreateProducts(vendorId: string, formData: FormData) {
  const store = await requireStoreContext(vendorId)
  if (!store.roles.includes('admin')) redirect(`/dash/${vendorId}/inventory?bulkError=access`)
  if (!store.location) redirect(`/dash/${vendorId}/inventory?bulkError=location`)

  const uploadedFile = formData.get('file')
  const pastedCsv = String(formData.get('csv') ?? '')
  const csv =
    uploadedFile instanceof File && uploadedFile.size > 0
      ? await uploadedFile.text()
      : pastedCsv
  const rows = readBulkRows(csv, formData)

  if (!rows || rows.length === 0 || rows.length > 300) {
    redirect(`/dash/${vendorId}/inventory?bulkError=format`)
  }

  const duplicatedInFile = (values: string[]) => values.length !== new Set(values).size
  const normalizedBarcodes = rows.map((row) => normalizeUniqueValue(row.barcode)).filter(Boolean)
  const normalizedNames = rows.map((row) => normalizeUniqueValue(row.name))
  const normalizedSkus = rows.map((row) => normalizeUniqueValue(row.sku)).filter(Boolean)

  if (
    duplicatedInFile(normalizedBarcodes) ||
    duplicatedInFile(normalizedNames) ||
    duplicatedInFile(normalizedSkus)
  ) {
    redirect(`/dash/${vendorId}/inventory?bulkError=duplicate-file`)
  }

  const supabase = await createClient()
  const barcodes = rows.map((row) => row.barcode).filter(Boolean) as string[]
  const skus = rows.map((row) => row.sku).filter(Boolean) as string[]
  const existingChecks = [
    barcodes.length
      ? supabase.from('products').select('barcode').eq('merchant_id', store.id).in('barcode', barcodes)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('products').select('name').eq('merchant_id', store.id).in('name', rows.map((row) => row.name)),
    skus.length
      ? supabase.from('products').select('sku').eq('merchant_id', store.id).in('sku', skus)
      : Promise.resolve({ data: [], error: null }),
  ] as const

  const [existingBarcodes, existingNames, existingSkus] = await Promise.all(existingChecks)

  if (existingBarcodes.error || existingNames.error || existingSkus.error) {
    redirect(`/dash/${vendorId}/inventory?bulkError=database`)
  }

  if (existingBarcodes.data?.length || existingNames.data?.length || existingSkus.data?.length) {
    redirect(`/dash/${vendorId}/inventory?bulkError=duplicate-store`)
  }

  const { data: products, error: productError } = await supabase
    .from('products')
    .insert(
      rows.map((row) => ({
        merchant_id: store.id,
        name: row.name,
        barcode: row.barcode,
        sku: row.sku,
        category: row.category,
        price_kobo: row.price_kobo,
        tracks_inventory: true,
      })),
    )
    .select('id')

  if (productError || !products || products.length !== rows.length) {
    redirect(`/dash/${vendorId}/inventory?bulkError=products`)
  }

  const inventoryRows = products.map((product, index) => {
    const row = rows[index]
    return {
      merchant_id: store.id,
      location_id: store.location!.id,
      product_id: product.id,
      quantity: row.quantity,
      low_stock_threshold: row.low_stock_threshold,
    }
  })

  const { error: inventoryError } = await supabase
    .from('location_inventory')
    .insert(inventoryRows)

  if (inventoryError) {
    await supabase.from('products').delete().in('id', products.map((product) => product.id))
    redirect(`/dash/${vendorId}/inventory?bulkError=inventory`)
  }

  const movements = products.flatMap((product, index) => {
    const row = rows[index]
    return row.quantity > 0
      ? [{
          merchant_id: store.id,
          location_id: store.location!.id,
          product_id: product.id,
          movement_type: 'restock',
          quantity_delta: row.quantity,
          note: 'Opening stock from bulk product import',
        }]
      : []
  })

  if (movements.length) {
    await supabase.from('inventory_movements').insert(movements)
  }

  revalidatePath(`/dash/${vendorId}/inventory`)
  redirect(`/dash/${vendorId}/inventory?imported=${rows.length}`)
}

export async function setStock(vendorId: string, formData: FormData) {
  const store = await requireStoreContext(vendorId)
  if (!store.roles.includes('admin')) throw new Error('Administrator access is required.')
  if (!store.location) throw new Error('Create a store location before setting stock.')

  const productId = String(formData.get('product_id') ?? '')
  const quantity = Number(formData.get('quantity'))
  const threshold = Number(formData.get('threshold'))
  if (!productId || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Enter a valid stock quantity.')
  }

  const supabase = await createClient()
  const { data: previous } = await supabase
    .from('location_inventory')
    .select('quantity')
    .eq('location_id', store.location.id)
    .eq('product_id', productId)
    .maybeSingle()

  const { error } = await supabase.from('location_inventory').upsert(
    {
      merchant_id: store.id,
      location_id: store.location.id,
      product_id: productId,
      quantity,
      low_stock_threshold: Number.isInteger(threshold) && threshold >= 0 ? threshold : 5,
    },
    { onConflict: 'location_id,product_id' },
  )
  if (error) throw new Error(error.message)

  const delta = quantity - (previous?.quantity ?? 0)
  if (delta !== 0) {
    await supabase.from('inventory_movements').insert({
      merchant_id: store.id,
      location_id: store.location.id,
      product_id: productId,
      movement_type: previous ? 'correction' : 'restock',
      quantity_delta: delta,
      note: 'Manual stock count from the Glide dashboard',
    })
  }

  revalidatePath(`/dash/${vendorId}/inventory`)
}
