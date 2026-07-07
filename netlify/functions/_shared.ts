import { createClient } from '@supabase/supabase-js'

export type JsonResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export function json(statusCode: number, body: unknown): JsonResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  }
}

export function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase server environment is missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function bearerToken(event: { headers?: Record<string, string | undefined> }) {
  const value = event.headers?.authorization ?? event.headers?.Authorization
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : ''
}

export async function requireUser(event: { headers?: Record<string, string | undefined> }) {
  const token = bearerToken(event)
  if (!token) throw new Error('Sign in is required.')
  const client = admin()
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('Sign in is required.')
  return data.user
}

export async function requireMerchantAccess(
  event: { headers?: Record<string, string | undefined> },
  vendorId: string,
  allowedRoles: string[] = ['admin'],
) {
  const user = await requireUser(event)
  const client = admin()
  const { data: merchant, error } = await client
    .from('merchants')
    .select('id, slug, name, owner_id')
    .eq('slug', vendorId)
    .maybeSingle()

  if (error || !merchant) throw new Error('Store not found.')
  if (merchant.owner_id === user.id) return { client, user, merchant, roles: ['admin', 'cashier', 'security'] }

  const { data: staff } = await client
    .from('merchant_staff')
    .select('roles')
    .eq('merchant_id', merchant.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const roles = (staff?.roles ?? []) as string[]
  if (!roles.some((role) => allowedRoles.includes(role))) throw new Error('This account cannot perform that action.')
  return { client, user, merchant, roles }
}

export async function readJson<T>(event: { body?: string | null }) {
  return (event.body ? JSON.parse(event.body) : {}) as T
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function orderShortCode(orderId: string) {
  return orderId.replaceAll('-', '').slice(0, 6).toUpperCase()
}

export function orderPurchaseCode(orderId: string) {
  return `GLD-${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`
}
