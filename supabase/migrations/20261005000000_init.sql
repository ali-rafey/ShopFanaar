-- ============================================================================
-- Fanaar — database schema (catalog, orders, admin)
--
-- Run once on a fresh Supabase project: paste into the SQL editor and run,
-- then run supabase/seed.sql to load the current catalog.
--
-- Security model
--   * Shoppers (anon key) can read the active catalog + store settings and
--     place orders ONLY through place_order(), which re-prices every line
--     from the database and decrements stock in one transaction.
--   * Everything else (editing products, reading/processing orders) requires
--     a signed-in user listed in public.admins.
-- ============================================================================

-- ---------- Helpers ---------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Admins ----------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Store settings (single row) -------------------------------------

create table public.store_settings (
  id                      int primary key default 1 check (id = 1),
  shipping_fee            int not null default 250 check (shipping_fee >= 0),
  -- Orders at or above this subtotal ship free. NULL = never free.
  free_shipping_threshold int check (free_shipping_threshold >= 0),
  -- Lets the admin pause checkout (holidays, stock-take) without a deploy.
  accepting_orders        boolean not null default true,
  updated_at              timestamptz not null default now()
);

insert into public.store_settings (id) values (1);

create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- ---------- Catalog ---------------------------------------------------------

create table public.collections (
  handle     text primary key check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title      text not null,
  nav_group  text,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  -- Text ids so the catalog ids carried over from the old store (which are
  -- already in shoppers' saved lists and carts) keep working.
  id               text primary key default replace(gen_random_uuid()::text, '-', ''),
  handle           text not null unique check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '',
  disclaimer       text,
  price            int not null check (price >= 0),
  compare_at_price int check (compare_at_price is null or compare_at_price >= 0),
  images           text[] not null default '{}',
  collections      text[] not null default '{}',
  status           text not null default 'active'
                     check (status in ('active', 'draft', 'archived')),
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index products_status_position_idx on public.products (status, position);

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null references public.products (id) on delete cascade,
  size       text not null check (char_length(size) between 1 and 20),
  stock      int not null default 0 check (stock >= 0),
  sku        text,
  position   int not null default 0,
  unique (product_id, size)
);

-- ---------- Orders ----------------------------------------------------------

create sequence public.order_number_seq start 1001;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    int not null unique default nextval('public.order_number_seq'),
  status          text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'packed', 'shipped',
                                      'delivered', 'cancelled', 'returned')),
  payment_method  text not null default 'cod' check (payment_method in ('cod')),
  payment_status  text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'paid', 'refunded')),
  customer_name   text not null,
  phone           text not null,
  email           text,
  address         text not null,
  city            text not null,
  postal_code     text,
  customer_note   text,
  subtotal        int not null check (subtotal >= 0),
  shipping_fee    int not null check (shipping_fee >= 0),
  discount        int not null default 0 check (discount >= 0),
  total           int not null check (total >= 0),
  courier         text,
  tracking_number text,
  admin_note      text,
  -- True once this order's units have been put back into stock
  -- (cancelled / returned), so a status flip can never double-count.
  restocked       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter sequence public.order_number_seq owned by public.orders.order_number;

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_phone_idx on public.orders (phone);

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  -- Snapshot columns below keep the order readable even if the product is
  -- later edited or deleted.
  product_id text references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  title      text not null,
  handle     text,
  size       text not null,
  image      text,
  unit_price int not null check (unit_price >= 0),
  quantity   int not null check (quantity > 0)
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  kind       text not null check (kind in ('status', 'payment', 'shipping', 'note')),
  status     text,
  message    text,
  actor      uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

-- Payment / tracking edits are plain column updates from the admin UI; log
-- them to the order timeline automatically.
create or replace function public.log_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status is distinct from old.payment_status then
    insert into public.order_events (order_id, kind, message)
    values (new.id, 'payment', 'Payment marked ' || new.payment_status);
  end if;
  if new.tracking_number is not null
     and (new.courier, new.tracking_number) is distinct from (old.courier, old.tracking_number) then
    insert into public.order_events (order_id, kind, message)
    values (new.id, 'shipping',
            btrim(coalesce(new.courier, '') || ' ' || new.tracking_number));
  end if;
  return new;
