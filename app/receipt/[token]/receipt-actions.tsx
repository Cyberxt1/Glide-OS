'use client'

import Link from 'next/link'

export function ReceiptActions() {
  return (
    <div className="receipt-actions">
      <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
      <Link href="/">Done</Link>
    </div>
  )
}
