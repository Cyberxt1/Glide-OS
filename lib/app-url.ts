import 'server-only'

import { headers } from 'next/headers'

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export async function resolveAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const shouldTrustConfiguredOrigin =
    configuredOrigin &&
    (process.env.NODE_ENV !== 'production' || !configuredOrigin.includes('localhost'))

  if (shouldTrustConfiguredOrigin) {
    return normalizeOrigin(configuredOrigin)
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host?.includes('localhost') ? 'http' : 'https')

  if (host) {
    return `${protocol}://${host}`
  }

  return normalizeOrigin(configuredOrigin || 'http://localhost:3000')
}
