'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

type LookupResult = {
  storeName?: string
  shoppingUrl?: string
  error?: string
}

export function StoreLookup() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setMessage('Type at least 2 characters.')
      return
    }

    setPending(true)
    setMessage('')

    const response = await fetch(`/api/stores/lookup?q=${encodeURIComponent(trimmed)}`, {
      cache: 'no-store',
    })
    const result = (await response.json().catch(() => null)) as LookupResult | null

    if (!response.ok || !result?.shoppingUrl) {
      setPending(false)
      setMessage(result?.error ?? 'No active Glide store matched that name or code.')
      return
    }

    setMessage(`Opening ${result.storeName ?? 'partner store'}...`)
    router.push(result.shoppingUrl)
  }

  return (
    <form className="consumer-search-card" onSubmit={submitLookup}>
      <label htmlFor="store-route-search">Standing in a partner store right now without a QR code reader?</label>
      <div className="consumer-search-row">
        <input
          id="store-route-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setMessage('')
          }}
          placeholder="Type Store Name or Code (e.g., Campus Kitchen)..."
          autoComplete="off"
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Checking...' : 'Find Store'}
        </button>
      </div>
      {message ? <p>{message}</p> : null}
    </form>
  )
}
