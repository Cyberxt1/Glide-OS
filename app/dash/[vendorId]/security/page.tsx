import { requireStoreContext } from '@/lib/store/context'
import type { OperationalOrder } from '@/lib/store/types'
import { createClient } from '@/lib/supabase/server'
import { OperationsBoard } from '../operations-board'

export default async function SecurityPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, short_code, purchase_code, receipt_token, status, total_kobo, created_at, paid_at, ready_at, exit_token, order_items(id, product_name, quantity, unit_price_kobo)')
    .eq('merchant_id', store.id)
    .eq('status', 'ready_for_exit')
    .order('ready_at', { ascending: true })

  return (
    <div className="dash-page operations-page security-page">
      <header className="page-head compact"><div><p className="dash-kicker">Loss prevention</p><h1>Security gate</h1><p>Match the customer’s code, verify payment, and clear the exit.</p></div><span className="queue-count">{orders?.length ?? 0}<small>awaiting exit</small></span></header>
      <OperationsBoard merchantId={store.id} role="security" orders={(orders ?? []) as OperationalOrder[]} />
    </div>
  )
}
