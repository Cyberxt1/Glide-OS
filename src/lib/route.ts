export type Route =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'setup' }
  | { name: 'dash' }
  | { name: 'store'; vendorId: string; tab: StoreTab }
  | { name: 'shop'; qrCode: string }
  | { name: 'pay'; token: string }
  | { name: 'receipt'; token: string }
  | { name: 'legal'; page: 'privacy' | 'terms' | 'docs' }

export type StoreTab = 'overview' | 'inventory' | 'orders' | 'cashier' | 'security' | 'team' | 'qr'

export function parseRoute(pathname = window.location.pathname): Route {
  const parts = pathname.split('/').filter(Boolean)

  if (!parts.length) return { name: 'home' }
  if (parts[0] === 'login') return { name: 'login' }
  if (parts[0] === 'register') return { name: 'register' }
  if (parts[0] === 'setup') return { name: 'setup' }
  if (parts[0] === 'privacy' || parts[0] === 'terms' || parts[0] === 'docs') {
    return { name: 'legal', page: parts[0] }
  }
  if (parts[0] === 's' && parts[1]) return { name: 'shop', qrCode: parts[1] }
  if (parts[0] === 'pay' && parts[1]) return { name: 'pay', token: parts[1] }
  if (parts[0] === 'receipt' && parts[1]) return { name: 'receipt', token: parts[1] }
  if (parts[0] === 'dash' && !parts[1]) return { name: 'dash' }
  if (parts[0] === 'dash' && parts[1]) {
    const tab = (parts[2] || 'overview') as StoreTab
    return { name: 'store', vendorId: parts[1], tab }
  }

  return { name: 'home' }
}

export function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
