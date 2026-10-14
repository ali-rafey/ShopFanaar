-- Sales = what the courier actually collected on delivered parcels, and
-- statuses after booking come from the courier.
--
-- * orders.courier_amount: the cash the courier collects for the parcel (from
--   the booking, kept in step by Sync). It differs from the order total when
--   orders were merged into one parcel.
-- * orders.courier_delivered_at: when the courier delivered it.
-- * courier_returned(): a parcel the courier has returned to us marks the
--   order returned and puts its items back in stock (once).
-- * admin_stats() gains the dashboard's courier figures. Every key it already
--   returns (incl. unread_messages / subscribers from *_newsletter_contact.sql)
--   is kept, so nothing that reads it breaks.
--
-- Additive only: functions the live admin already calls are left as they are.

alter table public.orders
  add column courier_amount       int check (courier_amount is null or courier_amount >= 0),
  add column courier_delivered_at timestamptz;

create or replace function public.courier_details(
  p_order_id uuid, p_tracking text, p_amount int, p_delivered_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.orders
     set courier_amount       = coalesce(p_amount, courier_amount),
         courier_delivered_at = coalesce(p_delivered_at, courier_delivered_at)
   where id = p_order_id
     and tracking_number = nullif(btrim(p_tracking), '');
end;
$$;

create or replace function public.courier_returned(p_order_id uuid, p_tracking text)
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
  if o.status in ('confirmed', 'packed', 'shipped') then
    o := public.update_order_status(o.id, 'returned', coalesce(o.courier, 'Courier') || ': returned — items back in stock', true);
  end if;
  return o.status;
end;
$$;

-- Same as before, plus the courier figures:
--   to_book            confirmed, not yet booked
--   with_courier       booked or in transit (count + cash still to collect)
--   delivered_30d      parcels delivered by the courier in the last 30 days (count + cash)
--   delivered_all      … since the start
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
      'subscribers', (select count(*) from public.subscribers)
    )
  );
end;
$$;

revoke execute on function public.courier_details(uuid, text, int, timestamptz),
                           public.courier_returned(uuid, text)
  from public, anon, authenticated;
grant execute on function public.courier_details(uuid, text, int, timestamptz),
                          public.courier_returned(uuid, text)
  to authenticated;
