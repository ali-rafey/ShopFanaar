-- Order discounts: the admin can take an amount off an order's total — typed
-- in rupees, or as a percentage that the admin works out in rupees (of the
-- full total, shipping included) and passes as p_percent for the timeline.
--
-- orders.discount has existed since the first migration (always 0 so far);
-- total = subtotal + shipping_fee − discount. Totals only change through
-- functions, so this is one. It works until the order is booked with a
-- courier: the booking carries the amount to collect, so a booked order has
-- to be un-booked first (PostEx: Cancel booking), then booked again.

create or replace function public.set_order_discount(
  p_order_id uuid, p_discount int, p_percent numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_full  int;
  v_new   int := coalesce(p_discount, 0);
  v_pct   text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_order.status in ('delivered', 'cancelled', 'returned') then
    raise exception 'This order is %, so its total can''t change now.', v_order.status;
  end if;
  if v_order.tracking_number is not null then
    raise exception 'This order is already booked with %. Cancel the booking first, then change the discount and book it again.',
      coalesce(v_order.courier, 'a courier');
  end if;

  v_full := v_order.subtotal + v_order.shipping_fee;
  if v_new < 0 or v_new > v_full then
    raise exception 'The discount must be between Rs.0 and the order total, Rs.%.', to_char(v_full, 'FM999,999,990');
  end if;
  if p_percent is not null and (p_percent <= 0 or p_percent > 100) then
    raise exception 'The percentage must be more than 0 and at most 100.';
  end if;

  if v_new = v_order.discount then
    return jsonb_build_object('discount', v_order.discount, 'total', v_order.total);
  end if;

  update public.orders
     set discount = v_new,
         total    = v_full - v_new
   where id = p_order_id
  returning * into v_order;

  -- 10 → "10%", 12.50 → "12.5%"
  v_pct := case when v_new > 0 and p_percent is not null
                then ' (' || trim(trailing '.' from trim(trailing '0' from round(p_percent, 2)::text)) || '% off)' end;
  insert into public.order_events (order_id, kind, message)
  values (p_order_id, 'payment',
          case when v_new = 0
               then 'Discount removed · total Rs.' || to_char(v_order.total, 'FM999,999,990')
               else 'Discount Rs.' || to_char(v_new, 'FM999,999,990') || coalesce(v_pct, '')
                    || ' · total Rs.' || to_char(v_order.total, 'FM999,999,990') end);

  return jsonb_build_object('discount', v_order.discount, 'total', v_order.total);
end;
$$;

revoke execute on function public.set_order_discount(uuid, int, numeric) from public, anon, authenticated;
grant execute on function public.set_order_discount(uuid, int, numeric) to authenticated;
