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

## Paystack webhook

After deploying, add this URL in the Paystack Dashboard:

`https://YOUR_NETLIFY_DOMAIN/api/paystack/webhook`

Set `PAYSTACK_SECRET_KEY` and `SUPABASE_SECRET_KEY` in Netlify environment
variables. Paystack signs webhook events with the Paystack secret key; there is
no separate webhook secret.
"# Glide-OS" 
