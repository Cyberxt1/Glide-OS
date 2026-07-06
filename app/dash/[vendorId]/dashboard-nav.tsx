'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MerchantContext, StoreRole } from '@/lib/store/types'

const navigation = [
  { label: 'Overview', path: '', icon: 'overview', roles: ['admin'] },
  { label: 'Orders', path: '/orders', icon: 'orders', roles: ['admin'] },
  { label: 'Inventory', path: '/inventory', icon: 'inventory', roles: ['admin'] },
  { label: 'Store QR', path: '/qr', icon: 'qr', roles: ['admin'] },
  { label: 'Team', path: '/team', icon: 'team', roles: ['admin'] },
  { label: 'Cashier', path: '/cashier', icon: 'cashier', roles: ['cashier'] },
  { label: 'Security gate', path: '/security', icon: 'security', roles: ['security'] },
] as const

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
    orders: <><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" /></>,
    inventory: <><path d="m4 7 8-4 8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10" /></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM18 18h2v2h-2zM14 18h2" /></>,
    team: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c.4-4 2.3-6 6-6s5.6 2 6 6M15 15c3.5 0 5.3 1.7 5.5 5" /></>,
    cashier: <><path d="M4 5h16v12H4zM8 21h8M12 17v4M7 9h5M16 9h1M7 13h10" /></>,
    security: <><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function DashboardNav({ store }: { store: MerchantContext }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const base = `/dash/${store.slug}`

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <header className="dash-mobile-header">
        <Link className="dash-wordmark" href={base} prefetch>Glide<span>Store</span></Link>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">
          <span />
          <span />
        </button>
      </header>
      <aside className={`dash-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-head">
          <Link className="dash-wordmark" href={base} prefetch>Glide<span>Store</span></Link>
          <div className="store-identity">
            <span className="store-avatar">{store.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{store.name}</strong><small>{store.location?.name ?? 'No location yet'}</small></span>
          </div>
        </div>

        <nav className="dash-nav" aria-label="Store dashboard">
          <p>Workspace</p>
          {navigation
            .filter((item) => item.roles.some((role) => store.roles.includes(role as StoreRole)))
            .map((item) => {
              const href = `${base}${item.path}`
              const active = item.path ? pathname.startsWith(href) : pathname === base
              return (
                <Link key={item.label} href={href} prefetch className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                  <NavIcon name={item.icon} />
                  {item.label}
                  {item.path === '/cashier' ? <i className="live-dot" /> : null}
                </Link>
              )
            })}
        </nav>

        <div className="sidebar-foot">
          <div><span className="system-pulse" /><span><strong>Systems online</strong><small>Realtime connected</small></span></div>
          <button type="button" onClick={signOut}>Sign out <span>↗</span></button>
        </div>
      </aside>
      {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
    </>
  )
}
