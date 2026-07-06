import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { MerchantContext, StoreRole } from './types'

export const requireStoreContext = cache(async function requireStoreContext(
  vendorId: string,
): Promise<MerchantContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dash/${vendorId}`)}`)
  }

  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, owner_id, slug, name, logo_url, primary_color')
    .eq('slug', vendorId)
    .single()

  if (error || !merchant) {
    redirect('/dash?notice=store-not-found')
  }

  let roles: StoreRole[] = []

  if (merchant.owner_id === user.id) {
    roles = ['admin', 'cashier', 'security']
  } else {
    const { data: membership } = await supabase
      .from('merchant_staff')
      .select('roles')
      .eq('merchant_id', merchant.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    roles = (membership?.roles ?? []) as StoreRole[]
  }

  if (roles.length === 0) {
    redirect('/login?error=store-access')
  }

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
    logoUrl: merchant.logo_url,
    primaryColor: merchant.primary_color,
    roles,
    location,
  }
})
