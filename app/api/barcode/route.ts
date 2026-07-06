import * as bwipjs from 'bwip-js/node'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const text = url.searchParams.get('text')?.trim() ?? ''
  const type = url.searchParams.get('type') === 'qr' ? 'qrcode' : 'code128'
  const format = url.searchParams.get('format') === 'svg' ? 'svg' : 'png'

  if (!text || text.length > 240) {
    return NextResponse.json({ error: 'Invalid barcode value.' }, { status: 400 })
  }

  try {
    const options: Parameters<typeof bwipjs.toSVG>[0] = {
      bcid: type,
      text,
      scale: type === 'qrcode' ? 5 : 3,
      includetext: type === 'code128',
      textxalign: 'center',
      backgroundcolor: 'FFFFFF',
      ...(type === 'code128' ? { height: 14 } : {}),
    }

    if (format === 'svg') {
      const svg = bwipjs.toSVG(options)
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const buffer = await bwipjs.toBuffer(options)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Barcode could not be rendered.' }, { status: 400 })
  }
}
