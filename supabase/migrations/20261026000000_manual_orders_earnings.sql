-- Manual orders, and earnings after PostEx's fee.
--
-- 1. create_manual_order(): the admin records a sale made outside the
--    website — someone at the shop, or someone who phoned — at the admin's
--    own prices. "handover": the admin hands it over in person, so the order
--    is delivered and paid straight away. "postex": the order is confirmed
--    and the admin books it with PostEx right after (the usual booking
--    sheet). Stock is taken like a website order. It sends no new-order
--    notification (the admin made it) and keeps no connection code (it's
--    the admin's own network — Detection would flag every manual order).
--
-- 2. Earnings. PostEx charges about Rs 300 a parcel, delivered or returned
--    (courier_fee_estimate()). admin_stats() adds
--      earnings = cash PostEx collected on delivered parcels
--               − Rs 300 × (delivered + returned PostEx parcels)
--               + orders handed over in person (delivered, never booked with
--                 a courier), at their full price
--    for the last 30 days and all time, with the parts it's made of.

-- What PostEx charges per parcel, on average (Rs 253.75–282.75 + 16% tax in
-- October 2026). Kept here rather than in store_settings, which shoppers can read.
create function public.courier_fee_estimate()
returns int
language sql
immutable
as $$
  select 300;
$$;

create function public.create_manual_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c          jsonb := coalesce(payload -> 'customer', '{}'::jsonb);
  v_delivery text := payload ->> 'delivery';
  v_channel  text := nullif(btrim(payload ->> 'channel'), '');
  v_name     text := nullif(btrim(c ->> 'name'), '');
  v_phone    text := regexp_replace(coalesce(c ->> 'phone', ''), '[^0-9]', '', 'g');
  v_address  text := nullif(btrim(c ->> 'address'), '');
  v_city     text := nullif(btrim(c ->> 'city'), '');
  v_note     text := nullif(btrim(payload ->> 'note'), '');
  v_fee_text text := coalesce(nullif(btrim(payload ->> 'shipping_fee'), ''), '0');
  v_shipping int;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_order    public.orders;
  r          record;
  v          record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if v_delivery is null or v_delivery not in ('handover', 'postex') then
    raise exception 'Choose how the order reaches the customer.';
  end if;
  if v_channel is null or char_length(v_channel) > 40 then
    raise exception 'Choose where the order came from.';
  end if;

  -- Customer: PostEx needs everything; someone at the shop can stay anonymous.
  if v_name is not null and char_length(v_name) not between 2 and 120 then
    raise exception 'Please check the customer''s name.';
  end if;
  if v_phone <> '' then
    v_phone := regexp_replace(v_phone, '^(0092|92|0)', '');
    if v_phone !~ '^3[0-9]{9}$' then
      raise exception 'Please enter a valid mobile number, e.g. 0300 1234567.';
    end if;
    v_phone := '0' || v_phone;
  end if;
  if char_length(v_address) > 500 or char_length(v_city) > 80 then
    raise exception 'Please check the address.';
  end if;
  if v_delivery = 'postex' then
    if v_name is null then
      raise exception 'Enter the customer''s name for PostEx.';
    end if;
    if v_phone = '' then
      raise exception 'Enter the customer''s mobile number for PostEx.';
    end if;
    if v_address is null or char_length(v_address) < 5 then
      raise exception 'Enter the full delivery address for PostEx.';
    end if;
    if v_city is null or char_length(v_city) < 2 then
      raise exception 'Enter the city for PostEx.';
    end if;
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'The note is too long (1000 characters max).';
  end if;
  if v_fee_text !~ '^[0-9]{1,6}$' then
    raise exception 'Please check the delivery charge.';
  end if;
  v_shipping := case when v_delivery = 'postex' then v_fee_text::int else 0 end;

  -- Articles ----------------------------------------------------------------
  if jsonb_typeof(payload -> 'items') is distinct from 'array'
     or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'Add at least one article.';
  end if;
  if jsonb_array_length(payload -> 'items') > 30 then
    raise exception 'Too many lines in one order.';
  end if;

  -- Lock each size once, in a stable order, and check there's enough of it.
  for r in
    select i.product_id, i.size, sum(i.qty)::int as qty
      from jsonb_to_recordset(payload -> 'items') as i (product_id text, size text, qty int)
     group by i.product_id, i.size
     order by i.product_id, i.size
  loop
    if r.qty is null or r.qty < 1 or r.qty > 50 then
      raise exception 'Please check the quantities.';
    end if;
    select pv.stock, p.title into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.product_id = r.product_id and pv.size = r.size
       for update of pv;
    if not found then
      raise exception 'One of the articles isn''t in your products any more.';
    end if;
    if v.stock < r.qty then
      if v.stock = 0 then
        raise exception '% (size %) is out of stock — update its stock in Products first.', v.title, r.size;
      end if;
      raise exception 'Only % left of % in size % — update its stock in Products first.', v.stock, v.title, r.size;
    end if;
  end loop;

  -- Lines at the admin's prices.
  for r in
    select i.product_id, i.size, i.qty, i.price
      from jsonb_to_recordset(payload -> 'items') as i (product_id text, size text, qty int, price int)
  loop
    if r.price is null or r.price < 0 or r.price > 1000000 then
      raise exception 'Please check the prices.';
    end if;
    select pv.id as variant_id, p.id as product_id, p.title, p.handle, p.images[1] as image into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.product_id = r.product_id and pv.size = r.size;
    v_subtotal := v_subtotal + r.price * r.qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v.product_id, 'variant_id', v.variant_id, 'title', v.title, 'handle', v.handle,
      'size', r.size, 'image', v.image, 'unit_price', r.price, 'quantity', r.qty);
  end loop;

  insert into public.orders (status, payment_status, customer_name, phone, address, city,
                             subtotal, shipping_fee, total, admin_note, source)
  values (case v_delivery when 'handover' then 'delivered' else 'confirmed' end,
          case v_delivery when 'handover' then 'paid' else 'unpaid' end,
          coalesce(v_name, 'Walk-in customer'), v_phone,
          coalesce(v_address, 'Handed over in person'), coalesce(v_city, 'Faisalabad'),
          v_subtotal, v_shipping, v_subtotal + v_shipping, v_note,
          jsonb_build_object('kind', 'manual', 'platform', v_channel))
  returning * into v_order;

  -- The connection code would be the admin's own (orders_capture_request).
  update public.orders set ip_hash = null, device_hash = null
   where id = v_order.id
  returning * into v_order;

  insert into public.order_items (order_id, product_id, variant_id, title, handle,
                                  size, image, unit_price, quantity)
  select v_order.id, l ->> 'product_id', (l ->> 'variant_id')::uuid, l ->> 'title',
         l ->> 'handle', l ->> 'size', l ->> 'image', (l ->> 'unit_price')::int,
         (l ->> 'quantity')::int
    from jsonb_array_elements(v_lines) l;

  update public.product_variants pv
     set stock = pv.stock - x.qty
    from (select (l ->> 'variant_id')::uuid as variant_id, sum((l ->> 'quantity')::int) as qty
            from jsonb_array_elements(v_lines) l
           group by 1) x
   where pv.id = x.variant_id;

  insert into public.order_events (order_id, kind, status, message)
  values (v_order.id, 'status', v_order.status,
          case v_delivery
            when 'handover' then 'Created in the admin (' || v_channel || ') — handed over in person and paid'
            else 'Created in the admin (' || v_channel || ') — to send with PostEx'
          end);

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
                            'status', v_order.status, 'total', v_order.total);
