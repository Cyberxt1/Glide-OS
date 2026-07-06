'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStoreContext } from '@/lib/store/context'
import { createClient } from '@/lib/supabase/server'

export async function createStoreQr(vendorId: string) {
  const store = await requireStoreContext(vendorId)
  if (!store.roles.includes('admin')) redirect(`/dash/${vendorId}/qr?error=access`)
  if (!store.location) redirect(`/dash/${vendorId}/qr?error=location`)

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('qr_codes')
    .select('id')
    .eq('merchant_id', store.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (existing) redirect(`/dash/${vendorId}/qr`)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('qr_codes').insert({
    code: `qr_${randomBytes(9).toString('base64url')}`,
    merchant_id: store.id,
    location_id: store.location.id,
    status: 'active',
    activated_at: new Date().toISOString(),
    activated_by: user?.id,
  })

  if (error) redirect(`/dash/${vendorId}/qr?error=generation`)

  revalidatePath(`/dash/${vendorId}/qr`)
  redirect(`/dash/${vendorId}/qr?created=1`)
}