end;
$$;

create trigger orders_log_update after update on public.orders
  for each row execute function public.log_order_update();

-- ---------- Checkout --------------------------------------------------------

-- The only way a shopper can create an order. Prices and stock come from the
-- database, never from the browser.
--
-- payload = {
--   "customer": { "name", "phone", "email"?, "address", "city",
--                 "postal_code"?, "note"? },
--   "items":    [ { "product_id", "size", "qty" }, ... ]
-- }
create or replace function public.place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c          jsonb := coalesce(payload -> 'customer', '{}'::jsonb);
  v_name     text := nullif(btrim(c ->> 'name'), '');
  v_phone    text := regexp_replace(coalesce(c ->> 'phone', ''), '[^0-9]', '', 'g');
  v_email    text := nullif(lower(btrim(c ->> 'email')), '');
  v_address  text := nullif(btrim(c ->> 'address'), '');
  v_city     text := nullif(btrim(c ->> 'city'), '');
  v_postal   text := nullif(btrim(c ->> 'postal_code'), '');
  v_note     text := nullif(btrim(c ->> 'note'), '');
  v_settings public.store_settings;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_shipping int;
  v_order    public.orders;
  r          record;
  v          record;
begin
  select * into v_settings from public.store_settings where id = 1;
  if not coalesce(v_settings.accepting_orders, false) then
    raise exception 'We are not taking orders right now. Please check back soon.';
  end if;

  -- Customer details -------------------------------------------------------
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Please enter your full name.';
  end if;

  -- Accept 0300…, 300…, 92300…, 0092300… and store as 03XXXXXXXXX.
  v_phone := regexp_replace(v_phone, '^(0092|92|0)', '');
  if v_phone !~ '^3[0-9]{9}$' then
    raise exception 'Please enter a valid mobile number, e.g. 0300 1234567.';
  end if;
  v_phone := '0' || v_phone;

  if v_email is not null
     and (char_length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Please enter a valid email address.';
  end if;
  if v_address is null or char_length(v_address) not between 5 and 500 then
    raise exception 'Please enter your full delivery address.';
  end if;
  if v_city is null or char_length(v_city) not between 2 and 80 then
    raise exception 'Please enter your city.';
  end if;
  if char_length(v_postal) > 12 then
    raise exception 'Please check your postal code.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Order note is too long (500 characters max).';
  end if;

  -- Cart -------------------------------------------------------------------
  if jsonb_typeof(payload -> 'items') is distinct from 'array'
     or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if jsonb_array_length(payload -> 'items') > 30 then
    raise exception 'Too many lines in one order.';
  end if;

  -- Basic abuse guard: fake orders would lock up real stock.
  if (select count(*) from public.orders
       where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this number in the last hour. Please contact us to complete your order.';
  end if;

  -- Merge duplicate lines, then lock variants in a stable order so two
  -- concurrent checkouts can never deadlock or both take the last unit.
  for r in
    select i.product_id, i.size, sum(i.qty)::int as qty
    from jsonb_to_recordset(payload -> 'items') as i (product_id text, size text, qty int)
    group by i.product_id, i.size
    order by i.product_id, i.size
  loop
    if r.qty is null or r.qty < 1 or r.qty > 20 then
      raise exception 'Please check the quantities in your cart.';
    end if;

    select pv.id as variant_id, pv.stock, p.id as product_id, p.title, p.handle,
           p.price, p.images[1] as image, p.status
      into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.product_id = r.product_id and pv.size = r.size
       for update of pv;

    if not found or v.status <> 'active' then
      raise exception 'Sorry, an item in your cart is no longer available.';
    end if;
    if v.stock < r.qty then
      if v.stock = 0 then
        raise exception '% (size %) has just sold out.', v.title, r.size;
      end if;
      raise exception 'Only % left of % in size %.', v.stock, v.title, r.size;
    end if;

    v_subtotal := v_subtotal + v.price * r.qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v.product_id,
      'variant_id', v.variant_id,
      'title',      v.title,
      'handle',     v.handle,
      'size',       r.size,
      'image',      v.image,
      'unit_price', v.price,
      'quantity',   r.qty
    );
  end loop;

  v_shipping := case
    when v_settings.free_shipping_threshold is not null
         and v_subtotal >= v_settings.free_shipping_threshold then 0
    else v_settings.shipping_fee
  end;

  insert into public.orders (customer_name, phone, email, address, city, postal_code,
                             customer_note, subtotal, shipping_fee, total)
  values (v_name, v_phone, v_email, v_address, v_city, v_postal,
          v_note, v_subtotal, v_shipping, v_subtotal + v_shipping)
  returning * into v_order;

  insert into public.order_items (order_id, product_id, variant_id, title, handle,
                                  size, image, unit_price, quantity)
  select v_order.id, l ->> 'product_id', (l ->> 'variant_id')::uuid, l ->> 'title',
         l ->> 'handle', l ->> 'size', l ->> 'image', (l ->> 'unit_price')::int,
         (l ->> 'quantity')::int
    from jsonb_array_elements(v_lines) l;

  update public.product_variants pv
     set stock = pv.stock - (l ->> 'quantity')::int
    from jsonb_array_elements(v_lines) l
   where pv.id = (l ->> 'variant_id')::uuid;

  insert into public.order_events (order_id, kind, status, message)
  values (v_order.id, 'status', 'pending', 'Order placed on the website');

  return jsonb_build_object(
    'id',           v_order.id,
    'order_number', v_order.order_number,
    'subtotal',     v_order.subtotal,
    'shipping_fee', v_order.shipping_fee,
    'total',        v_order.total,
    'items',        v_lines
  );
end;
$$;

-- Order confirmation page. The id is an unguessable UUID only the shopper
-- receives; the phone number is still masked in case the link is shared.
create or replace function public.get_order_public(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',              o.id,
    'order_number',    o.order_number,
    'status',          o.status,
    'created_at',      o.created_at,
    'customer_name',   o.customer_name,
    'phone',           overlay(o.phone placing '*****' from 5 for 5),
    'address',         o.address,
    'city',            o.city,
    'payment_method',  o.payment_method,
    'subtotal',        o.subtotal,
    'shipping_fee',    o.shipping_fee,
    'discount',        o.discount,
    'total',           o.total,
    'courier',         o.courier,
    'tracking_number', o.tracking_number,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', i.title, 'handle', i.handle, 'size', i.size,
               'image', i.image, 'unit_price', i.unit_price,
               'quantity', i.quantity) order by i.title, i.size)
        from public.order_items i
       where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_id;
