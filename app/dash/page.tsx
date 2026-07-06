import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardIndexPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: ownedStore } = await supabase
    .from('merchants')
    .select('slug')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (ownedStore) {
    redirect(`/dash/${ownedStore.slug}`)
  }

  const { data: membership } = await supabase
    .from('merchant_staff')
    .select('merchants(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const joinedMerchant = membership?.merchants as unknown as { slug: string } | null
  if (joinedMerchant?.slug) {
    redirect(`/dash/${joinedMerchant.slug}`)
  }

  return (
    <main className="dash-unassigned">
      <p className="dash-kicker">Glide store operations</p>
      <h1>No store is connected yet.</h1>
      <p>Create your first store and branch to open the operations dashboard.</p>
      <Link href="/setup">Create a store</Link>
    </main>
  )
}
