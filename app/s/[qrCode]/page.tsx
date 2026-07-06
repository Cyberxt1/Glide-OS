import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ShopperExperience } from './shopper-experience'

type ScanPageProps = {
  params: Promise<{ qrCode: string }>
  searchParams: Promise<{ start?: string; cancelled?: string }>
}

export default async function ScanPage({ params, searchParams }: ScanPageProps) {
  const { qrCode } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: qr } = await supabase
    .from('qr_codes')
    .select(`
      id,
      code,
      merchant_id,
      location_id,
      merchants(name, slug),
      store_locations(name, city)
    `)
    .eq('code', qrCode)
    .eq('status', 'active')
    .maybeSingle()

  if (!qr || !qr.merchant_id || !qr.location_id) notFound()

  const admin = createAdminClient()
  const { data: qrStats } = await admin
    .from('qr_codes')
    .select('scan_count')
    .eq('id', qr.id)
    .maybeSingle()

  await admin
    .from('qr_codes')
    .update({
      scan_count: (qrStats?.scan_count ?? 0) + 1,
      last_scanned_at: new Date().toISOString(),
    })
    .eq('id', qr.id)

  const merchant = qr.merchants as unknown as { name: string; slug: string }
  const location = qr.store_locations as unknown as { name: string; city: string | null } | null
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, price_kobo, barcode')
    .eq('merchant_id', qr.merchant_id)
    .eq('is_available', true)
    .order('name')

  return (
    <ShopperExperience
      qrCode={qr.code}
      merchantId={qr.merchant_id}
      locationId={qr.location_id}
      merchant={merchant}
      location={location}
      products={(products ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        priceKobo: product.price_kobo,
        barcode: product.barcode,
      }))}
      initialStarted={query.start === '1'}
      paymentCancelled={query.cancelled === '1'}
    />
  )
}
