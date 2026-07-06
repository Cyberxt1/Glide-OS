import { resolveAppOrigin } from '@/lib/app-url'
import { requireStoreContext } from '@/lib/store/context'
import { createClient } from '@/lib/supabase/server'
import { createStoreQr } from './actions'

export default async function StoreQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>
  searchParams: Promise<{ created?: string; error?: string }>
}) {
  const { vendorId } = await params
  const query = await searchParams
  const store = await requireStoreContext(vendorId)
  const supabase = await createClient()
  const { data: code } = await supabase
    .from('qr_codes')
    .select('code, scan_count, created_at')
    .eq('merchant_id', store.id)
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const appOrigin = await resolveAppOrigin()
  const destination = code ? `${appOrigin}/s/${code.code}` : ''
  const encodedDestination = encodeURIComponent(destination)

  return (
    <div className="dash-page">
      <header className="page-head compact">
        <div>
          <p className="dash-kicker">Store entrance</p>
          <h1>Store QR</h1>
          <p>One permanent QR for your "Skip the queue here" banner.</p>
        </div>
        {!code ? (
          <form action={createStoreQr.bind(null, vendorId)}>
            <button className="page-action" type="submit">Generate store QR <span>+</span></button>
          </form>
        ) : null}
      </header>

      {query.created ? <p className="inventory-notice success">Your permanent store QR is ready for the graphics designer.</p> : null}
      {query.error ? <p className="inventory-notice error">The store QR could not be generated. Confirm that this store has a location.</p> : null}

      {code ? (
        <section className="store-qr-layout">
          <div className="store-qr-preview">
            <img src={`/api/barcode?type=qr&text=${encodedDestination}`} alt={`${store.name} store QR code`} />
          </div>
          <div className="store-qr-copy">
            <p className="dash-kicker">Permanent store code</p>
            <h2>Ready for the banner.</h2>
            <p>This QR always opens Glide at {store.name}. It is not tied to a shelf, aisle, or individual product.</p>
            <dl>
              <div><dt>Destination</dt><dd>{destination}</dd></div>
              <div><dt>Scans recorded</dt><dd>{code.scan_count}</dd></div>
              <div><dt>Identifier</dt><dd>{code.code}</dd></div>
            </dl>
            <div className="qr-downloads">
              <a href={`/api/barcode?type=qr&format=svg&text=${encodedDestination}`} download={`${store.slug}-glide-qr.svg`}>Download SVG <span>Best for design</span></a>
              <a href={`/api/barcode?type=qr&text=${encodedDestination}`} download={`${store.slug}-glide-qr.png`}>Download PNG <span>High resolution</span></a>
            </div>
          </div>
        </section>
      ) : (
        <section className="truthful-empty dash-surface wide">
          <span>No store QR yet</span>
          <h3>Generate it once. Use it everywhere in this store.</h3>
          <p>Your designer can place the downloaded SVG on a large banner without losing quality.</p>
        </section>
      )}
    </div>
  )
}
