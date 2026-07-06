import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RegistrationBody = {
  email?: string
  password?: string
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  const nativeFormPost = contentType.includes('application/x-www-form-urlencoded')
  let body: RegistrationBody | null = null

  if (nativeFormPost || contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    body = {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    }
  } else {
    body = (await request.json().catch(() => null)) as RegistrationBody | null
  }

  function errorResponse(message: string, status: number) {
    if (nativeFormPost) {
      return NextResponse.redirect(new URL('/register?error=registration', request.url), 303)
    }
    return NextResponse.json({ error: message }, { status })
  }

  const email = body?.email?.trim().toLowerCase()
  const password = body?.password ?? ''

  if (!email || !email.includes('@')) {
    return errorResponse('Enter a valid email address.', 400)
  }

  if (password.length < 8) {
    return errorResponse('Your password must contain at least 8 characters.', 400)
  }

  const supabase = await createClient()
  const confirmationUrl = new URL('/auth/confirm?next=/setup', request.url).toString()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmationUrl,
    },
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('email rate limit')) {
      return errorResponse(
        'Supabase has paused confirmation emails. Disable Confirm email for testing or configure custom SMTP.',
        429,
      )
    }
    if (message.includes('already registered') || message.includes('already exists')) {
      return errorResponse('This email already has an account. Sign in instead.', 409)
    }
    return errorResponse(error.message, 400)
  }

  if (!data.user) {
    return errorResponse('Supabase did not create the account. Please try again.', 502)
  }

  if (nativeFormPost) {
    const destination = data.session ? '/setup' : '/register?status=check-email'
    return NextResponse.redirect(new URL(destination, request.url), 303)
  }

  return NextResponse.json({
    ok: true,
    requiresConfirmation: !data.session,
  })
}
