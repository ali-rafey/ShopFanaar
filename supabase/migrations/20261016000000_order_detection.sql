-- Detection: orders that look fake or spam.
--
-- Rule (as the owner defined it): the same internet connection placed two or
-- more orders within 7 days, each with a different name, phone number AND
-- address. Every order in such a pair is "suspected" until the admin reviews
-- it — "spam" (cancelled, items back in stock) or "genuine" (flag cleared).
--
-- How the connection is known: orders are placed straight from the shopper's
-- browser (place_order via the API), so the request's own headers are
-- available in the database. A trigger stores, for each new order:
--   ip_hash     — md5 of a private random salt + the client IP (Cloudflare's
--                 cf-connecting-ip). The IP itself is never stored, and the
--                 salt is only readable by the database owner, so the code
--                 can't be turned back into an address.
--   device_hash — md5 of the browser's user-agent: same phone model + browser
--                 or not. Supporting evidence only — mobile networks in
--                 Pakistan put many customers behind one shared IP, so the
--                 admin is shown whether the device matched too.
-- Orders placed before this migration have neither and are never flagged.

create table private.secrets (
  name  text primary key,
  value text not null
);
insert into private.secrets (name, value)
values ('order_ip_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

alter table public.orders
  add column ip_hash           text,
  add column device_hash       text,
  add column fraud_review      text check (fraud_review in ('genuine', 'spam')),
  add column fraud_reviewed_at timestamptz;

create index orders_ip_hash_idx on public.orders (ip_hash, created_at) where ip_hash is not null;

create or replace function private.capture_order_request()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_headers jsonb;
  v_ip      text;
  v_agent   text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := coalesce(
      nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
      nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
    );
    v_agent := nullif(btrim(v_headers ->> 'user-agent'), '');
    if v_ip is not null then
      new.ip_hash := md5((select value from private.secrets where name = 'order_ip_salt') || v_ip);
    end if;
    if v_agent is not null then
      new.device_hash := md5(v_agent);
    end if;
  exception when others then
    null; -- never let this stop an order
  end;
  return new;
end;
$$;

create trigger orders_capture_request
  before insert on public.orders
  for each row execute function private.capture_order_request();

-- Lower-case letters and digits only, so "Ali  Khan." and "ali khan" match.
create or replace function public.norm_text(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', '', 'g');
$$;

-- Is this order suspected? (Not if the admin has already reviewed it.)
-- Selectable as a column: orders?select=*,suspected
create or replace function public.suspected(o public.orders)
returns boolean
language sql
stable
set search_path = public
as $$
  select o.ip_hash is not null
     and o.fraud_review is null
     and exists (
       select 1 from public.orders x
        where x.ip_hash = o.ip_hash
          and x.id <> o.id
          and x.created_at between o.created_at - interval '7 days' and o.created_at + interval '7 days'
          and public.norm_text(x.customer_name) <> public.norm_text(o.customer_name)
          and x.phone <> o.phone
          and public.norm_text(x.address) <> public.norm_text(o.address)
     );
$$;

-- The Detection tab: one group per connection with suspected orders, listing
-- every order from that connection in the window (flagged ones marked).
create or replace function public.detection_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return coalesce((
    with flagged as (
      select o.ip_hash, o.created_at from public.orders o where public.suspected(o)
    ),
    groups as (
      select ip_hash, min(created_at) as first_at, max(created_at) as last_at
        from flagged group by ip_hash
    )
    select jsonb_agg(
             jsonb_build_object(
               'key', upper(left(g.ip_hash, 6)),
               'first_at', g.first_at,
               'last_at', g.last_at,
               'orders', (
                 select jsonb_agg(jsonb_build_object(
                          'id', o.id,
                          'order_number', o.order_number,
                          'status', o.status,
                          'customer_name', o.customer_name,
                          'phone', o.phone,
                          'address', o.address,
                          'city', o.city,
                          'total', o.total,
                          'created_at', o.created_at,
                          'device', upper(left(o.device_hash, 4)),
                          'courier', o.courier,
                          'tracking_number', o.tracking_number,
                          'courier_status', o.courier_status,
                          'fraud_review', o.fraud_review,
                          'suspected', public.suspected(o)
                        ) order by o.created_at)
                   from public.orders o
                  where o.ip_hash = g.ip_hash
                    and o.created_at between g.first_at - interval '7 days' and g.last_at + interval '7 days'
               )
             ) order by g.last_at desc)
      from groups g
  ), '[]'::jsonb);
end;
$$;

-- The admin's verdict. "spam" also cancels the orders that can still be
-- cancelled here (pending / confirmed, or booked but no longer tracked —
-- the admin cancels PostEx bookings first) and puts their items back.
create or replace function public.review_orders(p_order_ids uuid[], p_verdict text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_verdict not in ('genuine', 'spam') then
    raise exception 'Unknown verdict "%".', p_verdict;
  end if;

  for o in select * from public.orders where id = any(p_order_ids) for update loop
    update public.orders set fraud_review = p_verdict, fraud_reviewed_at = now() where id = o.id;
    insert into public.order_events (order_id, kind, message)
    values (o.id, 'note', case p_verdict when 'spam' then 'Marked as spam (Detection)' else 'Checked in Detection — looks genuine' end);
    if p_verdict = 'spam' and o.tracking_number is null and o.status in ('pending', 'confirmed', 'packed') then
      perform public.update_order_status(o.id, 'cancelled', 'Cancelled as spam', true);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on private.secrets from public, anon, authenticated;
revoke execute on function public.suspected(public.orders), public.detection_groups(), public.review_orders(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.suspected(public.orders), public.detection_groups(), public.review_orders(uuid[], text)
  to authenticated;
grant execute on function public.norm_text(text) to authenticated;

-- admin_stats(): unchanged from *_courier_sales.sql except the new
-- 'suspected_orders' count (the Detection tab's badge).
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

  return (
    with delivered as (
      select coalesce(o.courier_amount, o.total) as amount,
             coalesce(o.courier_delivered_at,
                      (select max(e.created_at) from public.order_events e
                        where e.order_id = o.id and e.kind = 'status' and e.status = 'delivered'),
                      o.updated_at) as at
        from public.orders o
       where o.status = 'delivered' and o.tracking_number is not null
    ),
    with_courier as (
      select coalesce(o.courier_amount, o.total) as amount
        from public.orders o
       where o.status in ('packed', 'shipped') and o.tracking_number is not null
    )
    select jsonb_build_object(
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
      'to_book', (
        select count(*) from public.orders where status = 'confirmed' and tracking_number is null),
      'with_courier_count', (select count(*) from with_courier),
      'with_courier_amount', (select coalesce(sum(amount), 0) from with_courier),
      'delivered_30d_count', (select count(*) from delivered where at > now() - interval '30 days'),
      'delivered_30d_amount', (select coalesce(sum(amount), 0) from delivered where at > now() - interval '30 days'),
      'delivered_all_count', (select count(*) from delivered),
      'delivered_all_amount', (select coalesce(sum(amount), 0) from delivered),
      'low_stock', coalesce((
        select jsonb_agg(x)
          from (select p.id, p.title, p.handle, pv.size, pv.stock
                  from public.product_variants pv
                  join public.products p on p.id = pv.product_id
                 where p.status = 'active' and pv.stock <= 3
                 order by pv.stock, p.title, pv.position
                 limit 20) x
      ), '[]'::jsonb),
      'unread_messages', (select count(*) from public.contact_messages where status = 'new'),
      'subscribers', (select count(*) from public.subscribers),
      'suspected_orders', (select count(*) from public.orders o where public.suspected(o))
    )
  );
end;
$$;

