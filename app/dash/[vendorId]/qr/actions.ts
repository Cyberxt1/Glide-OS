'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStoreContext } from '@/lib/store/context'
import { createClient } from '@/lib/supabase/server'

async function issueStoreQr(vendorId: string, rotateExisting: boolean) {
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

  if (existing && !rotateExisting) redirect(`/dash/${vendorId}/qr`)
  if (!existing && rotateExisting) redirect(`/dash/${vendorId}/qr`)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (existing) {
    const { error: disableError } = await supabase
      .from('qr_codes')
      .update({
        status: 'disabled',
      })
      .eq('id', existing.id)

    if (disableError) redirect(`/dash/${vendorId}/qr?error=rotation`)
  }

  const { error: insertError } = await supabase.from('qr_codes').insert({
    code: `qr_${randomBytes(9).toString('base64url')}`,
    merchant_id: store.id,
    location_id: store.location.id,
    status: 'active',
    activated_at: new Date().toISOString(),
    activated_by: user?.id,
  })

  if (insertError) {
    if (existing) {
      await supabase
        .from('qr_codes')
        .update({
          status: 'active',
        })
        .eq('id', existing.id)
    }

    redirect(`/dash/${vendorId}/qr?error=${rotateExisting ? 'rotation' : 'generation'}`)
  }

  revalidatePath(`/dash/${vendorId}/qr`)
  redirect(`/dash/${vendorId}/qr?${rotateExisting ? 'rotated=1' : 'created=1'}`)
}

export async function createStoreQr(vendorId: string) {
  await issueStoreQr(vendorId, false)
}

export async function regenerateStoreQr(vendorId: string) {
  await issueStoreQr(vendorId, true)
}
