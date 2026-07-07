import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigate, type StoreTab } from '../lib/route'
import { formatDateTime, formatNaira, formatTime, orderPurchaseCode, orderShortCode, readableStatus } from '../lib/format'
import { authJsonHeaders } from '../lib/api'
import { getMerchantContext, getUser, resolveDefaultDashboard } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { MerchantContext, Order, Product } from '../lib/types'

export function DashboardEntry() {
  const [message, setMessage] = useState('Opening dashboard...')

  useEffect(() => {
    getUser()
      .then(async (user) => {
        if (!user) navigate('/login')
        else navigate(await resolveDefaultDashboard(user))
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Dashboard could not open.'))
  }, [])

  return <main className="simple-page"><section><p>{message}</p></section></main>
}

export function StoreDashboard({ vendorId, tab }: { vendorId: string; tab: StoreTab }) {
  const [store, setStore] = useState<MerchantContext | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMerchantContext(vendorId).then(setStore).catch((caught) => {
      setError(caught instanceof Error ? caught.message : 'Store could not load.')
    })
  }, [vendorId])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (error) return <main className="simple-page"><section><h1>{error}</h1><a href="/login">Sign in</a></section></main>
  if (!store) return <main className="simple-page"><section><p>Loading store...</p></section></main>

  return (
    <main className="dash-app" style={{ '--accent': store.primaryColor } as React.CSSProperties}>
      <aside className="dash-nav">
        <a className="brand" href="/"><span className="mark" /> Glide</a>
        <strong>{store.name}</strong>
        <nav>
          <a className={tab === 'overview' ? 'active' : ''} href={`/dash/${store.slug}`}>Overview</a>
          <a className={tab === 'inventory' ? 'active' : ''} href={`/dash/${store.slug}/inventory`}>Inventory</a>
          <a className={tab === 'orders' ? 'active' : ''} href={`/dash/${store.slug}/orders`}>Orders</a>
          <a className={tab === 'qr' ? 'active' : ''} href={`/dash/${store.slug}/qr`}>Store QR</a>
          <a className={tab === 'cashier' ? 'active' : ''} href={`/dash/${store.slug}/cashier`}>Cashier</a>
          <a className={tab === 'security' ? 'active' : ''} href={`/dash/${store.slug}/security`}>Security</a>
          <a className={tab === 'team' ? 'active' : ''} href={`/dash/${store.slug}/team`}>Team</a>
        </nav>
        <button onClick={signOut}>Sign out</button>
      </aside>
      <section className="dash-main">
        {tab === 'overview' ? <Overview store={store} /> : null}
        {tab === 'inventory' ? <Inventory store={store} /> : null}
        {tab === 'orders' ? <Orders store={store} /> : null}
        {tab === 'qr' ? <QrPage store={store} /> : null}
        {tab === 'cashier' ? <Operations store={store} role="cashier" /> : null}
        {tab === 'security' ? <Operations store={store} role="security" /> : null}
        {tab === 'team' ? <Team store={store} /> : null}
      </section>
    </main>
  )
}

function Overview({ store }: { store: MerchantContext }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [lowStock, setLowStock] = useState(0)

  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    void Promise.all([
      supabase.from('orders').select('id, status, total_kobo, created_at, paid_at').eq('merchant_id', store.id).gte('created_at', today.toISOString()).order('created_at', { ascending: false }),
      supabase.from('location_inventory').select('quantity, low_stock_threshold').eq('merchant_id', store.id),
    ]).then(([ordersResult, stockResult]) => {
      setOrders((ordersResult.data ?? []) as Order[])
      setLowStock((stockResult.data ?? []).filter((row) => row.quantity <= row.low_stock_threshold).length)
    })
  }, [store.id])

  const revenue = orders.filter((order) => ['paid', 'preparing', 'ready_for_exit', 'exited'].includes(order.status)).reduce((sum, order) => sum + order.total_kobo, 0)
  const ready = orders.filter((order) => order.status === 'ready_for_exit').length

  return (
    <>
      <PageHead title={`Good day, ${store.name}.`} copy={store.location ? store.location.name : 'Add a store location to begin trading.'} />
      <div className="metrics">
        <article><span>Revenue today</span><strong>{formatNaira(revenue)}</strong></article>
        <article><span>Orders today</span><strong>{orders.length}</strong></article>
        <article><span>Ready for exit</span><strong>{ready}</strong></article>
        <article><span>Low stock</span><strong>{lowStock}</strong></article>
      </div>
      <section className="surface">
        <div className="surface-head"><h2>Order movement</h2><a href={`/dash/${store.slug}/orders`}>View all</a></div>
        <div className="list">
          {orders.slice(0, 6).map((order) => (
            <article key={order.id} className="row">
              <strong>#{orderShortCode(order.id)}</strong>
              <span>{readableStatus(order.status)}</span>
              <span>{formatTime(order.created_at)}</span>
              <strong>{formatNaira(order.total_kobo)}</strong>
            </article>
          ))}
          {!orders.length ? <Empty title="Quiet for now" copy="Your first verified order will appear here." /> : null}
        </div>
      </section>
    </>
  )
}

