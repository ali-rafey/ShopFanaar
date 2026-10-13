-- Courier booking (PostEx) from the admin.
--
-- The PostEx API itself is only ever called server-side (api/postex.js, with
-- the merchant token in a Vercel secret). These functions are how that code
-- records what happened, using the signed-in admin's own session — so every
-- write is still checked by is_admin().
--
-- Safety rules, enforced here rather than trusted to the browser:
--   * an order is claimed (courier_lock) before a booking request goes out,
--     so a double tap or a second phone can't book it twice;
--   * a tracking number is never silently replaced by a different one;
--   * synced courier statuses only ever move an order forward
--     (confirmed/packed → shipped → delivered). Returns and courier-side
--     cancellations are only reported; restocking stays the admin's call.

alter table public.orders
  add column courier_city      text,         -- the courier's own name for the delivery city
  add column courier_status    text,         -- latest status the courier reported
  add column courier_status_at timestamptz,
  add column courier_booked_at timestamptz,
  add column courier_lock      timestamptz;  -- set while a booking request is in flight

-- City spellings the admin has corrected before ("lhr" → "Lahore"), so the
-- same customer typo is matched automatically next time.
create table public.courier_city_aliases (
  courier    text not null,
  input      text not null,               -- normalised, as customers typed it
  city       text not null,               -- the courier's city name
  updated_at timestamptz not null default now(),
  primary key (courier, input)
);

alter table public.courier_city_aliases enable row level security;
revoke all on public.courier_city_aliases from anon, authenticated;
grant select, insert, update, delete on public.courier_city_aliases to authenticated;
create policy "admins manage courier city aliases" on public.courier_city_aliases
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Claim orders for booking. Returns the ids that may be booked now: not yet
-- tracked, confirmed or packed, and not already mid-booking (a claim older
-- than three minutes is treated as abandoned).
create or replace function public.courier_claim(p_order_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  with claimed as (
    update public.orders
       set courier_lock = now()
     where id = any(p_order_ids)
       and tracking_number is null
       and status in ('confirmed', 'packed')
       and (courier_lock is null or courier_lock < now() - interval '3 minutes')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from claimed;
  return v_ids;
end;
$$;

create or replace function public.courier_release(p_order_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.orders set courier_lock = null where id = any(p_order_ids);
end;
$$;

-- Record a booking — a new one, or an existing courier booking being linked
-- to its order. A confirmed order moves to packed (booked, awaiting pickup).
create or replace function public.courier_booked(
  p_order_id uuid,
  p_courier text,
  p_tracking text,
  p_city text,
  p_courier_status text,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  v_tracking text := nullif(btrim(p_tracking), '');
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if v_tracking is null then
    raise exception 'Tracking number missing.';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if o.tracking_number is not null and o.tracking_number <> v_tracking then
    raise exception 'Order #% already has tracking number %.', o.order_number, o.tracking_number;
  end if;

  update public.orders
     set courier           = p_courier,
         tracking_number   = v_tracking,
         courier_city      = coalesce(nullif(btrim(p_city), ''), courier_city),
         courier_status    = nullif(btrim(p_courier_status), ''),
         courier_status_at = now(),
         courier_booked_at = coalesce(courier_booked_at, now()),
         courier_lock      = null
   where id = o.id
  returning * into o;

  if o.status = 'confirmed' then
    o := public.update_order_status(o.id, 'packed', coalesce(p_note, 'Booked with ' || p_courier));
  elsif nullif(btrim(p_note), '') is not null then
    insert into public.order_events (order_id, kind, message) values (o.id, 'shipping', p_note);
  end if;
  return o;
end;
$$;

-- Apply a status the courier reported. Only moves forward:
--   picked up  → shipped   (from confirmed / packed)
--   delivered  → delivered (from confirmed / packed / shipped)
-- Anything else (returns, cancellations, attempts) is just stored.
-- Returns the order's status afterwards, or null when the tracking number no
-- longer matches (the order was re-booked meanwhile).
create or replace function public.courier_status_update(
  p_order_id uuid,
  p_tracking text,
  p_courier_status text,
  p_picked_up boolean,
  p_delivered boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found or o.tracking_number is distinct from nullif(btrim(p_tracking), '') then
    return null;
  end if;

  if o.courier_status is distinct from nullif(btrim(p_courier_status), '') then
    update public.orders
       set courier_status = nullif(btrim(p_courier_status), ''), courier_status_at = now()
     where id = o.id;
  end if;

  if p_delivered and o.status in ('confirmed', 'packed', 'shipped') then
    o := public.update_order_status(o.id, 'delivered', coalesce(o.courier, 'Courier') || ': delivered');
  elsif p_picked_up and o.status in ('confirmed', 'packed') then
    o := public.update_order_status(o.id, 'shipped', 'Picked up by ' || coalesce(o.courier, 'the courier'));
  end if;
  return o.status;
end;
$$;

-- The courier booking was cancelled: forget the tracking number, and put a
-- packed order back to confirmed so it can be booked again.
create or replace function public.courier_cancelled(p_order_id uuid, p_tracking text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o         public.orders;
  v_courier text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if o.tracking_number is distinct from nullif(btrim(p_tracking), '') then
    raise exception 'Order #% has a different tracking number now.', o.order_number;
  end if;
  v_courier := coalesce(o.courier, 'Courier');

  update public.orders
     set courier = null, tracking_number = null, courier_city = null, courier_status = null,
         courier_status_at = null, courier_booked_at = null, courier_lock = null
   where id = o.id
  returning * into o;

  insert into public.order_events (order_id, kind, message)
  values (o.id, 'shipping', v_courier || ' booking ' || p_tracking || ' cancelled');

  if o.status = 'packed' then
    o := public.update_order_status(o.id, 'confirmed', 'Ready to book again');
  end if;
  return o;
end;
$$;

revoke execute on function public.courier_claim(uuid[]),
                           public.courier_release(uuid[]),
                           public.courier_booked(uuid, text, text, text, text, text),
                           public.courier_status_update(uuid, text, text, boolean, boolean),
                           public.courier_cancelled(uuid, text)
  from public, anon, authenticated;
grant execute on function public.courier_claim(uuid[]),
                          public.courier_release(uuid[]),
                          public.courier_booked(uuid, text, text, text, text, text),
                          public.courier_status_update(uuid, text, text, boolean, boolean),
                          public.courier_cancelled(uuid, text)
  to authenticated;