$$;

-- ---------- Admin: order processing -----------------------------------------

-- Status changes go through here so stock stays correct: cancelling or
-- returning puts units back (once); re-opening takes them out again.
create or replace function public.update_order_status(
  p_order_id uuid,
  p_status   text,
  p_note     text default null,
  p_restock  boolean default true
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o         public.orders;
  v_short   record;
  v_restock boolean;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'confirmed', 'packed', 'shipped',
                      'delivered', 'cancelled', 'returned') then
    raise exception 'Unknown status "%".', p_status;
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if o.status = p_status then
    return o;
  end if;

  v_restock := o.restocked;

  -- Lock this order's variants before touching stock.
  perform 1
     from public.product_variants pv
     join public.order_items i on i.variant_id = pv.id
    where i.order_id = o.id
      for update of pv;

  if p_status in ('cancelled', 'returned') then
    if p_restock and not o.restocked then
      update public.product_variants pv
         set stock = pv.stock + i.quantity
        from public.order_items i
       where i.order_id = o.id and i.variant_id = pv.id;
      v_restock := true;
    end if;
  elsif o.restocked then
    select i.title, i.size into v_short
      from public.order_items i
      join public.product_variants pv on pv.id = i.variant_id
     where i.order_id = o.id and pv.stock < i.quantity
     limit 1;
    if found then
      raise exception 'Not enough stock to reopen this order (% — size %).',
        v_short.title, v_short.size;
    end if;
    update public.product_variants pv
       set stock = pv.stock - i.quantity
      from public.order_items i
     where i.order_id = o.id and i.variant_id = pv.id;
    v_restock := false;
  end if;

  update public.orders
     set status = p_status, restocked = v_restock
   where id = o.id
  returning * into o;

  insert into public.order_events (order_id, kind, status, message)
  values (o.id, 'status', p_status, nullif(btrim(p_note), ''));

  return o;
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz :=
    date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'by_status', coalesce((
      select jsonb_object_agg(status, n)
        from (select status, count(*) as n from public.orders group by status) s
    ), '{}'::jsonb),
    'orders_today', (select count(*) from public.orders where created_at >= v_today),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
       where created_at >= v_today and status not in ('cancelled', 'returned')),
    'orders_30d', (
      select count(*) from public.orders
       where created_at > now() - interval '30 days'
         and status not in ('cancelled', 'returned')),
    'revenue_30d', (
      select coalesce(sum(total), 0) from public.orders
       where created_at > now() - interval '30 days'
         and status not in ('cancelled', 'returned')),
    'low_stock', coalesce((
      select jsonb_agg(x)
        from (select p.id, p.title, p.handle, pv.size, pv.stock
                from public.product_variants pv
                join public.products p on p.id = pv.product_id
               where p.status = 'active' and pv.stock <= 3
               order by pv.stock, p.title, pv.position
               limit 20) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Row level security ----------------------------------------------

alter table public.admins           enable row level security;
alter table public.store_settings   enable row level security;
alter table public.collections      enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.order_events     enable row level security;

-- Supabase grants everything on new tables to anon/authenticated by default;
-- start from nothing and add back exactly what each role needs.
revoke all on public.admins, public.store_settings, public.collections,
              public.products, public.product_variants, public.orders,
              public.order_items, public.order_events
  from anon, authenticated;

grant select on public.store_settings, public.collections, public.products,
                public.product_variants
  to anon, authenticated;
grant update on public.store_settings to authenticated;
grant insert, update, delete on public.collections, public.products,
                                public.product_variants
  to authenticated;
grant select on public.admins to authenticated;
grant select, delete on public.orders to authenticated;
-- Status, totals and stock flags only change through the functions above.
grant update (payment_status, courier, tracking_number, admin_note,
              customer_name, phone, email, address, city, postal_code)
  on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.order_events to authenticated;
grant insert (order_id, kind, message) on public.order_events to authenticated;

create policy "admins see themselves" on public.admins
  for select to authenticated using (user_id = auth.uid());

create policy "settings are public" on public.store_settings
  for select using (true);
create policy "admins edit settings" on public.store_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "collections are public" on public.collections
  for select using (true);
create policy "admins manage collections" on public.collections
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "active products are public" on public.products
  for select using (status = 'active' or (select public.is_admin()));
create policy "admins manage products" on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "variants of active products are public" on public.product_variants
  for select using (
    (select public.is_admin())
    or exists (select 1 from public.products p
                where p.id = product_variants.product_id and p.status = 'active')
  );
create policy "admins manage variants" on public.product_variants
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read orders" on public.orders
  for select to authenticated using ((select public.is_admin()));
create policy "admins edit orders" on public.orders
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Only cancelled orders can be deleted (their stock is already restored).
create policy "admins delete cancelled orders" on public.orders
  for delete to authenticated
  using ((select public.is_admin()) and status = 'cancelled');

create policy "admins read order items" on public.order_items
  for select to authenticated using ((select public.is_admin()));

create policy "admins read order events" on public.order_events
  for select to authenticated using ((select public.is_admin()));
create policy "admins add order notes" on public.order_events
  for insert to authenticated
  with check ((select public.is_admin()) and kind = 'note');

-- Functions: shoppers may only call checkout + confirmation.
-- (Supabase also grants execute to anon/authenticated directly, so revoke
-- from those roles too, not just PUBLIC.)
revoke execute on function public.place_order(jsonb),
                           public.get_order_public(uuid),
                           public.update_order_status(uuid, text, text, boolean),
                           public.admin_stats(),
                           public.is_admin()
  from public, anon, authenticated;

grant execute on function public.place_order(jsonb)      to anon, authenticated;
grant execute on function public.get_order_public(uuid)  to anon, authenticated;
grant execute on function public.update_order_status(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_stats()           to authenticated;
grant execute on function public.is_admin()              to anon, authenticated;

-- ---------- Product image storage -------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do nothing;

create policy "admins read product images" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins update product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- ---------- Realtime (live order feed in the admin) -------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
