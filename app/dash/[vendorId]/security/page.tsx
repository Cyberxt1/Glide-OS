import { requireStoreContext } from '@/lib/store/context'
import { orderPurchaseCode, orderShortCode, type OperationalOrder } from '@/lib/store/types'
import { createClient } from '@/lib/supabase/server'
import { OperationsBoard } from '../operations-board'

export default async function SecurityPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_kobo, created_at, paid_at, order_items(id, product_name, quantity, unit_price_kobo)')
    .eq('merchant_id', store.id)
    .eq('status', 'ready_for_exit')
    .order('created_at', { ascending: true })

  const operationalOrders = (orders ?? []).map((order) => ({
    ...order,
    short_code: orderShortCode(order.id),
    purchase_code: orderPurchaseCode(order.id),
    receipt_token: order.id,
    ready_at: null,
    exit_token: orderPurchaseCode(order.id),
  })) as OperationalOrder[]

  return (
    <div className="dash-page operations-page security-page">
      <header className="page-head compact">
        <div>
          <p className="dash-kicker">Loss prevention</p>
          <h1>Security gate</h1>
          <p>Match the customer code, verify payment, and clear the exit.</p>
        </div>
        <span className="queue-count">{operationalOrders.length}<small>awaiting exit</small></span>
      </header>
      <OperationsBoard merchantId={store.id} role="security" orders={operationalOrders} />
    </div>
  )
}
