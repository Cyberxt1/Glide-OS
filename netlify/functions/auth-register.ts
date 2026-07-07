import type { Handler } from '@netlify/functions'
import { admin, isEmail, json, readJson } from './_shared'

export const handler: Handler = async (event) => {
  try {
    const body = await readJson<{ email?: string; password?: string }>(event)
    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''

    if (!isEmail(email)) return json(400, { error: 'Enter a valid email address.' })
    if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' })

    const { error } = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return json(409, { error: 'This email already has an account. Sign in instead.' })
      }
      return json(400, { error: error.message })
    }

    return json(200, { ok: true })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Registration failed.' })
  }
}
