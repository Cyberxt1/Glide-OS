import { requireStoreContext } from '@/lib/store/context'
import type { OperationalOrder } from '@/lib/store/types'
import { createClient } from '@/lib/supabase/server'
import { OperationsBoard } from '../operations-board'

export default async function CashierPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, short_code, purchase_code, receipt_token, status, total_kobo, created_at, paid_at, ready_at, exit_token, order_items(id, product_name, quantity, unit_price_kobo)')
    .eq('merchant_id', store.id)
    .in('status', ['paid', 'preparing'])
    .order('paid_at', { ascending: true })

  return (
    <div className="dash-page operations-page">
      <header className="page-head compact"><div><p className="dash-kicker">Fulfilment tracker</p><h1>Cashier queue</h1><p>Paid orders only. Pack them, then release them to the gate.</p></div><span className="queue-count">{orders?.length ?? 0}<small>in queue</small></span></header>
      <OperationsBoard merchantId={store.id} role="cashier" orders={(orders ?? []) as OperationalOrder[]} />
    </div>
  )
}