function Inventory({ store }: { store: MerchantContext }) {
  const [products, setProducts] = useState<Product[]>([])
  const [message, setMessage] = useState('')
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() =>
    supabase
      .from('products')
      .select('id, name, sku, barcode, category, price_kobo, is_available, tracks_inventory, location_inventory(quantity, low_stock_threshold)')
      .eq('merchant_id', store.id)
      .order('name')
      .then(({ data }) => setProducts((data ?? []) as Product[])), [store.id])

  useEffect(() => {
    void load()
  }, [load])

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const price = Math.round(Number(form.get('price')) * 100)
    const quantity = Math.max(0, Number(form.get('quantity')) || 0)
    const response = await fetch('/api/product-create', {
      method: 'POST',
      headers: await authJsonHeaders(),
      body: JSON.stringify({
        vendorId: store.slug,
        name: String(form.get('name') ?? '').trim(),
        barcode: String(form.get('barcode') || '') || null,
        sku: String(form.get('sku') || '') || null,
        category: String(form.get('category') || '') || null,
        priceKobo: price,
        quantity,
      }),
    })
    const result = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) return setMessage(result?.error ?? 'Product could not be created.')
    setMessage('Product added.')
    await load()
    event.currentTarget.reset()
  }

  async function importCsv(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const response = await fetch('/api/products-import', {
      method: 'POST',
      headers: await authJsonHeaders(),
      body: JSON.stringify({ vendorId: store.slug, csv }),
    })
    const result = (await response.json().catch(() => null)) as { imported?: number; error?: string } | null
    setBusy(false)
    if (!response.ok) return setMessage(result?.error ?? 'Import failed.')
    setCsv('')
    setMessage(`${result?.imported ?? 0} products imported.`)
    await load()
  }

  return (
    <>
      <PageHead title="Inventory" copy="Add products, import CSVs, and keep stock real." />
      <section className="grid-two">
        <form className="surface form" onSubmit={addProduct}>
          <h2>Add product</h2>
          <input name="name" placeholder="Product name" required />
          <input name="barcode" placeholder="Barcode" />
          <input name="price" type="number" step="0.01" min="0" placeholder="Price (NGN)" required />
          <input name="quantity" type="number" min="0" placeholder="Opening stock" />
          <input name="sku" placeholder="SKU" />
          <input name="category" placeholder="Category" />
          <button className="button primary">Create product</button>
        </form>
        <form className="surface form" onSubmit={importCsv}>
          <h2>Smart CSV import</h2>
          <p>Accepts name/product/item, price/selling price, qty/stock, barcode/ean/upc, category/department, sku.</p>
          <textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="Paste CSV rows here" rows={9} />
          <button className="button primary" disabled={busy}>{busy ? 'Importing...' : 'Import products'}</button>
        </form>
      </section>
      {message ? <p className="notice">{message}</p> : null}
      <section className="surface">
        <div className="surface-head"><h2>{products.length} products</h2><span>{store.location?.name ?? 'All locations'}</span></div>
        <div className="list">
          {products.map((product) => {
            const quantity = product.location_inventory?.reduce((sum, stock) => sum + stock.quantity, 0) ?? 0
            return <article className="row" key={product.id}><strong>{product.name}</strong><span>{product.barcode ?? '-'}</span><span>{quantity} in stock</span><strong>{formatNaira(product.price_kobo)}</strong></article>
          })}
          {!products.length ? <Empty title="Inventory is empty" copy="Add or import your real catalog." /> : null}
        </div>
      </section>
    </>
  )
}

