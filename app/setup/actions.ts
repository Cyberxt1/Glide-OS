'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createStore(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/setup')

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const locationName = String(formData.get('location_name') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null

  if (!name || !locationName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Store name, valid URL name, and branch name are required.')
  }

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .insert({ owner_id: user.id, name, slug })
    .select('id')
    .single()
  if (merchantError) throw new Error(merchantError.message)

  const { error: locationError } = await supabase.from('store_locations').insert({
    merchant_id: merchant.id,
    name: locationName,
    city,
    address,
  })
  if (locationError) throw new Error(locationError.message)

  redirect(`/dash/${slug}`)
}
