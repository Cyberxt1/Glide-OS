export function formatNaira(kobo: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format((kobo || 0) / 100)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function readableStatus(status: string) {
  return status.replaceAll('_', ' ')
}

export function orderShortCode(orderId: string) {
  return orderId.replaceAll('-', '').slice(0, 6).toUpperCase()
}

export function orderPurchaseCode(orderId: string) {
  return `GLD-${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`
}
