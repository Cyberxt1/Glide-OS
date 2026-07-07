import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type MerchantRow = {
  id: string
  slug: string
  name: string
}

type QrRow = {
  code: string
  merchant_id: string | null
  merchants: MerchantRow | MerchantRow[] | null
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function merchantFromQr(row: QrRow) {
  return Array.isArray(row.merchants) ? row.merchants[0] : row.merchants
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = normalize(url.searchParams.get('q') ?? '')

  if (query.length < 2) {
    return NextResponse.json({ error: 'Type at least 2 characters.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: exactQr } = await supabase
    .from('qr_codes')
    .select('code, merchant_id, merchants(id, slug, name)')
    .eq('status', 'active')
    .ilike('code', query)
    .limit(1)
    .maybeSingle()

  if (exactQr) {
    const merchant = merchantFromQr(exactQr as unknown as QrRow)
    return NextResponse.json({
      storeName: merchant?.name ?? 'Partner store',
      storeSlug: merchant?.slug ?? null,
      shoppingUrl: `/s/${exactQr.code}${exactQr.merchant_id ? `?vendor_id=${exactQr.merchant_id}` : ''}`,
    })
  }

  const { data: matches } = await supabase
    .from('qr_codes')
    .select('code, merchant_id, merchants!inner(id, slug, name)')
    .eq('status', 'active')
    .or(`slug.ilike.%${query}%,name.ilike.%${query}%`, { referencedTable: 'merchants' })
    .limit(1)

  const match = (matches?.[0] ?? null) as unknown as QrRow | null
  const merchant = match ? merchantFromQr(match) : null

  if (!match || !merchant) {
    return NextResponse.json({ error: 'No active Glide store matched that name or code.' }, { status: 404 })
  }

  return NextResponse.json({
    storeName: merchant.name,
    storeSlug: merchant.slug,
    shoppingUrl: `/s/${match.code}${match.merchant_id ? `?vendor_id=${match.merchant_id}` : ''}`,
  })
}
