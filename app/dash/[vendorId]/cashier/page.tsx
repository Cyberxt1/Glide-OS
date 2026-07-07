import { requireStoreContext } from '@/lib/store/context'
import { orderPurchaseCode, orderShortCode, type OperationalOrder } from '@/lib/store/types'
import { createClient } from '@/lib/supabase/server'
import { OperationsBoard } from '../operations-board'

export default async function CashierPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_kobo, created_at, paid_at, order_items(id, product_name, quantity, unit_price_kobo)')
    .eq('merchant_id', store.id)
    .in('status', ['paid', 'preparing'])
    .order('paid_at', { ascending: true })

  const operationalOrders = (orders ?? []).map((order) => ({
    ...order,
    short_code: orderShortCode(order.id),
    purchase_code: orderPurchaseCode(order.id),
    receipt_token: order.id,
    ready_at: null,
    exit_token: orderPurchaseCode(order.id),
  })) as OperationalOrder[]

  return (
    <div className="dash-page operations-page">
      <header className="page-head compact">
        <div>
          <p className="dash-kicker">Fulfilment tracker</p>
          <h1>Cashier queue</h1>
          <p>Paid orders only. Pack them, then release them to the gate.</p>
        </div>
        <span className="queue-count">{operationalOrders.length}<small>in queue</small></span>
      </header>
      <OperationsBoard merchantId={store.id} role="cashier" orders={operationalOrders} />
    </div>
  )
}
