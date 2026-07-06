-- Glide production-shaped MVP schema
-- Empty by design: merchants, staff, products, and stock are created in Glide.

create extension if not exists pgcrypto;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  logo_url text,
  primary_color text not null default '#C8FF48',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchants_slug_format
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint merchants_primary_color_format
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  address text,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, name)
);

create table if not exists public.store_zones (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.store_locations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, name)
);

create table if not exists public.merchant_staff (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid references public.store_locations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  staff_code text not null,
  pin_hash text,
  roles text[] not null default array['cashier']::text[],
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, staff_code),
  constraint merchant_staff_roles_valid check (
    cardinality(roles) > 0
    and roles <@ array['admin', 'cashier', 'security']::text[]
  )
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  merchant_id uuid references public.merchants(id) on delete set null,
  location_id uuid references public.store_locations(id) on delete set null,
  zone_id uuid references public.store_zones(id) on delete set null,
  status text not null default 'unassigned'
    check (status in ('unassigned', 'active', 'disabled')),
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  last_scanned_at timestamptz,
  scan_count bigint not null default 0 check (scan_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_qr_has_assignment check (
    status <> 'active'
    or (merchant_id is not null and location_id is not null and activated_at is not null)
  ),
  constraint qr_code_format check (code ~ '^qr_[a-zA-Z0-9_-]{3,48}$')
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  sku text,
  barcode text,
  name text not null,
  description text,
  price_kobo integer not null check (price_kobo >= 0),
  image_url text,
  category text,
  is_available boolean not null default true,
  tracks_inventory boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, name),
  unique (merchant_id, sku),
  unique (merchant_id, barcode)
);

