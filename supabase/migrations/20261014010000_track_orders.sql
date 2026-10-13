-- "Track your order" on the storefront: a shopper enters the mobile number
-- they ordered with and sees their recent orders' progress.
--
-- Anyone can type any number, so this deliberately shows less than the
-- private order page (get_order_public): order number, date, status, items,
-- total and the courier tracking number — never the name, address or the
-- order's private id (which would open the full order page).
--
-- Lookups are rate limited per connection (20 per 10 minutes — generous,
-- since mobile networks share addresses between many customers) and overall
-- (120 a minute), so numbers can't be tried one after another. Only a hash
-- of the connection's IP is kept, for a day, to enforce that.

create table private.order_lookups (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index order_lookups_ip_at_idx on private.order_lookups (ip_hash, at);
create index order_lookups_at_idx on private.order_lookups (at);

create or replace function public.track_orders(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits  text := regexp_replace(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '^(0092|92|0)', '');
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip      text;
  v_key     text;
begin
  -- Same normalisation as place_order(): every number is stored as 03xxxxxxxxx.
  if v_digits !~ '^3[0-9]{9}$' then
    raise exception 'Please enter the mobile number you ordered with, e.g. 0300 1234567.';
  end if;

  -- Cloudflare's client IP when present; it can't be set by the caller.
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  v_key := md5('fanaar-track:' || v_ip);
  if (select count(*) from private.order_lookups where ip_hash = v_key and at > now() - interval '10 minutes') >= 20
     or (select count(*) from private.order_lookups where at > now() - interval '1 minute') >= 120 then
    raise exception 'Too many lookups — please try again in a few minutes.';
  end if;
  insert into private.order_lookups (ip_hash) values (v_key);
  if random() < 0.02 then
    delete from private.order_lookups where at < now() - interval '1 day';
  end if;

  return coalesce((
    select jsonb_agg(x.o order by x.created_at desc)
      from (
        select o.created_at,
               jsonb_build_object(
                 'order_number',    o.order_number,
                 'status',          o.status,
                 'created_at',      o.created_at,
                 'total',           o.total,
                 'payment_status',  o.payment_status,
                 'courier',         o.courier,
                 'tracking_number', o.tracking_number,
                 'items', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'title', i.title, 'handle', i.handle, 'size', i.size,
                            'image', i.image, 'quantity', i.quantity) order by i.title, i.size)
                     from public.order_items i
                    where i.order_id = o.id), '[]'::jsonb)
               ) as o
          from public.orders o
         where o.phone = '0' || v_digits
           and o.created_at > now() - interval '180 days'
         order by o.created_at desc
         limit 10
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.track_orders(text) from public, anon, authenticated;
grant execute on function public.track_orders(text) to anon, authenticated;
