import { resolveAppOrigin } from '@/lib/app-url'
import { requireStoreContext } from '@/lib/store/context'
import { createClient } from '@/lib/supabase/server'
import { createStoreQr, regenerateStoreQr } from './actions'

const qrErrors: Record<string, string> = {
  access: 'Administrator access is required to manage the store QR.',
  location: 'Create a store location before generating the store QR.',
  generation: 'The store QR could not be generated right now. Try again in a moment.',
  rotation: 'The existing store QR could not be rotated right now. Try again in a moment.',
}

export default async function StoreQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>
  searchParams: Promise<{ created?: string; rotated?: string; error?: string }>
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
        <div className="head-actions">
          {!code ? (
            <form action={createStoreQr.bind(null, vendorId)}>
              <button className="page-action" type="submit">Generate store QR <span>+</span></button>
            </form>
          ) : (
            <form action={regenerateStoreQr.bind(null, vendorId)}>
              <button className="page-action" type="submit">Regenerate QR <span>&#8635;</span></button>
            </form>
          )}
        </div>
      </header>

      {query.created ? <p className="inventory-notice success">Your permanent store QR is ready for the graphics designer.</p> : null}
      {query.rotated ? <p className="inventory-notice success">A fresh store QR has been issued. Re-download it before printing or sharing.</p> : null}
      {query.error ? <p className="inventory-notice error">{qrErrors[query.error] ?? 'The store QR request could not be completed.'}</p> : null}

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
            <p>Regenerating retires the old banner code and replaces it with this new one.</p>
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
