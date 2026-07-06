import Link from 'next/link'
import { requireStoreContext } from '@/lib/store/context'
import { formatNaira, formatTime, readableStatus } from '@/lib/store/format'
import { createClient } from '@/lib/supabase/server'

export default async function StoreOverviewPage({
  params,
}: {
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [{ data: orders }, { data: inventory }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, short_code, status, total_kobo, created_at')
      .eq('merchant_id', store.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('location_inventory')
      .select('quantity, low_stock_threshold, products(name)')
      .eq('merchant_id', store.id),
  ])

  const todaysOrders = orders ?? []
  const paidStatuses = new Set(['paid', 'preparing', 'ready_for_exit', 'exited'])
  const revenue = todaysOrders
    .filter((order) => paidStatuses.has(order.status))
    .reduce((total, order) => total + order.total_kobo, 0)
  const activeOrders = todaysOrders.filter((order) =>
    ['paid', 'preparing', 'ready_for_exit'].includes(order.status),
  ).length
  const readyOrders = todaysOrders.filter((order) => order.status === 'ready_for_exit').length
  const lowStock = (inventory ?? []).filter(
    (row) => row.quantity <= row.low_stock_threshold,
  ).length

  return (
    <div className="dash-page">
      <header className="page-head">
        <div>
          <p className="dash-kicker">Live operations</p>
          <h1>Good day, {store.name}.</h1>
          <p>{store.location ? `${store.location.name}${store.location.city ? ` · ${store.location.city}` : ''}` : 'Add a store location to begin trading.'}</p>
        </div>
        <span className="live-status"><i /> Live now</span>
      </header>

      <section className="metric-rail" aria-label="Store summary">
        <article><span>Revenue today</span><strong>{formatNaira(revenue)}</strong><small>Verified payments only</small></article>
        <article><span>Orders today</span><strong>{todaysOrders.length.toString().padStart(2, '0')}</strong><small>{activeOrders} currently active</small></article>
        <article><span>Ready for exit</span><strong>{readyOrders.toString().padStart(2, '0')}</strong><small>Awaiting security</small></article>
        <article><span>Low stock</span><strong>{lowStock.toString().padStart(2, '0')}</strong><small>At or below threshold</small></article>
      </section>

      <section className="overview-grid">
        <div className="dash-surface activity-surface">
          <div className="surface-head"><div><p className="dash-kicker">Today</p><h2>Order movement</h2></div><Link href={`/dash/${store.slug}/orders`} prefetch>View all <span>↗</span></Link></div>
          {todaysOrders.length ? (
            <div className="activity-list">
              {todaysOrders.slice(0, 6).map((order) => (
                <Link href={`/dash/${store.slug}/orders`} prefetch key={order.id}>
                  <span className={`status-orb status-${order.status}`} />
                  <span><strong>Order {order.short_code}</strong><small>{formatTime(order.created_at)}</small></span>
                  <span className="status-label">{readableStatus(order.status)}</span>
                  <strong>{formatNaira(order.total_kobo)}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <div className="truthful-empty"><span>Quiet for now</span><h3>Your first verified order will appear here.</h3><p>This view updates from Supabase in real time—nothing is simulated.</p></div>
          )}
        </div>

        <aside className="dash-surface control-surface">
          <div className="surface-head"><div><p className="dash-kicker">Quick shift</p><h2>Open a workspace</h2></div></div>
          {store.roles.includes('cashier') ? <Link href={`/dash/${store.slug}/cashier`} prefetch><span>Cashier fulfilment</span><strong>Pack paid orders</strong><i>↗</i></Link> : null}
          {store.roles.includes('security') ? <Link href={`/dash/${store.slug}/security`} prefetch><span>Security gate</span><strong>Verify customer exits</strong><i>↗</i></Link> : null}
          {store.roles.includes('admin') ? <Link href={`/dash/${store.slug}/inventory`} prefetch><span>Inventory</span><strong>Review stock levels</strong><i>↗</i></Link> : null}
        </aside>
      </section>
    </div>
  )
}
