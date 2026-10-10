-- Live visitors, part two: roughly where visitors are, for the admin's globe.
--
-- Adds the approximate city Vercel works out from each connection
-- (api/shop-region.js, asked once per visit) — the IP address itself is never
-- stored. The presence ping is renamed from track_visit to shop_presence,
-- since ad blockers filter words like "track".

alter table public.visitors
  add column country text check (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2
  add column region  text,
  add column city    text,
  add column lat     double precision check (lat between -90 and 90),
  add column lng     double precision check (lng between -180 and 180);

drop function public.track_visit(uuid, text, text, text, int);

-- A visit ends after 30 minutes without a ping; the next one starts a new
-- visit and takes that visit's source. Location fields are optional (the
-- first ping of a visit is sent before the location lookup returns) and only
-- overwrite when given.
create or replace function public.shop_presence(
  p_id uuid, p_path text, p_source text, p_device text, p_cart_items int,
  p_country text default null, p_region text default null, p_city text default null,
  p_lat double precision default null, p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path    text := left(coalesce(nullif(btrim(p_path), ''), '/'), 200);
  v_source  text := left(coalesce(nullif(btrim(p_source), ''), 'Direct'), 40);
  v_device  text := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end;
  v_cart    int  := least(greatest(coalesce(p_cart_items, 0), 0), 999);
  v_country text := case when upper(p_country) ~ '^[A-Z]{2}$' then upper(p_country) end;
  v_region  text := left(nullif(btrim(p_region), ''), 80);
  v_city    text := left(nullif(btrim(p_city), ''), 80);
  -- Two decimals (about 1 km) is plenty for a map dot.
  v_lat     double precision := case when p_lat between -90 and 90 and p_lng between -180 and 180
                                     then round(p_lat::numeric, 2) end;
  v_lng     double precision := case when p_lat between -90 and 90 and p_lng between -180 and 180
                                     then round(p_lng::numeric, 2) end;
begin
  if p_id is null then
    return;
  end if;

  -- Every right-hand side sees the row as it was before this ping.
  update public.visitors v
     set path        = v_path,
         device      = v_device,
         cart_items  = v_cart,
         last_seen   = now(),
         visit_start = case when v.last_seen < now() - interval '30 minutes' then now() else v.visit_start end,
         visits      = v.visits + case when v.last_seen < now() - interval '30 minutes' then 1 else 0 end,
         source      = case when v.last_seen < now() - interval '30 minutes' then v_source else v.source end,
         country     = coalesce(v_country, v.country),
         region      = case when v_country is not null then v_region else v.region end,
         city        = case when v_country is not null then v_city else v.city end,
         lat         = case when v_lat is not null then v_lat else v.lat end,
         lng         = case when v_lat is not null then v_lng else v.lng end
   where v.id = p_id;

  if not found then
    -- Crude flood guard against scripted fake visitors.
    if (select count(*) from public.visitors where first_seen > now() - interval '1 minute') >= 300 then
      return;
    end if;
    insert into public.visitors (id, path, source, device, cart_items, country, region, city, lat, lng)
    values (p_id, v_path, v_source, v_device, v_cart, v_country, v_region, v_city, v_lat, v_lng)
    on conflict (id) do nothing;
  end if;

  -- Housekeeping: forget browsers not seen for 90 days.
  if random() < 0.01 then
    delete from public.visitors where last_seen < now() - interval '90 days';
  end if;
end;
$$;

-- "Right now" = a ping in the last 75 seconds (tabs ping every 30).
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
      -- One entry per city (or per country when the city is unknown).
      'places', coalesce((
        select jsonb_agg(jsonb_build_object('city', city, 'country', country,
                                            'lat', lat, 'lng', lng, 'n', n)
                         order by n desc, country, city)
          from (select city, country,
                       round(avg(lat)::numeric, 2) as lat, round(avg(lng)::numeric, 2) as lng,
                       count(*) as n
                  from live
                 where country is not null
                 group by country, city
                 order by count(*) desc
                 limit 60) x
      ), '[]'::jsonb),
      'last_30m', (select count(*) from public.visitors where last_seen > now() - interval '30 minutes'),
      'today',    (select count(*) from public.visitors where last_seen >= v_today)
    )
  );
end;
$$;

revoke execute on function public.shop_presence(uuid, text, text, text, int, text, text, text, double precision, double precision),
                           public.live_visitors()
  from public, anon, authenticated;
grant execute on function public.shop_presence(uuid, text, text, text, int, text, text, text, double precision, double precision)
  to anon, authenticated;
grant execute on function public.live_visitors() to authenticated;
