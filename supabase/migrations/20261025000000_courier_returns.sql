-- Returns from PostEx, checked by the admin before anything goes back in stock.
--
-- PostEx's order list shows "Return" for a returned parcel (never
-- "Returned"), so the PostEx sync (api/postex.js) reads the parcel's tracking
-- history and marks the order returned once PostEx records "Returned at
-- Merchant Warehouse". Until now it waited for "Returned" — five parcels back
-- with us were still "in transit" and counted as cash to collect.
--
-- A returned parcel is NOT restocked automatically: it waits in the Orders →
-- Returned tab until the admin has opened it and confirmed what came back —
-- receive_return() then puts the items back in stock (or not, if something is
-- missing or damaged).

alter table public.orders
  add column courier_returned_at  timestamptz, -- PostEx returned the parcel to us
  add column return_received_at   timestamptz; -- the admin checked it

drop function public.courier_returned(uuid, text);

-- Called by the PostEx sync. Marks the order returned (no restock) and shows
-- "Returned to you" as its courier status; the sync leaves it alone after.
create function public.courier_returned(p_order_id uuid, p_tracking text, p_returned_at timestamptz default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.orders;
  v_at timestamptz := coalesce(p_returned_at, now());
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.tracking_number is distinct from nullif(btrim(p_tracking), '') then
    return null;
  end if;
  if o.status not in ('confirmed', 'packed', 'shipped', 'returned') then
    return o.status;
  end if;

  update public.orders
     set courier_returned_at = coalesce(courier_returned_at, v_at),
         courier_status = 'Returned to you',
         courier_status_at = now()
   where id = o.id;
  if o.status <> 'returned' then
    o := public.update_order_status(
      o.id, 'returned',
      coalesce(o.courier, 'Courier') || ' returned the parcel to you on '
        || to_char(v_at at time zone 'Asia/Karachi', 'FMDD Mon') || ' — check it before restocking',
      false);
  end if;
  return o.status;
end;
$$;

-- The admin has opened a returned parcel: put its items back in stock, or
-- not (something missing or damaged — fix stock by hand on the product).
create function public.receive_return(p_order_id uuid, p_restock boolean, p_note text default null)
returns public.orders
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
  if not found then
    raise exception 'Order not found.';
  end if;
  if o.status <> 'returned' then
    raise exception 'Order #% isn''t marked returned.', o.order_number;
  end if;
  if o.return_received_at is not null or o.restocked then
    raise exception 'Order #% has already been checked.', o.order_number;
  end if;

  if p_restock then
    perform 1
       from public.product_variants pv
       join public.order_items i on i.variant_id = pv.id
      where i.order_id = o.id
        for update of pv;
    update public.product_variants pv
       set stock = pv.stock + x.qty
      from (select variant_id, sum(quantity) as qty
              from public.order_items
             where order_id = o.id and variant_id is not null
             group by variant_id) x
     where pv.id = x.variant_id;
  end if;

  update public.orders
     set restocked = p_restock, return_received_at = now()
   where id = o.id
  returning * into o;

  insert into public.order_events (order_id, kind, message)
  values (o.id, 'note',
          case when p_restock then 'Return checked — items back in stock'
               else 'Return checked — not put back in stock' end
          || coalesce(': ' || left(nullif(btrim(p_note), ''), 300), ''));
  return o;
end;
$$;

revoke execute on function public.courier_returned(uuid, text, timestamptz),
                           public.receive_return(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.courier_returned(uuid, text, timestamptz),
                          public.receive_return(uuid, boolean, text)
  to authenticated;

-- admin_stats(): unchanged from *_order_detection.sql except
--   with_courier       leaves out parcels on their way back (no cash coming)
--   returned_all       parcels PostEx returned to us (count + their value)
--   returns_to_check   returned parcels the admin hasn't checked yet
--   returning_count    parcels PostEx says are being returned, not back yet
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
         and coalesce(o.courier_status, '') !~* 'return'
    ),
    returned as (
      select coalesce(o.courier_amount, o.total) as amount
        from public.orders o
       where o.status = 'returned' and o.tracking_number is not null
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
      'returned_all_count', (select count(*) from returned),
      'returned_all_amount', (select coalesce(sum(amount), 0) from returned),
      'returns_to_check', (
        select count(*) from public.orders
         where status = 'returned' and not restocked and return_received_at is null),
      'returning_count', (
        select count(*) from public.orders
         where status in ('packed', 'shipped') and tracking_number is not null
           and courier_status ~* 'return'),
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

