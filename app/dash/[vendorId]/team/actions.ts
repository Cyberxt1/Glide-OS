'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStoreContext } from '@/lib/store/context'
import { createAdminClient } from '@/lib/supabase/admin'

export async function addTeamMember(vendorId: string, formData: FormData) {
  const store = await requireStoreContext(vendorId)
  if (!store.roles.includes('admin')) redirect(`/dash/${vendorId}/team?error=access`)

  const displayName = String(formData.get('display_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const temporaryPassword = String(formData.get('temporary_password') ?? '')
  const locationId = String(formData.get('location_id') ?? '') || null
  const roles = formData
    .getAll('roles')
    .map(String)
    .filter((role) => role === 'cashier' || role === 'security')

  if (
    !displayName ||
    !email.includes('@') ||
    temporaryPassword.length < 8 ||
    roles.length === 0
  ) {
    redirect(`/dash/${vendorId}/team?error=details`)
  }

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
    },
  })

  if (authError || !authData.user) {
    const code = authError?.message.toLowerCase().includes('already') ? 'exists' : 'account'
    redirect(`/dash/${vendorId}/team?error=${code}`)
  }

  const staffCode = `STF-${randomBytes(3).toString('hex').toUpperCase()}`
  const { error: staffError } = await admin.from('merchant_staff').insert({
    merchant_id: store.id,
    location_id: locationId,
    user_id: authData.user.id,
    display_name: displayName,
    staff_code: staffCode,
    roles,
  })

  if (staffError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    redirect(`/dash/${vendorId}/team?error=profile`)
  }

  revalidatePath(`/dash/${vendorId}/team`)
  redirect(`/dash/${vendorId}/team?added=1`)
}
