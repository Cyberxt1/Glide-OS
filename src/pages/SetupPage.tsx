import { useState } from 'react'
import { navigate } from '../lib/route'
import { requireUser } from '../lib/store'
import { supabase } from '../lib/supabase'

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function SetupPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const user = await requireUser()
      const finalSlug = slugify(slug || name)
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .insert({ owner_id: user.id, name, slug: finalSlug })
        .select('id, slug')
        .single()
      if (merchantError || !merchant) throw merchantError ?? new Error('Store could not be created.')

      const { error: locationError } = await supabase.from('store_locations').insert({
        merchant_id: merchant.id,
        name: location,
        city: city || null,
      })
      if (locationError) throw locationError

      navigate(`/dash/${merchant.slug}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup failed.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-page-lite">
      <a className="brand" href="/"><span className="mark" /> Glide</a>
      <form className="auth-card" onSubmit={submit}>
        <p className="kicker">First store</p>
        <h1>Give Glide a place.</h1>
        <label><span>Store name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label><span>Store URL name</span><input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={slugify(name)} /></label>
        <label><span>First branch</span><input value={location} onChange={(event) => setLocation(event.target.value)} required /></label>
        <label><span>City</span><input value={city} onChange={(event) => setCity(event.target.value)} /></label>
        {error ? <p className="form-message">{error}</p> : null}
        <button className="button primary" disabled={busy}>{busy ? 'Creating...' : 'Create store workspace'}</button>
      </form>
    </main>
  )
}
