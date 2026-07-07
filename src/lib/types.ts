export type StoreRole = 'admin' | 'cashier' | 'security'

export type MerchantContext = {
  id: string
  slug: string
  name: string
  primaryColor: string
  roles: StoreRole[]
  location: { id: string; name: string; city: string | null } | null
}

export type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  price_kobo: number
  is_available: boolean
  tracks_inventory?: boolean
  location_inventory?: { quantity: number; low_stock_threshold: number }[]
}

export type OrderItem = {
  id: string
  product_name: string
  quantity: number
  unit_price_kobo: number
}

export type Order = {
  id: string
  status: string
  total_kobo: number
  created_at: string
  paid_at: string | null
  order_items?: OrderItem[]
  store_locations?: { name: string } | null
}
