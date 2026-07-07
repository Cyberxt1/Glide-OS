import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { MerchantContext, StoreRole } from './types'

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function requireUser() {
  const user = await getUser()
  if (!user) throw new Error('Sign in is required.')
  return user
}

export async function resolveDefaultDashboard(user: User) {
  const { data: owned } = await supabase
    .from('merchants')
    .select('slug')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (owned?.slug) return `/dash/${owned.slug}`

  const { data: membership } = await supabase
    .from('merchant_staff')
    .select('merchants(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const merchant = Array.isArray(membership?.merchants)
    ? membership?.merchants[0]
    : (membership?.merchants as unknown as { slug?: string } | null)

  return merchant?.slug ? `/dash/${merchant.slug}` : '/setup'
}

export async function getMerchantContext(vendorId: string): Promise<MerchantContext> {
  const user = await requireUser()
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, owner_id, slug, name, primary_color')
    .eq('slug', vendorId)
    .maybeSingle()

  if (error || !merchant) throw new Error('Store not found.')

  let roles: StoreRole[] = []
  if (merchant.owner_id === user.id) {
    roles = ['admin', 'cashier', 'security']
  } else {
    const { data: staff } = await supabase
      .from('merchant_staff')
      .select('roles')
      .eq('merchant_id', merchant.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    roles = (staff?.roles ?? []) as StoreRole[]
  }

  if (!roles.length) throw new Error('This account does not have access to the store.')

  const { data: location } = await supabase
    .from('store_locations')
    .select('id, name, city')
    .eq('merchant_id', merchant.id)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return {
    id: merchant.id,
    slug: merchant.slug,
    name: merchant.name,
    primaryColor: merchant.primary_color ?? '#00f58b',
    roles,
    location,
  }
}
