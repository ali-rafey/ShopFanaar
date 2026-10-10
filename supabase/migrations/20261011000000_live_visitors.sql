-- Live visitors: Fanaar's own count of who is on the store right now, kept
-- entirely apart from the Meta Pixel / Conversions API.
--
-- While a store tab is open and visible it sends a small heartbeat
-- (track_visit) every 30 seconds and on every page change. One row per
-- browser, keyed by a random id the store keeps in localStorage. Stored: the
-- page, how the visit arrived, device type and how many items are in the cart
-- — no names, IP addresses or contact details. The admin reads the summary
-- through live_visitors().

create table public.visitors (
  id          uuid primary key,
  first_seen  timestamptz not null default now(),
  visit_start timestamptz not null default now(),  -- start of the current visit
  last_seen   timestamptz not null default now(),
  visits      int not null default 1,
  path        text not null,
  source      text not null,                       -- how the current visit arrived
  device      text not null check (device in ('mobile', 'tablet', 'desktop')),
  cart_items  int not null default 0
);

create index visitors_last_seen_idx on public.visitors (last_seen);
create index visitors_first_seen_idx on public.visitors (first_seen);

alter table public.visitors enable row level security;
revoke all on public.visitors from anon, authenticated;

-- A visit ends after 30 minutes without a heartbeat; the next one starts a
-- new visit and takes that visit's source.
create or replace function public.track_visit(
  p_id uuid, p_path text, p_source text, p_device text, p_cart_items int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path   text := left(coalesce(nullif(btrim(p_path), ''), '/'), 200);
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'Direct'), 40);
  v_device text := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end;
  v_cart   int  := least(greatest(coalesce(p_cart_items, 0), 0), 999);
begin
  if p_id is null then
    return;
  end if;

  -- Every right-hand side sees the row as it was before this heartbeat.
  update public.visitors v
     set path        = v_path,
         device      = v_device,
         cart_items  = v_cart,
         last_seen   = now(),
         visit_start = case when v.last_seen < now() - interval '30 minutes' then now() else v.visit_start end,
         visits      = v.visits + case when v.last_seen < now() - interval '30 minutes' then 1 else 0 end,
         source      = case when v.last_seen < now() - interval '30 minutes' then v_source else v.source end
   where v.id = p_id;

  if not found then
    -- Crude flood guard against scripted fake visitors.
    if (select count(*) from public.visitors where first_seen > now() - interval '1 minute') >= 300 then
      return;
    end if;
    insert into public.visitors (id, path, source, device, cart_items)
    values (p_id, v_path, v_source, v_device, v_cart)
    on conflict (id) do nothing;
  end if;

  -- Housekeeping: forget browsers not seen for 90 days.
  if random() < 0.01 then
    delete from public.visitors where last_seen < now() - interval '90 days';
  end if;
end;
$$;

-- "Right now" = a heartbeat in the last 75 seconds (tabs beat every 30).
create or replace function public.live_visitors()
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
    with live as (
      select * from public.visitors where last_seen > now() - interval '75 seconds'
    )
    select jsonb_build_object(
      'now',          (select count(*) from live),
      'checking_out', (select count(*) from live where path = '/checkout'),
      'with_cart',    (select count(*) from live where cart_items > 0 and path not in ('/checkout', '/order')),
      'ordered',      (select count(*) from live where path = '/order'),
      'pages', coalesce((
        select jsonb_agg(jsonb_build_object('path', x.path, 'title', p.title, 'n', x.n)
                         order by x.n desc, x.path)
          from (select path, count(*) as n from live group by path
                 order by count(*) desc, path limit 8) x
          left join public.products p on x.path = '/products/' || p.handle
      ), '[]'::jsonb),
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object('source', source, 'n', n) order by n desc, source)
          from (select source, count(*) as n from live group by source) x
      ), '[]'::jsonb),
      'devices', coalesce((
        select jsonb_object_agg(device, n)
          from (select device, count(*) as n from live group by device) x
      ), '{}'::jsonb),
      'last_30m', (select count(*) from public.visitors where last_seen > now() - interval '30 minutes'),
      'today',    (select count(*) from public.visitors where last_seen >= v_today)
    )
  );
end;
$$;

revoke execute on function public.track_visit(uuid, text, text, text, int),
                           public.live_visitors()
  from public, anon, authenticated;
grant execute on function public.track_visit(uuid, text, text, text, int) to anon, authenticated;
grant execute on function public.live_visitors() to authenticated;