create table if not exists public.location_inventory (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.store_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  unique (location_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  location_id uuid not null references public.store_locations(id) on delete restrict,
  zone_id uuid references public.store_zones(id) on delete set null,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  short_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  purchase_code text not null unique
    default ('GLD-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))),
  receipt_token uuid not null unique default gen_random_uuid(),
  customer_email text,
  payment_reference text unique,
  status text not null default 'pending_payment'
    check (
      status in (
        'pending_payment',
        'paid',
        'preparing',
        'ready_for_exit',
        'exited',
        'cancelled',
        'refunded',
        'payment_failed'
      )
    ),
  items jsonb not null default '[]'::jsonb,
  total_kobo integer not null check (total_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  exit_token text unique,
  cashier_staff_id uuid references public.merchant_staff(id) on delete set null,
  security_staff_id uuid references public.merchant_staff(id) on delete set null,
  paid_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_items_is_array check (jsonb_typeof(items) = 'array'),
  constraint ready_order_has_exit_token check (
    status not in ('ready_for_exit', 'exited') or exit_token is not null
  ),
  constraint exited_order_has_timestamp check (
    status <> 'exited' or exited_at is not null
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_kobo integer not null check (unit_price_kobo >= 0),
  quantity integer not null check (quantity > 0),
  line_total_kobo integer generated always as (unit_price_kobo * quantity) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.store_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  staff_id uuid references public.merchant_staff(id) on delete set null,
  movement_type text not null
    check (movement_type in ('sale', 'restock', 'correction', 'refund', 'waste')),
  quantity_delta integer not null check (quantity_delta <> 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  staff_id uuid references public.merchant_staff(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Upgrade the original three-table Glide schema in place. PostgreSQL does not
-- add new columns when CREATE TABLE IF NOT EXISTS finds an older table.
alter table public.merchants
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

alter table public.products
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists tracks_inventory boolean not null default true;

alter table public.orders
  add column if not exists location_id uuid references public.store_locations(id) on delete restrict,
  add column if not exists zone_id uuid references public.store_zones(id) on delete set null,
  add column if not exists qr_code_id uuid references public.qr_codes(id) on delete set null,
  add column if not exists short_code text,
  add column if not exists purchase_code text,
  add column if not exists receipt_token uuid,
  add column if not exists customer_email text,
  add column if not exists cashier_staff_id uuid references public.merchant_staff(id) on delete set null,
  add column if not exists security_staff_id uuid references public.merchant_staff(id) on delete set null,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists exited_at timestamptz;

alter table public.orders
  drop constraint if exists orders_status_check,
  drop constraint if exists successful_order_has_payment_data,
  drop constraint if exists ready_order_has_exit_token,
  drop constraint if exists exited_order_has_timestamp;

update public.orders
set status = case status
  when 'pending' then 'pending_payment'
  when 'success' then 'paid'
  when 'failed' then 'payment_failed'
  else status
end
where status in ('pending', 'success', 'failed');

update public.orders
set short_code = upper(substr(replace(id::text, '-', ''), 1, 6))
where short_code is null;

update public.orders
set purchase_code = 'GLD-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where purchase_code is null;

update public.orders
set receipt_token = gen_random_uuid()
where receipt_token is null;

alter table public.orders
  alter column status set default 'pending_payment',
  alter column short_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  alter column short_code set not null,
  alter column purchase_code set default ('GLD-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))),
  alter column purchase_code set not null,
  alter column receipt_token set default gen_random_uuid(),
  alter column receipt_token set not null,
  add constraint orders_status_check check (
    status in (
      'pending_payment',
      'paid',
      'preparing',
      'ready_for_exit',
      'exited',
      'cancelled',
      'refunded',
      'payment_failed'
    )
  ),
  add constraint ready_order_has_exit_token check (
    status not in ('ready_for_exit', 'exited') or exit_token is not null
  ),
  add constraint exited_order_has_timestamp check (
    status <> 'exited' or exited_at is not null
  );

create unique index if not exists orders_short_code_unique_idx
  on public.orders (short_code);
create unique index if not exists orders_purchase_code_unique_idx
  on public.orders (purchase_code);
create unique index if not exists orders_receipt_token_unique_idx
  on public.orders (receipt_token);
create unique index if not exists products_merchant_sku_unique_idx
  on public.products (merchant_id, sku) where sku is not null;
create unique index if not exists products_merchant_barcode_unique_idx
  on public.products (merchant_id, barcode) where barcode is not null;

create index if not exists store_locations_merchant_idx
  on public.store_locations (merchant_id, is_active);
create index if not exists merchant_staff_merchant_idx
  on public.merchant_staff (merchant_id, is_active);
create index if not exists qr_codes_assignment_idx
  on public.qr_codes (merchant_id, location_id, status);
create unique index if not exists qr_codes_one_active_per_store_idx
  on public.qr_codes (merchant_id)
  where merchant_id is not null and status = 'active';
create index if not exists products_merchant_catalog_idx
  on public.products (merchant_id, is_available, sort_order);
create index if not exists inventory_location_stock_idx
  on public.location_inventory (location_id, quantity);
create index if not exists orders_merchant_status_created_idx
  on public.orders (merchant_id, status, created_at desc);
create index if not exists orders_location_status_created_idx
  on public.orders (location_id, status, created_at desc);
create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists order_events_order_idx
  on public.order_events (order_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'merchants',
    'store_locations',
    'store_zones',
    'merchant_staff',
    'qr_codes',
    'products',
    'location_inventory',
    'orders'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create or replace function public.owns_merchant(target_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchants
    where id = target_merchant_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.has_merchant_role(
  target_merchant_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.owns_merchant(target_merchant_id)
    or exists (
      select 1
      from public.merchant_staff
      where merchant_id = target_merchant_id
        and user_id = auth.uid()
        and is_active = true
        and roles && allowed_roles
    );
$$;

grant execute on function public.owns_merchant(uuid) to authenticated;
grant execute on function public.has_merchant_role(uuid, text[]) to authenticated;

create or replace function public.validate_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  valid_sequence boolean := false;
  authorised boolean := false;
begin
  if old.status = new.status then
    return new;
  end if;

  valid_sequence :=
    (old.status = 'pending_payment' and new.status in ('paid', 'payment_failed', 'cancelled'))
    or (old.status = 'paid' and new.status in ('preparing', 'ready_for_exit', 'cancelled', 'refunded'))
    or (old.status = 'preparing' and new.status in ('ready_for_exit', 'cancelled', 'refunded'))
    or (old.status = 'ready_for_exit' and new.status in ('exited', 'refunded'))
    or (old.status = 'exited' and new.status = 'refunded');

  if not valid_sequence then
    raise exception 'Invalid Glide order transition: % -> %', old.status, new.status;
  end if;

  if request_role = 'service_role' then
    authorised := true;
  elsif public.has_merchant_role(new.merchant_id, array['admin']) then
    authorised := old.status <> 'pending_payment';
  elsif public.has_merchant_role(new.merchant_id, array['cashier']) then
    authorised :=
      old.status in ('paid', 'preparing')
      and new.status in ('preparing', 'ready_for_exit');
  elsif public.has_merchant_role(new.merchant_id, array['security']) then
    authorised := old.status = 'ready_for_exit' and new.status = 'exited';
  end if;

  if not authorised then
    raise exception 'This role cannot perform the requested order transition';
  end if;

  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status = 'preparing' then
    new.preparing_at := coalesce(new.preparing_at, now());
  elsif new.status = 'ready_for_exit' then
    new.ready_at := coalesce(new.ready_at, now());
    new.exit_token := coalesce(
      new.exit_token,
      upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
    );
  elsif new.status = 'exited' then
    new.exited_at := coalesce(new.exited_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists orders_validate_transition on public.orders;
create trigger orders_validate_transition
before update of status on public.orders
for each row execute function public.validate_order_transition();

create or replace function public.sync_inventory_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  affected_rows integer;
begin
  if new.status = 'paid' and old.status <> 'paid' then
    for item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = new.id
        and p.tracks_inventory = true
    loop
      update public.location_inventory
      set quantity = quantity - item.quantity,
          updated_at = now()
      where merchant_id = new.merchant_id
        and location_id = new.location_id
        and product_id = item.product_id
        and quantity >= item.quantity;

      get diagnostics affected_rows = row_count;
      if affected_rows = 0 then
        raise exception 'Insufficient inventory for product %', item.product_id;
      end if;

      insert into public.inventory_movements (
        merchant_id,
        location_id,
        product_id,
        order_id,
        movement_type,
        quantity_delta,
        note
      ) values (
        new.merchant_id,
        new.location_id,
        item.product_id,
        new.id,
        'sale',
        -item.quantity,
        'Automatic deduction after verified payment'
      );
    end loop;
  elsif new.status = 'refunded' and old.status <> 'refunded' then
    for item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = new.id
        and p.tracks_inventory = true
    loop
      update public.location_inventory
      set quantity = quantity + item.quantity,
          updated_at = now()
      where merchant_id = new.merchant_id
        and location_id = new.location_id
        and product_id = item.product_id;

      insert into public.inventory_movements (
        merchant_id,
        location_id,
        product_id,
        order_id,
        movement_type,
        quantity_delta,
        note
      ) values (
        new.merchant_id,
        new.location_id,
        item.product_id,
        new.id,
        'refund',
        item.quantity,
        'Automatic restoration after refund'
      );
    end loop;
  end if;

  insert into public.order_events (
    order_id,
    merchant_id,
    event_type,
    from_status,
    to_status
  ) values (
    new.id,
    new.merchant_id,
    'status_changed',
    old.status,
    new.status
  );

  return new;
end;
$$;

drop trigger if exists orders_sync_inventory on public.orders;
create trigger orders_sync_inventory
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.sync_inventory_from_order();

alter table public.merchants enable row level security;
alter table public.store_locations enable row level security;
alter table public.store_zones enable row level security;
alter table public.merchant_staff enable row level security;
alter table public.qr_codes enable row level security;
alter table public.products enable row level security;
alter table public.location_inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "Public can view active merchants" on public.merchants;
create policy "Public can view active merchants"
on public.merchants for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Owners manage their merchants" on public.merchants;
create policy "Owners manage their merchants"
on public.merchants for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Public can view active locations" on public.store_locations;
create policy "Public can view active locations"
on public.store_locations for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can view active zones" on public.store_zones;
create policy "Public can view active zones"
on public.store_zones for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can resolve active QR codes" on public.qr_codes;
create policy "Public can resolve active QR codes"
on public.qr_codes for select
to anon, authenticated
using (status = 'active');

drop policy if exists "Public can view available products" on public.products;
create policy "Public can view available products"
on public.products for select
to anon, authenticated
using (
  is_available = true
  and exists (
    select 1 from public.merchants
    where merchants.id = products.merchant_id
      and merchants.is_active = true
  )
);

drop policy if exists "Merchant team can view locations" on public.store_locations;
create policy "Merchant team can view locations"
on public.store_locations for select
to authenticated
using (public.has_merchant_role(merchant_id, array['admin', 'cashier', 'security']));

drop policy if exists "Merchant admins manage locations" on public.store_locations;
create policy "Merchant admins manage locations"
on public.store_locations for all
to authenticated
using (public.has_merchant_role(merchant_id, array['admin']))
with check (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Merchant admins manage zones" on public.store_zones;
create policy "Merchant admins manage zones"
on public.store_zones for all
to authenticated
using (
  exists (
    select 1
    from public.store_locations
    where store_locations.id = store_zones.location_id
      and public.has_merchant_role(store_locations.merchant_id, array['admin'])
  )
)
with check (
  exists (
    select 1
    from public.store_locations
    where store_locations.id = store_zones.location_id
      and public.has_merchant_role(store_locations.merchant_id, array['admin'])
  )
);

drop policy if exists "Merchant admins manage staff" on public.merchant_staff;
create policy "Merchant admins manage staff"
on public.merchant_staff for all
to authenticated
using (public.has_merchant_role(merchant_id, array['admin']))
with check (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Staff can view own membership" on public.merchant_staff;
create policy "Staff can view own membership"
on public.merchant_staff for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Merchant admins manage QR codes" on public.qr_codes;
create policy "Merchant admins manage QR codes"
on public.qr_codes for all
to authenticated
using (
  merchant_id is not null
  and public.has_merchant_role(merchant_id, array['admin'])
)
with check (
  merchant_id is not null
  and public.has_merchant_role(merchant_id, array['admin'])
);

drop policy if exists "Merchant admins can claim unassigned QR codes" on public.qr_codes;
create policy "Merchant admins can claim unassigned QR codes"
on public.qr_codes for update
to authenticated
using (status = 'unassigned' and merchant_id is null)
with check (
  merchant_id is not null
  and public.has_merchant_role(merchant_id, array['admin'])
);

drop policy if exists "Merchant admins manage products" on public.products;
create policy "Merchant admins manage products"
on public.products for all
to authenticated
using (public.has_merchant_role(merchant_id, array['admin']))
with check (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Merchant team views inventory" on public.location_inventory;
create policy "Merchant team views inventory"
on public.location_inventory for select
to authenticated
using (public.has_merchant_role(merchant_id, array['admin', 'cashier']));

drop policy if exists "Merchant admins manage inventory" on public.location_inventory;
create policy "Merchant admins manage inventory"
on public.location_inventory for all
to authenticated
using (public.has_merchant_role(merchant_id, array['admin']))
with check (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Merchant team views operational orders" on public.orders;
create policy "Merchant team views operational orders"
on public.orders for select
to authenticated
using (public.has_merchant_role(merchant_id, array['admin', 'cashier', 'security']));

drop policy if exists "Merchant team updates operational orders" on public.orders;
create policy "Merchant team updates operational orders"
on public.orders for update
to authenticated
using (public.has_merchant_role(merchant_id, array['admin', 'cashier', 'security']))
with check (public.has_merchant_role(merchant_id, array['admin', 'cashier', 'security']));

drop policy if exists "Merchant team views order items" on public.order_items;
create policy "Merchant team views order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and public.has_merchant_role(
        orders.merchant_id,
        array['admin', 'cashier', 'security']
      )
  )
);

drop policy if exists "Merchant admins view inventory movements" on public.inventory_movements;
create policy "Merchant admins view inventory movements"
on public.inventory_movements for select
to authenticated
using (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Merchant admins create inventory movements" on public.inventory_movements;
create policy "Merchant admins create inventory movements"
on public.inventory_movements for insert
to authenticated
with check (public.has_merchant_role(merchant_id, array['admin']));

drop policy if exists "Merchant team views order events" on public.order_events;
create policy "Merchant team views order events"
on public.order_events for select
to authenticated
using (public.has_merchant_role(merchant_id, array['admin', 'cashier', 'security']));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end
$$;
