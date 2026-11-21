-- Earnings: the money actually received, counted from 1 January 2026
-- (Ali, 2026-11-23). Three kinds:
--   postex    — PostEx payments (CPRs) closed since then, at PostEx's own
--               figure or at the exact amount the admin entered for that CPR
--               (courier_cpr_amounts): what reached the bank;
--   in_person — orders handed over in person (delivered without a courier),
--               at their total, on the day they were marked delivered;
--   added     — amounts the admin adds by hand (earning_entries).
-- private.earning_lines() lists them; earnings_summary() (the Overview tile)
-- and courier_payments_report() (Overview → Earnings) total them.

create schema if not exists private;

create or replace function private.earnings_start()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2026-01-01 00:00:00+05' $$;

-- The exact amount received for a CPR, when PostEx's figure isn't it.
create table public.courier_cpr_amounts (
  cpr        text primary key check (char_length(cpr) between 3 and 40),
  amount     numeric(12,2) not null check (amount >= 0 and amount < 100000000),
  note       text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.courier_cpr_amounts enable row level security;
revoke all on public.courier_cpr_amounts from anon, authenticated;
grant select on public.courier_cpr_amounts to authenticated;
create policy "admins read cpr amounts" on public.courier_cpr_amounts
  for select to authenticated using ((select public.is_admin()));

-- Money received some other way, added by the admin.
create table public.earning_entries (
  id         uuid primary key default gen_random_uuid(),
  earned_on  date not null check (earned_on >= date '2026-01-01'),
  amount     numeric(12,2) not null check (amount > 0 and amount < 100000000),
  note       text not null check (char_length(btrim(note)) between 1 and 200),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index earning_entries_on_idx on public.earning_entries (earned_on);

alter table public.earning_entries enable row level security;
revoke all on public.earning_entries from anon, authenticated;
grant select, delete on public.earning_entries to authenticated;
grant insert (earned_on, amount, note), update (earned_on, amount, note)
  on public.earning_entries to authenticated;
create policy "admins manage earning entries" on public.earning_entries
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Set the amount received for a CPR, or (p_amount null) go back to PostEx's figure.
create or replace function public.set_cpr_amount(p_cpr text, p_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpr  text := btrim(coalesce(p_cpr, ''));
  v_note text := left(nullif(btrim(p_note), ''), 200);
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courier_payments where cpr = v_cpr) then
    raise exception 'No PostEx payment %.', v_cpr;
  end if;

  if p_amount is null then
    delete from public.courier_cpr_amounts where cpr = v_cpr;
    return jsonb_build_object('cpr', v_cpr, 'amount', null);
  end if;
  if p_amount < 0 or p_amount >= 100000000 then
    raise exception 'Enter the amount you received, in rupees.';
  end if;

  insert into public.courier_cpr_amounts (cpr, amount, note, updated_at, updated_by)
  values (v_cpr, round(p_amount, 2), v_note, now(), auth.uid())
  on conflict (cpr) do update
     set amount = excluded.amount, note = excluded.note,
         updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('cpr', v_cpr, 'amount', round(p_amount, 2));
end;
$$;

-- Every earning since 1 January 2026, one line each.
create or replace function private.earning_lines()
returns table (kind text, ref text, amount numeric, at timestamptz)
language sql
stable
set search_path = public
as $$
  with cpr as (
    select c.cpr,
           max(c.settled_at) as at,
           sum((case when c.status ilike 'delivered' then c.cod else 0 end) - c.fee - c.return_fee) as postex_amount
      from public.courier_payments c
     where c.cpr is not null
     group by c.cpr
    having bool_and(c.settled)
  ),
  handed as (
    select '#' || o.order_number as ref, o.total::numeric as amount,
           coalesce((select max(e.created_at) from public.order_events e
                      where e.order_id = o.id and e.kind = 'status' and e.status = 'delivered'),
                    o.updated_at) as at
      from public.orders o
     where o.status = 'delivered' and o.tracking_number is null
  )
  select 'postex', cpr.cpr, round(coalesce(a.amount, cpr.postex_amount), 2), cpr.at
    from cpr
    left join public.courier_cpr_amounts a on a.cpr = cpr.cpr
   where cpr.at >= private.earnings_start()
  union all
  select 'in_person', h.ref, h.amount, h.at
    from handed h
   where h.at >= private.earnings_start()
  union all
  select 'added', e.note, e.amount, (e.earned_on + time '12:00') at time zone 'Asia/Karachi'
    from public.earning_entries e
$$;

-- For the Overview tile: totals for the last 30 days and since 1 Jan 2026.
create or replace function public.earnings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return (
    with l as (select * from private.earning_lines())
    select jsonb_build_object(
      'since', private.earnings_start(),
      'd30', jsonb_build_object(
        'total',     coalesce((select round(sum(amount), 2) from l where at > now() - interval '30 days'), 0),
        'postex',    coalesce((select round(sum(amount), 2) from l where kind = 'postex' and at > now() - interval '30 days'), 0),
        'in_person', coalesce((select round(sum(amount), 2) from l where kind = 'in_person' and at > now() - interval '30 days'), 0),
        'added',     coalesce((select round(sum(amount), 2) from l where kind = 'added' and at > now() - interval '30 days'), 0)),
      'all', jsonb_build_object(
        'total',     coalesce((select round(sum(amount), 2) from l), 0),
        'postex',    coalesce((select round(sum(amount), 2) from l where kind = 'postex'), 0),
        'in_person', coalesce((select round(sum(amount), 2) from l where kind = 'in_person'), 0),
        'added',     coalesce((select round(sum(amount), 2) from l where kind = 'added'), 0),
        'in_person_count', (select count(*) from l where kind = 'in_person')))
  );
end;
$$;

-- The Earnings page: the totals above, CPRs since 1 Jan 2026 (each at the
-- amount received when the admin entered one, with PostEx's own figure
-- alongside), the amounts added by hand, and what PostEx still holds.
create or replace function public.courier_payments_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return (
    with p as (
      select c.*,
             (case when c.status ilike 'delivered' then c.cod else 0 end) - c.fee - c.return_fee as net,
             o.id as order_id,
             o.order_number
        from public.courier_payments c
        left join lateral (
          select x.id, x.order_number from public.orders x
           where x.tracking_number = c.tracking_number
           order by x.created_at desc limit 1) o on true
    ),
    parcel as (
      select p.*, jsonb_build_object(
               'tracking', p.tracking_number, 'ref', p.ref, 'booked_at', p.booked_at,
               'order_id', p.order_id, 'order_number', p.order_number, 'status', p.status,
               'cod', p.cod, 'fee', p.fee, 'return_fee', p.return_fee, 'net', round(p.net, 2)) as j
        from p
    ),
    grouped as (
      select cpr,
             min(cpr_at)                                            as generated_at,
             bool_and(settled)                                      as settled,
             max(settled_at)                                        as settled_at,
             round(sum(net), 2)                                     as postex_amount,
             sum(case when status ilike 'delivered' then cod else 0 end) as cod,
             round(sum(fee + return_fee), 2)                        as charges,
             count(*) filter (where status ilike 'delivered')      as delivered,
             count(*) filter (where status ilike 'return%')        as returns,
             count(*)                                               as parcels_count,
             jsonb_agg(j order by order_number nulls last, ref, tracking_number) as parcels
        from parcel
       where cpr is not null
       group by cpr
    ),
    cpr as (
      select g.*,
             coalesce(a.amount, g.postex_amount) as amount,
             a.amount is not null                as adjusted,
             a.note,
             a.updated_at                        as adjusted_at
        from grouped g
        left join public.courier_cpr_amounts a on a.cpr = g.cpr
       where coalesce(g.settled_at, g.generated_at) >= private.earnings_start()
    ),
    holding as (
      select * from parcel
       where cpr is null and (status ilike 'delivered' or status ilike 'return%')
    )
    select jsonb_build_object(
      'checked_at', (select max(checked_at) from public.courier_payments),
      'since',      private.earnings_start(),
      'earnings',   public.earnings_summary(),
      'paid_30d', jsonb_build_object(
        'amount', coalesce((select round(sum(amount), 2) from cpr where settled and settled_at > now() - interval '30 days'), 0),
        'count',  (select count(*) from cpr where settled and settled_at > now() - interval '30 days')),
      'paid_all', jsonb_build_object(
        'amount', coalesce((select round(sum(amount), 2) from cpr where settled), 0),
        'count',  (select count(*) from cpr where settled)),
      'generated', jsonb_build_object(
        'amount', coalesce((select round(sum(amount), 2) from cpr where not settled), 0),
        'count',  (select count(*) from cpr where not settled)),
      'holding', jsonb_build_object(
        'amount',  coalesce((select round(sum(net), 2) from holding), 0),
        'count',   (select count(*) from holding),
        'parcels', coalesce((select jsonb_agg(j order by booked_at desc nulls last) from holding), '[]'::jsonb)),
      'cprs', coalesce((select jsonb_agg(jsonb_build_object(
                  'cpr', cpr, 'generated_at', generated_at, 'settled', settled, 'settled_at', settled_at,
                  'amount', amount, 'postex_amount', postex_amount, 'adjusted', adjusted, 'note', note,
                  'adjusted_at', adjusted_at, 'cod', cod, 'charges', charges, 'delivered', delivered,
                  'returns', returns, 'count', parcels_count, 'parcels', parcels)
                  order by coalesce(settled_at, generated_at) desc nulls last, cpr desc)
                  from cpr), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', e.id, 'earned_on', e.earned_on, 'amount', e.amount, 'note', e.note)
                  order by e.earned_on desc, e.created_at desc)
                  from public.earning_entries e), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.set_cpr_amount(text, numeric, text), public.earnings_summary()
  from public, anon, authenticated;
grant execute on function public.set_cpr_amount(text, numeric, text), public.earnings_summary()
  to authenticated;
revoke all on function private.earning_lines(), private.earnings_start() from public, anon, authenticated;
