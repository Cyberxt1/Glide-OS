# Glide

Glide is a multi-merchant retail operating system and queue-free checkout PWA.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, RLS, and Realtime
- Paystack payments
- Netlify hosting

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add the values from the Supabase project Connect dialog.
3. Run `npm install`.
4. Run `npm run dev`.

The database schema is in `supabase/glide_schema.sql`.

## Netlify deployment

Push this repo to GitHub, then create a new Netlify site from that repository.

Use these Netlify settings:

- Base directory: leave empty
- Build command: `npm run build`
- Publish directory: leave empty

Add these environment variables in Netlify before the first production deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `PAYSTACK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY` (optional)
- `RECEIPT_FROM_EMAIL` (optional)

Set `NEXT_PUBLIC_APP_URL` to your live Netlify domain after the site is created,
for example `https://glide-os.netlify.app`, then trigger a fresh deploy.

## Supabase auth settings

After Netlify gives you the live domain, update Supabase Auth:

- Site URL: `https://YOUR_NETLIFY_DOMAIN`
- Redirect URL: `https://YOUR_NETLIFY_DOMAIN/auth/confirm`

## Paystack webhook

After deploying, add this webhook URL in the Paystack Dashboard:

`https://YOUR_NETLIFY_DOMAIN/api/paystack/webhook`

Paystack signs webhook events with `PAYSTACK_SECRET_KEY`; there is no separate
webhook secret.
