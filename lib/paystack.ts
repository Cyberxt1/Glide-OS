import 'server-only'

export type PaystackCharge = {
  status?: string
  reference?: string
  amount?: number
  currency?: string
  paid_at?: string | null
}

type PaystackInitializeResponse = {
  status: boolean
  message?: string
  data?: {
    authorization_url?: string
    access_code?: string
    reference?: string
  }
}

type PaystackVerificationResponse = {
  status: boolean
  data?: PaystackCharge
}

export async function initializeTransaction({
  secret,
  email,
  amount,
  reference,
  callbackUrl,
  metadata,
}: {
  secret: string
  email: string
  amount: number
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}) {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: String(amount),
      currency: 'NGN',
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
    cache: 'no-store',
  })

  if (!response.ok) return null
  return (await response.json()) as PaystackInitializeResponse
}

export async function verifyTransaction(reference: string, secret: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    },
  )

  if (!response.ok) return null
  return (await response.json()) as PaystackVerificationResponse
}
