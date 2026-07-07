import { useEffect, useState } from 'react'
import { parseRoute, type Route } from './lib/route'
import { HomePage } from './pages/HomePage'
import { AuthPage } from './pages/AuthPage'
import { SetupPage } from './pages/SetupPage'
import { DashboardEntry, StoreDashboard } from './pages/Dashboard'
import { ShopperPage } from './pages/ShopperPage'
import { PaymentPage } from './pages/PaymentPage'
import { ReceiptPage } from './pages/ReceiptPage'
import { LegalPage } from './pages/LegalPage'

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())

  useEffect(() => {
    const sync = () => setRoute(parseRoute())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (route.name === 'home') return <HomePage />
  if (route.name === 'login') return <AuthPage mode="login" />
  if (route.name === 'register') return <AuthPage mode="register" />
  if (route.name === 'setup') return <SetupPage />
  if (route.name === 'dash') return <DashboardEntry />
  if (route.name === 'store') return <StoreDashboard vendorId={route.vendorId} tab={route.tab} />
  if (route.name === 'shop') return <ShopperPage qrCode={route.qrCode} />
  if (route.name === 'pay') return <PaymentPage token={route.token} />
  if (route.name === 'receipt') return <ReceiptPage token={route.token} />
  if (route.name === 'legal') return <LegalPage page={route.page} />

  return <HomePage />
}
