-- Shopper journeys: what visitors do on the store, for the admin's
-- "Shoppers" view (Overview, below Live view, and /admin/shoppers). Kept
-- entirely apart from the Meta Pixel / Conversions API, like Live view.
--
-- The store sends one row per step (shop_journey): a page opened, a piece
-- added to the cart, the checkout opened with items, an order placed. Rows
-- carry the same random browser id as the presence ping (public.visitors)
-- and nothing else personal — no names, contact details or order numbers.
-- Only product ids are stored; names and prices come from the catalogue, so
-- a forged row can't put arbitrary text in front of the admin. Rows are
-- kept for 90 days, like visitors.

create table public.visitor_events (
  id         bigint generated always as identity primary key,
  visitor_id uuid not null,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('view', 'cart', 'checkout', 'order')),
  path       text check (path is null or length(path) <= 200),
  data       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048)
);

create index visitor_events_at_idx on public.visitor_events (at);
create index visitor_events_visitor_idx on public.visitor_events (visitor_id, at);

alter table public.visitor_events enable row level security;
revoke all on public.visitor_events from anon, authenticated;

-- One step. p_data per kind:
--   view      — nothing (the path says which page)
--   cart      — { product_id, size, qty }
--   checkout  — { items: [{ id, size, qty }] }      value + count are worked out here
--   order     — { value, count }                     the order itself is never referenced
create or replace function public.shop_journey(
  p_id uuid, p_kind text, p_path text default null, p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in    jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  v_path  text  := left(nullif(btrim(p_path), ''), 200);
  v_data  jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item  jsonb;
  v_pid   text;
  v_price int;
  v_qty   int;
  v_value int := 0;
  v_count int := 0;
begin
  if p_id is null or p_kind not in ('view', 'cart', 'checkout', 'order') then
    return;
  end if;
  if v_path is not null and v_path !~ '^/[A-Za-z0-9/_.~-]*$' then
    v_path := null;
  end if;

  if p_kind = 'cart' then
    v_pid := left(v_in ->> 'product_id', 64);
    select price into v_price from public.products where id = v_pid;
    if v_price is null then
      return; -- not a product we sell
    end if;
    v_qty  := case when (v_in ->> 'qty') ~ '^\d{1,2}$' then greatest((v_in ->> 'qty')::int, 1) else 1 end;
    v_data := jsonb_build_object('product_id', v_pid,
                                 'size', left(nullif(btrim(v_in ->> 'size'), ''), 20),
                                 'qty', v_qty, 'price', v_price);

  elsif p_kind = 'checkout' then
    if coalesce(jsonb_typeof(v_in -> 'items'), '') <> 'array' then
      return;
    end if;
    for v_item in select e from jsonb_array_elements(v_in -> 'items') e limit 20 loop
      v_pid := left(v_item ->> 'id', 64);
      select price into v_price from public.products where id = v_pid;
      if v_price is null then
        continue;
      end if;
      v_qty   := case when (v_item ->> 'qty') ~ '^\d{1,2}$' then greatest((v_item ->> 'qty')::int, 1) else 1 end;
      v_items := v_items || jsonb_build_object('product_id', v_pid,
                                               'size', left(nullif(btrim(v_item ->> 'size'), ''), 20),
                                               'qty', v_qty, 'price', v_price);
      v_value := v_value + v_price * v_qty;
      v_count := v_count + v_qty;
    end loop;
    if v_count = 0 then
      return;
    end if;
    v_data := jsonb_build_object('items', v_items, 'value', v_value, 'count', v_count);

  elsif p_kind = 'order' then
    v_data := jsonb_build_object(
      'value', case when (v_in ->> 'value') ~ '^\d{1,8}$' then (v_in ->> 'value')::int else 0 end,
      'count', case when (v_in ->> 'count') ~ '^\d{1,3}$' then (v_in ->> 'count')::int else 0 end);
  end if;

  -- Flood guards against scripted fakes: per browser and store-wide.
  if (select count(*) from public.visitor_events
       where visitor_id = p_id and at > now() - interval '10 minutes') >= 200
     or (select count(*) from public.visitor_events where at > now() - interval '1 minute') >= 3000 then
    return;
  end if;

  insert into public.visitor_events (visitor_id, kind, path, data)
  values (p_id, p_kind, v_path, v_data);

  -- Housekeeping: forget steps older than 90 days.
  if random() < 0.01 then
    delete from public.visitor_events where at < now() - interval '90 days';
  end if;
end;
$$;

-- The funnel for the Overview: how many browsers took each step in the last
-- p_days days, against all browsers seen, plus the purchases — website
-- orders in that time that weren't cancelled or returned (orders the admin
-- makes by hand aren't shopper behaviour) — and the pieces most often added
-- to a cart, with how many of each were bought.
create or replace function public.shopper_funnel(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
  v_from timestamptz := now() - make_interval(days => v_days);
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return (
    with ev as (
      select * from public.visitor_events where at > v_from
    ),
    sales as (
      select o.*, o.status in ('cancelled', 'returned') as lost
        from public.orders o
       where o.created_at > v_from
         and coalesce(o.source ->> 'kind', '') <> 'manual'
    )
    select jsonb_build_object(
      'days',     v_days,
      'since',    (select min(at) from public.visitor_events),
      'visitors', (select count(*) from public.visitors where last_seen > v_from),
      'home', jsonb_build_object(
        'browsers', (select count(distinct visitor_id) from ev where kind = 'view' and path = '/'),
        'events',   (select count(*) from ev where kind = 'view' and path = '/')),
      'cart', jsonb_build_object(
        'browsers', (select count(distinct visitor_id) from ev where kind = 'cart'),
        'events',   (select count(*) from ev where kind = 'cart')),
      'checkout', jsonb_build_object(
        'browsers', (select count(distinct visitor_id) from ev where kind = 'checkout'),
        'events',   (select count(*) from ev where kind = 'checkout')),
      'ordered', jsonb_build_object(
        'browsers', (select count(distinct visitor_id) from ev where kind = 'order'),
        'events',   (select count(*) from ev where kind = 'order')),
      'purchases', jsonb_build_object(
        'orders',    (select count(*) from sales where not lost),
        'amount',    (select coalesce(sum(total), 0) from sales where not lost),
        'cancelled', (select count(*) from sales where lost)),
      'top_added', coalesce((
        select jsonb_agg(jsonb_build_object('product_id', x.product_id,
                                            'title', coalesce(p.title, 'A removed piece'),
                                            'added', x.added, 'bought', coalesce(b.bought, 0))
                         order by x.added desc, x.product_id)
          from (select data ->> 'product_id' as product_id, count(*) as added
                  from ev where kind = 'cart'
                 group by 1 order by 2 desc, 1 limit 6) x
          left join public.products p on p.id = x.product_id
          left join lateral (
            select sum(oi.quantity) as bought
              from public.order_items oi
              join sales o on o.id = oi.order_id
             where oi.product_id = x.product_id and not o.lost) b on true
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- The journeys for /admin/shoppers: every browser that went past browsing in
-- the last p_days days (newest activity first), with where it is, how it
-- arrived, the furthest step it reached, and its steps in order — product
-- names resolved from the catalogue. p_stage keeps the browsers that got at
-- least that far: cart (the default), checkout or order — the same sets the
-- funnel counts.
create or replace function public.shopper_journeys(
  p_days int default 30, p_stage text default null, p_limit int default 150
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days  int := least(greatest(coalesce(p_days, 30), 1), 90);
  v_from  timestamptz := now() - make_interval(days => v_days);
  v_limit int := least(greatest(coalesce(p_limit, 150), 1), 500);
  v_rank  int := case p_stage when 'order' then 3 when 'checkout' then 2 else 1 end;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return coalesce((
    with ev as (
      select * from public.visitor_events where at > v_from
    ),
    shopper as (
      select visitor_id,
             case when bool_or(kind = 'order')    then 3
                  when bool_or(kind = 'checkout') then 2
                  when bool_or(kind = 'cart')     then 1
                  else 0 end as rank,
             min(at) as first_at,
             max(at) as last_at
        from ev
       group by visitor_id
    ),
    picked as (
      select s.*,
             case s.rank when 3 then 'order' when 2 then 'checkout' else 'cart' end as stage
        from shopper s
       where s.rank >= v_rank
       order by s.last_at desc
       limit v_limit
    )
    select jsonb_agg(jsonb_build_object(
             'key',      upper(left(md5(s.visitor_id::text), 4)),
             'stage',    s.stage,
             'first_at', s.first_at,
             'last_at',  s.last_at,
             'city',     v.city,
             'country',  v.country,
             'device',   v.device,
             'source',   v.source,
             'visits',   v.visits,
             -- Per-browser lookups read the table through its (visitor_id, at)
             -- index rather than scanning the whole window once per browser.
             'value',    (select (e.data ->> 'value')::int from public.visitor_events e
                           where e.visitor_id = s.visitor_id and e.at > v_from
                             and e.kind in ('checkout', 'order')
                           order by e.at desc limit 1),
             'events',   (select coalesce(jsonb_agg(jsonb_build_object(
                             'at',    e.at,
                             'kind',  e.kind,
                             'path',  e.path,
                             'title', coalesce(p.title, cp.title),
                             'size',  e.data ->> 'size',
                             'qty',   (e.data ->> 'qty')::int,
                             'price', (e.data ->> 'price')::int,
                             'value', (e.data ->> 'value')::int,
                             'count', (e.data ->> 'count')::int,
                             'items', (select jsonb_agg(jsonb_build_object(
                                          'title', coalesce(ip.title, 'A removed piece'),
                                          'size',  i ->> 'size',
                                          'qty',   (i ->> 'qty')::int,
                                          'price', (i ->> 'price')::int))
                                         from jsonb_array_elements(
                                                case when jsonb_typeof(e.data -> 'items') = 'array'
                                                     then e.data -> 'items' else '[]'::jsonb end) i
                                         left join public.products ip on ip.id = i ->> 'product_id')
                           ) order by e.at), '[]'::jsonb)
                            from (select * from public.visitor_events x
                                   where x.visitor_id = s.visitor_id and x.at > v_from
                                   order by x.at desc limit 60) e
                            left join public.products p  on e.kind = 'view' and e.path = '/products/' || p.handle
                            left join public.products cp on e.kind = 'cart' and cp.id = e.data ->> 'product_id')
           ) order by s.last_at desc)
      from picked s
      left join public.visitors v on v.id = s.visitor_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.shop_journey(uuid, text, text, jsonb),
                           public.shopper_funnel(int),
                           public.shopper_journeys(int, text, int)
  from public, anon, authenticated;
grant execute on function public.shop_journey(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.shopper_funnel(int), public.shopper_journeys(int, text, int)
  to authenticated;
