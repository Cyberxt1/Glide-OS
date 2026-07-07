import * as bwipjs from 'bwip-js/node'
import type { Handler, HandlerResponse } from '@netlify/functions'

function textResponse(statusCode: number, body: string): HandlerResponse {
  return { statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body }
}

export const handler: Handler = async (event) => {
  const text = event.queryStringParameters?.text?.trim() ?? ''
  const type = event.queryStringParameters?.type === 'qr' ? 'qrcode' : 'code128'
  const format = event.queryStringParameters?.format === 'svg' ? 'svg' : 'png'
  if (!text || text.length > 240) return textResponse(400, 'Invalid barcode value.')
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
      return { statusCode: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }, body: bwipjs.toSVG(options) }
    }
    const buffer = await bwipjs.toBuffer(options)
    return { statusCode: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' }, body: buffer.toString('base64'), isBase64Encoded: true }
  } catch {
    return textResponse(400, 'Barcode could not be rendered.')
  }
}
