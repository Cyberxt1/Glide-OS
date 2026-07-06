import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createStore } from './actions'

export default async function SetupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/setup')

  return (
    <main className="auth-page setup-page">
      <Link className="auth-brand" href="/">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        Glide
      </Link>
      <section className="auth-panel setup-panel">
        <p className="dash-kicker">First store</p>
        <h1>Give Glide a place.</h1>
        <p>This creates the merchant and first operating branch. You can add products, staff, and your permanent store QR inside the dashboard.</p>
        <form className="auth-form" action={createStore}>
          <label><span>Store name</span><input name="name" placeholder="Genesis Supermarket" required /></label>
          <label><span>Store URL name</span><input name="slug" placeholder="genesis-supermarket" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
          <div className="auth-form-pair">
            <label><span>First branch</span><input name="location_name" placeholder="Lekki Branch" required /></label>
            <label><span>City</span><input name="city" placeholder="Lagos" /></label>
          </div>
          <label><span>Address</span><input name="address" autoComplete="street-address" /></label>
          <button type="submit">Create store workspace <span>↗</span></button>
        </form>
      </section>
      <p className="auth-footnote">Owner: {user.email}</p>
    </main>
  )
}