end;
$$;

revoke execute on function public.create_manual_order(jsonb), public.courier_fee_estimate()
  from public, anon, authenticated;
grant execute on function public.create_manual_order(jsonb), public.courier_fee_estimate()
  to authenticated;

-- New-order notifications: unchanged from *_notification_text.sql except that
-- orders the admin created themselves are skipped.
create or replace function private.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items   int;
  v_pending int;
begin
  -- The admin made it (create_manual_order) — no need to tell them.
  if coalesce(new.source ->> 'kind', '') = 'manual' then
    return null;
  end if;
  begin
    select coalesce(sum(quantity), 0) into v_items
      from public.order_items where order_id = new.id;
    select count(*) into v_pending from public.orders where status = 'pending';

    perform private.send_push(jsonb_build_object(
      'title',   'New order #' || new.order_number,
      'body',    format('%s %s totaling Rs.%s from Online Store.',
                        v_items, case when v_items = 1 then 'item' else 'items' end,
                        to_char(new.total, 'FM999,999,990')),
      'url',     '/admin/orders/' || new.id,
      'tag',     'order-' || new.order_number,
      'pending', v_pending
    ));
  exception when others then
    raise warning 'Order notification skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

-- admin_stats(): unchanged from *_courier_returns.sql except the earnings
-- figures (see the top of this file).
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
      select coalesce(o.courier_amount, o.total) as amount,
             coalesce(o.courier_returned_at,
                      (select max(e.created_at) from public.order_events e
                        where e.order_id = o.id and e.kind = 'status' and e.status = 'returned'),
                      o.updated_at) as at
        from public.orders o
       where o.status = 'returned' and o.tracking_number is not null
    ),
    -- Delivered without a courier: the admin handed it over in person.
    handed_over as (
      select o.total as amount,
             coalesce((select max(e.created_at) from public.order_events e
                        where e.order_id = o.id and e.kind = 'status' and e.status = 'delivered'),
                      o.updated_at) as at
        from public.orders o
       where o.status = 'delivered' and o.tracking_number is null
    ),
    f as (
      select public.courier_fee_estimate() as fee,
             (select count(*) from delivered where at > now() - interval '30 days') as d30_n,
             (select coalesce(sum(amount), 0) from delivered where at > now() - interval '30 days') as d30_amt,
             (select count(*) from delivered) as d_n,
             (select coalesce(sum(amount), 0) from delivered) as d_amt,
             (select count(*) from returned where at > now() - interval '30 days') as r30_n,
             (select count(*) from returned) as r_n,
             (select count(*) from handed_over where at > now() - interval '30 days') as h30_n,
             (select coalesce(sum(amount), 0) from handed_over where at > now() - interval '30 days') as h30_amt,
             (select count(*) from handed_over) as h_n,
             (select coalesce(sum(amount), 0) from handed_over) as h_amt
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
      'courier_fee', (select fee from f),
      'returned_30d_count', (select r30_n from f),
      'handover_30d_count', (select h30_n from f),
      'handover_30d_amount', (select h30_amt from f),
      'handover_all_count', (select h_n from f),
      'handover_all_amount', (select h_amt from f),
      'courier_fees_30d', (select fee * (d30_n + r30_n) from f),
      'courier_fees_all', (select fee * (d_n + r_n) from f),
      'earnings_30d', (select d30_amt + h30_amt - fee * (d30_n + r30_n) from f),
      'earnings_all', (select d_amt + h_amt - fee * (d_n + r_n) from f),
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

