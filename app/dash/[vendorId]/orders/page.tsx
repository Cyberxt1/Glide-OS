import { requireStoreContext } from '@/lib/store/context'
import { formatDateTime, formatNaira, readableStatus } from '@/lib/store/format'
import { orderShortCode } from '@/lib/store/types'
import { createClient } from '@/lib/supabase/server'

export default async function OrdersPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_kobo, created_at, store_locations(name)')
    .eq('merchant_id', store.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="dash-page">
      <header className="page-head compact">
        <div>
          <p className="dash-kicker">Transaction ledger</p>
          <h1>Orders</h1>
          <p>Every payment and operational handoff in one place.</p>
        </div>
      </header>
      <section className="dash-surface table-surface">
        <div className="table-toolbar"><strong>{orders?.length ?? 0} recent orders</strong><span>Newest first</span></div>
        {orders?.length ? (
          <div className="data-table">
            <div className="table-row table-header"><span>Order</span><span>Location</span><span>Status</span><span>Created</span><span>Total</span></div>
            {orders.map((order) => {
              const location = order.store_locations as unknown as { name: string } | null
              return (
                <div className="table-row" key={order.id}>
                  <strong>#{orderShortCode(order.id)}</strong>
                  <span>{location?.name ?? '-'}</span>
                  <span><i className={`status-orb status-${order.status}`} />{readableStatus(order.status)}</span>
                  <span>{formatDateTime(order.created_at)}</span>
                  <strong>{formatNaira(order.total_kobo)}</strong>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="truthful-empty wide">
            <span>No orders yet</span>
            <h3>The ledger is ready for your first real transaction.</h3>
            <p>Successful Paystack payments will populate this table.</p>
          </div>
        )}
      </section>
    </div>
  )
}
