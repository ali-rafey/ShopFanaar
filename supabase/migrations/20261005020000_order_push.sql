-- ============================================================================
-- Order push notifications.
--
-- When an order is placed, the database calls the Vercel function
-- /api/notify-order (via pg_net, asynchronously) with the notification text
-- and the admin devices to send it to. The function signs and sends a Web
-- Push to each device. A notification problem can never block a sale.
--
-- One-time server config (not in git — contains the shared secret):
--   insert into private.notify_config (url, secret)
--   values ('https://www.shopfanaar.com/api/notify-order', '<NOTIFY_SECRET>');
-- ============================================================================

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public;

create table private.notify_config (
  id     int primary key default 1 check (id = 1),
  url    text not null,
  secret text not null
);

-- Admin devices (phones/browsers) that turned on order notifications.
create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "admins manage their own devices" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid() and (select public.is_admin()))
  with check (user_id = auth.uid() and (select public.is_admin()));

-- ---------- Sending ---------------------------------------------------------

-- Queues one call to the push function. Returns the pg_net request id, or
-- null when notifications aren't configured or no device is registered.
create or replace function private.send_push(p_payload jsonb, p_user uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg  private.notify_config;
  subs jsonb;
begin
  select * into cfg from private.notify_config where id = 1;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into subs
    from public.push_subscriptions s
   where (p_user is null or s.user_id = p_user)
     and exists (select 1 from public.admins a where a.user_id = s.user_id);

  if jsonb_array_length(subs) = 0 then
    return null;
  end if;

  return net.http_post(
    url                  := cfg.url,
    body                 := p_payload || jsonb_build_object('subscriptions', subs),
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-notify-secret', cfg.secret),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Fires at COMMIT (deferred), once the order's items exist.
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
      'title',   'Fanaar',
      'body',    format('Fanaar has a new order for %s %s totaling Rs.%s from Online Store.',
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

create constraint trigger orders_notify_new
  after insert on public.orders
  deferrable initially deferred
  for each row execute function private.notify_new_order();

-- ---------- Admin: test from Settings ---------------------------------------

-- Sends a sample notification to the caller's own devices. Returns the
-- request id so the admin can check the outcome with push_test_result().
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
    'title', 'Fanaar',
    'body',  'Test: Fanaar has a new order for 1 item totaling Rs.2,400 from Online Store.',
    'url',   '/admin/orders',
    'tag',   'test-' || floor(extract(epoch from now()))::bigint
  ), auth.uid());
  return v_id;
end;
$$;

-- Outcome of a test push: null while still in flight, else
-- { status, body } from the push function.
create or replace function public.push_test_result(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select status_code, content, error_msg, timed_out into r
    from net._http_response where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'status', r.status_code,
    'body',   left(coalesce(r.content, r.error_msg, ''), 500),
    'timed_out', coalesce(r.timed_out, false)
  );
end;
$$;

-- Called by the push function (with the shared secret) to drop devices the
-- push service reports as gone.
create or replace function public.prune_push_subscriptions(p_secret text, p_endpoints text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_secret is null
     or p_secret is distinct from (select secret from private.notify_config where id = 1) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.send_push(jsonb, uuid),
                           private.notify_new_order()
  from public, anon, authenticated;
revoke execute on function public.send_test_push(),
                           public.push_test_result(bigint),
                           public.prune_push_subscriptions(text, text[])
  from public, anon, authenticated;
grant execute on function public.send_test_push(),
                          public.push_test_result(bigint)
  to authenticated;
grant execute on function public.prune_push_subscriptions(text, text[])
  to anon, authenticated;
