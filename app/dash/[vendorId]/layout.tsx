import type { ReactNode } from 'react'
import { requireStoreContext } from '@/lib/store/context'
import { DashboardNav } from './dashboard-nav'
import './dashboard.css'

export default async function StoreDashboardLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = await params
  const store = await requireStoreContext(vendorId)

  return (
    <div
      className="dashboard-frame"
      style={{ '--store-accent': store.primaryColor } as React.CSSProperties}
    >
      <DashboardNav store={store} />
      <main className="dashboard-main">{children}</main>
    </div>
  )
}
