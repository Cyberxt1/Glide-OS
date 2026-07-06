import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { StoreRole } from '@/lib/store/types'

const allowedTransitions: Record<string, { next: string[]; roles: StoreRole[] }> = {
  paid: { next: ['preparing', 'ready_for_exit'], roles: ['admin', 'cashier'] },
  preparing: { next: ['ready_for_exit'], roles: ['admin', 'cashier'] },
  ready_for_exit: { next: ['exited'], roles: ['admin', 'security'] },
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const body = (await request.json().catch(() => null)) as { status?: string } | null
  const nextStatus = body?.status

  if (!nextStatus) {
    return NextResponse.json({ error: 'A target status is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, merchant_id, status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  const transition = allowedTransitions[order.status]
  if (!transition?.next.includes(nextStatus)) {
    return NextResponse.json({ error: 'That order transition is not allowed.' }, { status: 409 })
  }

  const { data: merchant } = await supabase
    .from('merchants')
    .select('owner_id')
    .eq('id', order.merchant_id)
    .single()

  let roles: StoreRole[] = merchant?.owner_id === user.id ? ['admin'] : []
  let staffId: string | null = null

  if (!roles.length) {
    const { data: staff } = await supabase
      .from('merchant_staff')
      .select('id, roles')
      .eq('merchant_id', order.merchant_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    roles = (staff?.roles ?? []) as StoreRole[]
    staffId = staff?.id ?? null
  }

  if (!roles.some((role) => transition.roles.includes(role))) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const update: Record<string, string | null> = { status: nextStatus }

  if (nextStatus === 'preparing') {
    update.preparing_at = now
    update.cashier_staff_id = staffId
  }
  if (nextStatus === 'ready_for_exit') {
    update.ready_at = now
    update.cashier_staff_id = staffId
    update.exit_token = randomBytes(3).toString('hex').toUpperCase()
  }
  if (nextStatus === 'exited') {
    update.exited_at = now
    update.security_staff_id = staffId
  }

  const { error } = await supabase.from('orders').update(update).eq('id', orderId)

  if (error) {
    return NextResponse.json({ error: 'The order update was rejected.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
