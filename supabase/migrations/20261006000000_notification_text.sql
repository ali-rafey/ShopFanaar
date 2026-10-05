-- iPhone always inserts a "from <app name>" line under the title of a
-- home-screen web app notification. Title the notification with the order
-- so that line reads naturally:
--
--   New order #1001
--   from Fanaar
--   2 items totaling Rs.5,050 from Online Store.

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

create or replace function public.send_test_push()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from private.notify_config) then
    raise exception 'Notifications aren''t configured on the server yet.';
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = auth.uid()) then
    raise exception 'Turn on notifications on this device first.';
  end if;

  v_id := private.send_push(jsonb_build_object(
    'title', 'Test order',
    'body',  '1 item totaling Rs.2,400 from Online Store.',
    'url',   '/admin/orders',
    'tag',   'test-' || floor(extract(epoch from now()))::bigint
  ), auth.uid());
  return v_id;
end;
$$;
