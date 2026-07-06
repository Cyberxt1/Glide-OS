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
  barcode: string
  price_kobo: number
  quantity: number
  category: string | null
  sku: string | null
  low_stock_threshold: number
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

function readBulkRows(csv: string): BulkProductRow[] | null {
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ''))
  if (parsed.length < 2) return null

  const headers = parsed[0].map((header) => header.trim().toLowerCase())
  const requiredHeaders = ['name', 'barcode', 'price', 'quantity']
  if (!requiredHeaders.every((header) => headers.includes(header))) return null

  const value = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() ?? ''
  const rows = parsed.slice(1).map((row) => {
    const price = Number(value(row, 'price'))
    const quantity = Number(value(row, 'quantity'))
    const thresholdValue = value(row, 'low_stock_threshold')
    const threshold = thresholdValue ? Number(thresholdValue) : 5

    return {
      name: value(row, 'name'),
      barcode: value(row, 'barcode'),
      price_kobo: Math.round(price * 100),
      quantity,
      category: value(row, 'category') || null,
      sku: value(row, 'sku') || null,
      low_stock_threshold: threshold,
    }
  })

  const valid = rows.every(
    (row) =>
      row.name &&
      row.barcode &&
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
  const rows = readBulkRows(csv)

  if (!rows || rows.length === 0 || rows.length > 300) {
    redirect(`/dash/${vendorId}/inventory?bulkError=format`)
  }

  const normalizedBarcodes = rows.map((row) => row.barcode.toLowerCase())
  if (new Set(normalizedBarcodes).size !== normalizedBarcodes.length) {
    redirect(`/dash/${vendorId}/inventory?bulkError=duplicate-file`)
  }

  const supabase = await createClient()
  const { data: existing, error: lookupError } = await supabase
    .from('products')
    .select('barcode')
    .eq('merchant_id', store.id)
    .in('barcode', rows.map((row) => row.barcode))

  if (lookupError) redirect(`/dash/${vendorId}/inventory?bulkError=database`)
  if (existing?.length) redirect(`/dash/${vendorId}/inventory?bulkError=duplicate-store`)

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
    .select('id, barcode')

  if (productError || !products || products.length !== rows.length) {
    redirect(`/dash/${vendorId}/inventory?bulkError=products`)
  }

  const rowByBarcode = new Map(rows.map((row) => [row.barcode, row]))
  const inventoryRows = products.map((product) => {
    const row = rowByBarcode.get(product.barcode)!
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

  const movements = products.flatMap((product) => {
    const row = rowByBarcode.get(product.barcode)!
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
