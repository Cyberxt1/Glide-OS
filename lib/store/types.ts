export type StoreRole = 'admin' | 'cashier' | 'security'

export type MerchantContext = {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  primaryColor: string
  roles: StoreRole[]
  location: {
    id: string
    name: string
    city: string | null
  } | null
}

export type OrderItem = {
  id: string
  product_name: string
  quantity: number
  unit_price_kobo: number
}

export type OperationalOrder = {
  id: string
  short_code: string
  purchase_code: string
  receipt_token: string
  status: string
  total_kobo: number
  created_at: string
  paid_at: string | null
  ready_at: string | null
  exit_token: string | null
  order_items: OrderItem[]
}
