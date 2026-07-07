import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type LoginBody = {
  email?: string
  password?: string
  nextPath?: string
}

function safeNextPath(value: string | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dash'
}

function readableSignInError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return 'This account exists, but the email has not been confirmed. For local testing, create the account again after this update or confirm it in Supabase.'
  }

  if (normalized.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }

  return message || 'Sign-in could not be completed. Please retry.'
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  const nativeFormPost = contentType.includes('application/x-www-form-urlencoded')
  const body = nativeFormPost
    ? await request.formData().then((formData) => ({
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        nextPath: String(formData.get('nextPath') ?? ''),
      }))
    : ((await request.json().catch(() => null)) as LoginBody | null)

  const email = body?.email?.trim().toLowerCase()
  const password = body?.password ?? ''
  const nextPath = safeNextPath(body?.nextPath)

  if (!email || !email.includes('@') || !password) {
    if (nativeFormPost) {
      return NextResponse.redirect(new URL('/login?error=credentials', request.url), 303)
    }
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (nativeFormPost) {
      return NextResponse.redirect(new URL('/login?error=credentials', request.url), 303)
    }
    return NextResponse.json({ error: readableSignInError(error.message) }, { status: 401 })
  }

  if (nativeFormPost) {
    return NextResponse.redirect(new URL(nextPath, request.url), 303)
  }

  return NextResponse.json({ ok: true, nextPath })
}
