import { PaymentStatus } from './payment-status'

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptToken: string }>
  searchParams: Promise<{ reference?: string; trxref?: string; cancelled?: string }>
}) {
  const { receiptToken } = await params
  const query = await searchParams
  const reference = query.reference ?? query.trxref ?? ''

  return (
    <PaymentStatus
      cancelled={query.cancelled === '1'}
      receiptToken={receiptToken}
      reference={reference}
    />
  )
}