function Orders({ store }: { store: MerchantContext }) {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    void supabase
      .from('orders')
      .select('id, status, total_kobo, created_at, paid_at, store_locations(name)')
      .eq('merchant_id', store.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as unknown as Order[]))
  }, [store.id])

  return (
    <>
      <PageHead title="Orders" copy="Every payment and operational handoff in one place." />
      <section className="surface">
        <div className="list">
          {orders.map((order) => <article className="row" key={order.id}><strong>#{orderShortCode(order.id)}</strong><span>{readableStatus(order.status)}</span><span>{formatDateTime(order.created_at)}</span><strong>{formatNaira(order.total_kobo)}</strong></article>)}
          {!orders.length ? <Empty title="No orders yet" copy="Successful payments will populate this table." /> : null}
        </div>
      </section>
    </>
  )
}

function Operations({ store, role }: { store: MerchantContext; role: 'cashier' | 'security' }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  const statuses = useMemo(() => role === 'cashier' ? ['paid', 'preparing'] : ['ready_for_exit'], [role])
  const load = useCallback(() =>
    supabase
      .from('orders')
      .select('id, status, total_kobo, created_at, paid_at, order_items(id, product_name, quantity, unit_price_kobo)')
      .eq('merchant_id', store.id)
      .in('status', statuses)
      .order('created_at', { ascending: true })
      .then(({ data }) => setOrders((data ?? []) as Order[])), [store.id, statuses])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase()
    if (!needle) return orders
    return orders.filter((order) => orderShortCode(order.id).includes(needle) || orderPurchaseCode(order.id).includes(needle))
  }, [orders, query])

  async function advance(order: Order) {
    const nextStatus = role === 'security' ? 'exited' : order.status === 'paid' ? 'preparing' : 'ready_for_exit'
    const response = await fetch(`/api/orders-status?id=${order.id}`, {
      method: 'PATCH',
      headers: await authJsonHeaders(),
      body: JSON.stringify({ status: nextStatus }),
    })
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      setMessage(result?.error ?? 'Order could not be updated.')
      return
    }
    setMessage('Order updated.')
    await load()
  }

  return (
    <>
      <PageHead title={role === 'cashier' ? 'Cashier queue' : 'Security gate'} copy={role === 'cashier' ? 'Pack paid orders and release them to the gate.' : 'Verify receipt tokens and clear exits.'} />
      <div className="ops-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scan or enter code" /><button>Verify</button></div>
      {message ? <p className="notice">{message}</p> : null}
      <section className="ops-grid">
        {visible.map((order) => (
          <article className="surface order-card" key={order.id}>
            <header><strong>#{orderShortCode(order.id)}</strong><span>{formatTime(order.paid_at ?? order.created_at)}</span></header>
            <p>{orderPurchaseCode(order.id)}</p>
            <strong>{formatNaira(order.total_kobo)}</strong>
            <div className="order-lines">{order.order_items?.map((item) => <span key={item.id}>{item.quantity}x {item.product_name}</span>)}</div>
            <a href={`/receipt/${order.id}`} target="_blank" rel="noreferrer">Open receipt</a>
            <button className="button primary" onClick={() => void advance(order)}>{role === 'security' ? 'Confirm exit' : order.status === 'paid' ? 'Start packing' : 'Ready for exit'}</button>
          </article>
        ))}
        {!visible.length ? <Empty title="Queue is clear" copy="New activity will appear here." /> : null}
      </section>
    </>
  )
}

function QrPage({ store }: { store: MerchantContext }) {
  const [qr, setQr] = useState<{ code: string } | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('qr_codes').select('code').eq('merchant_id', store.id).eq('status', 'active').limit(1).maybeSingle()
    setQr(data)
  }, [store.id])

  useEffect(() => {
    void load()
  }, [load])

  async function createQr() {
    const response = await fetch('/api/qr-create', {
      method: 'POST',
      headers: await authJsonHeaders(),
      body: JSON.stringify({ vendorId: store.slug }),
    })
    const result = (await response.json().catch(() => null)) as { code?: string; error?: string } | null
    if (!response.ok) return setMessage(result?.error ?? 'QR could not be created.')
    await load()
  }

  const url = qr ? `${window.location.origin}/s/${qr.code}?vendor_id=${store.id}` : ''

  return (
    <>
      <PageHead title="Store QR" copy="One active QR opens the customer checkout flow." />
      <section className="surface qr-panel">
        {qr ? <><img src={`/api/barcode?type=qr&format=svg&text=${encodeURIComponent(url)}`} alt="Store QR" /><strong>{url}</strong></> : <button className="button primary" onClick={() => void createQr()}>Create active QR</button>}
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </>
  )
}

function Team({ store }: { store: MerchantContext }) {
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/team-create', {
      method: 'POST',
      headers: await authJsonHeaders(),
      body: JSON.stringify({
        vendorId: store.slug,
        displayName: form.get('displayName'),
        email: form.get('email'),
        password: form.get('password'),
        roles: form.getAll('roles'),
      }),
    })
    const result = (await response.json().catch(() => null)) as { error?: string } | null
    setMessage(response.ok ? 'Team member created.' : result?.error ?? 'Team member could not be created.')
    if (response.ok) event.currentTarget.reset()
  }

  return (
    <>
      <PageHead title="Team" copy="Create staff logins for cashier and security work." />
      <form className="surface form" onSubmit={submit}>
        <input name="displayName" placeholder="Full name" required />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" minLength={8} placeholder="Temporary password" required />
        <label className="check"><input type="checkbox" name="roles" value="cashier" defaultChecked /> Cashier</label>
        <label className="check"><input type="checkbox" name="roles" value="security" /> Security</label>
        <button className="button primary">Create staff login</button>
      </form>
      {message ? <p className="notice">{message}</p> : null}
    </>
  )
}

function PageHead({ title, copy }: { title: string; copy: string }) {
  return <header className="page-head-lite"><p className="kicker">Glide operations</p><h1>{title}</h1><p>{copy}</p></header>
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return <div className="empty"><strong>{title}</strong><span>{copy}</span></div>
}
