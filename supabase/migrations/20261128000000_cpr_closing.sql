-- CPRs are closed in Fanaar by the admin (Ali, 2026-11-28).
--
-- PostEx's API marks a parcel "settled" a few hours after its CPR is
-- generated, while the merchant portal still shows that CPR as "New" until
-- PostEx pays it — and the API has no field for the portal's New / Closed.
-- So a CPR stays "Generated" in Fanaar until the admin closes it (Overview →
-- Earnings → the CPR → Close), with the exact amount received if it differs
-- from PostEx's figure. Closing marks the orders PostEx delivered in that CPR
-- paid, and only closed CPRs count as earnings, on the day they were closed.
-- Reopening undoes both. Every CPR PostEx had settled by now counts as closed
-- on its settlement day (Ali: "it's ok this time").

create table public.courier_cpr_closures (
  cpr       text primary key check (char_length(cpr) between 3 and 40),
  closed_at timestamptz not null default now(),
  closed_by uuid default auth.uid()
);

alter table public.courier_cpr_closures enable row level security;
revoke all on public.courier_cpr_closures from anon, authenticated;
grant select on public.courier_cpr_closures to authenticated;
create policy "admins read cpr closures" on public.courier_cpr_closures
  for select to authenticated using ((select public.is_admin()));

insert into public.courier_cpr_closures (cpr, closed_at, closed_by)
select cpr, max(settled_at), null
  from public.courier_payments
 where cpr is not null
 group by cpr
having bool_and(settled)
on conflict (cpr) do nothing;

-- Close a CPR: optionally set the amount received, then mark the orders
-- PostEx delivered in it paid (by tracking number; never returns, cancelled
-- or returned orders), each with a timeline line. → { cpr, marked: [order numbers] }
create or replace function public.close_cpr(p_cpr text, p_amount numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpr    text := btrim(coalesce(p_cpr, ''));
  v_marked jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courier_payments where cpr = v_cpr) then
    raise exception 'No PostEx payment %.', v_cpr;
  end if;
  if exists (select 1 from public.courier_cpr_closures where cpr = v_cpr) then
    raise exception '% is already closed.', v_cpr;
  end if;

  if p_amount is not null then
    perform public.set_cpr_amount(v_cpr, p_amount, p_note);
  end if;
  insert into public.courier_cpr_closures (cpr, closed_at, closed_by) values (v_cpr, now(), auth.uid());

  with due as (
    select o.id, o.order_number
      from public.orders o
      join public.courier_payments p on p.tracking_number = o.tracking_number
     where p.cpr = v_cpr
       and p.status ilike 'delivered'
       and o.courier = 'PostEx'
       and o.payment_status = 'unpaid'
       and o.status not in ('cancelled', 'returned')
       for update of o
  ),
  paid as (
    update public.orders o set payment_status = 'paid' from due where o.id = due.id returning o.id
  ),
  logged as (
    insert into public.order_events (order_id, kind, message)
    select due.id, 'payment',
           'Paid by PostEx in ' || v_cpr || ' (closed ' || to_char(now() at time zone 'Asia/Karachi', 'FMDD Mon YYYY') || ')'
      from due join paid on paid.id = due.id
    returning order_id
  )
  select coalesce(jsonb_agg(due.order_number order by due.order_number), '[]'::jsonb)
    into v_marked
    from due join logged on logged.order_id = due.id;

  return jsonb_build_object('cpr', v_cpr, 'marked', v_marked);
end;
$$;

-- Reopen a closed CPR (closed by mistake): it's Generated again, stops
-- counting as earnings, and the orders its closing marked paid go back to
-- unpaid, each with a timeline line. → { cpr, unmarked: [order numbers] }
create or replace function public.reopen_cpr(p_cpr text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpr      text := btrim(coalesce(p_cpr, ''));
  v_unmarked jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courier_cpr_closures where cpr = v_cpr) then
    raise exception '% isn''t closed.', v_cpr;
  end if;

  delete from public.courier_cpr_closures where cpr = v_cpr;

  with due as (
    select o.id, o.order_number
      from public.orders o
      join public.courier_payments p on p.tracking_number = o.tracking_number
     where p.cpr = v_cpr
       and o.payment_status = 'paid'
       and exists (select 1 from public.order_events e
                    where e.order_id = o.id and e.kind = 'payment'
                      and e.message like 'Paid by PostEx in ' || v_cpr || ' (%')
       for update of o
  ),
  unpaid as (
    update public.orders o set payment_status = 'unpaid' from due where o.id = due.id returning o.id
  ),
  logged as (
    insert into public.order_events (order_id, kind, message)
    select due.id, 'payment', 'Back to unpaid: ' || v_cpr || ' was reopened'
      from due join unpaid on unpaid.id = due.id
    returning order_id
  )
  select coalesce(jsonb_agg(due.order_number order by due.order_number), '[]'::jsonb)
    into v_unmarked
    from due join logged on logged.order_id = due.id;

  return jsonb_build_object('cpr', v_cpr, 'unmarked', v_unmarked);
end;
$$;

-- The payments check (api/postex.js) still calls this; it now only marks
-- orders in CPRs the admin has closed — PostEx's "settled" alone never does.
create or replace function public.courier_mark_paid()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marked jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  with due as (
    select o.id, o.order_number, p.cpr, k.closed_at
      from public.orders o
      join public.courier_payments p on p.tracking_number = o.tracking_number
      join public.courier_cpr_closures k on k.cpr = p.cpr
     where p.status ilike 'delivered'
       and o.courier = 'PostEx'
       and o.payment_status = 'unpaid'
       and o.status not in ('cancelled', 'returned')
       and not exists (select 1 from public.order_events e
                        where e.order_id = o.id and e.kind = 'payment' and e.message like 'Paid by PostEx in %')
       for update of o
  ),
  paid as (
    update public.orders o set payment_status = 'paid' from due where o.id = due.id returning o.id
  ),
  logged as (
    insert into public.order_events (order_id, kind, message)
    select due.id, 'payment',
           'Paid by PostEx in ' || due.cpr || ' (closed ' ||
           to_char(due.closed_at at time zone 'Asia/Karachi', 'FMDD Mon YYYY') || ')'
      from due join paid on paid.id = due.id
    returning order_id
  )
  select coalesce(jsonb_agg(due.order_number order by due.order_number), '[]'::jsonb)
    into v_marked
    from due join logged on logged.order_id = due.id;

  return v_marked;
end;
$$;

-- Earnings: a CPR counts once the admin has closed it, on the day it was closed.
create or replace function private.earning_lines()
returns table (kind text, ref text, amount numeric, at timestamptz)
language sql
stable
set search_path = public
as $$
  with cpr as (
    select c.cpr,
           sum((case when c.status ilike 'delivered' then c.cod else 0 end) - c.fee - c.return_fee) as postex_amount
      from public.courier_payments c
     where c.cpr is not null
     group by c.cpr
  ),
  handed as (
    select '#' || o.order_number as ref, o.total::numeric as amount,
           coalesce((select max(e.created_at) from public.order_events e
                      where e.order_id = o.id and e.kind = 'status' and e.status = 'delivered'),
                    o.updated_at) as at
      from public.orders o
     where o.status = 'delivered' and o.tracking_number is null and o.payment_status = 'paid'
  )
  select 'postex', cpr.cpr, round(coalesce(a.amount, cpr.postex_amount), 2), k.closed_at
    from cpr
    join public.courier_cpr_closures k on k.cpr = cpr.cpr
    left join public.courier_cpr_amounts a on a.cpr = cpr.cpr
   where k.closed_at >= private.earnings_start()
  union all
  select 'in_person', h.ref, h.amount, h.at
    from handed h
   where h.at >= private.earnings_start()
  union all
  select 'added', e.note, e.amount, (e.earned_on + time '12:00') at time zone 'Asia/Karachi'
    from public.earning_entries e
$$;

-- The Earnings page: as before, with each CPR's Fanaar status — closed
-- (closed_at) or generated — and PostEx's own "settled" kept for reference.
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
             o.order_number,
             o.payment_status as order_paid
        from public.courier_payments c
        left join lateral (
          select x.id, x.order_number, x.payment_status from public.orders x
           where x.tracking_number = c.tracking_number
           order by x.created_at desc limit 1) o on true
    ),
    parcel as (
      select p.*, jsonb_build_object(
               'tracking', p.tracking_number, 'ref', p.ref, 'booked_at', p.booked_at,
               'order_id', p.order_id, 'order_number', p.order_number, 'payment_status', p.order_paid,
               'status', p.status, 'cod', p.cod, 'fee', p.fee, 'return_fee', p.return_fee,
               'net', round(p.net, 2)) as j
        from p
    ),
    grouped as (
      select cpr,
             min(cpr_at)                                            as generated_at,
             bool_and(settled)                                      as postex_settled,
             max(settled_at)                                        as postex_settled_at,
             round(sum(net), 2)                                     as postex_amount,
             sum(case when status ilike 'delivered' then cod else 0 end) as cod,
             round(sum(fee + return_fee), 2)                        as charges,
             count(*) filter (where status ilike 'delivered')      as delivered,
             count(*) filter (where status ilike 'return%')        as returns,
             count(*) filter (where status ilike 'delivered' and order_paid = 'unpaid') as to_mark,
             count(*)                                               as parcels_count,
             jsonb_agg(j order by order_number nulls last, ref, tracking_number) as parcels
        from parcel
       where cpr is not null
       group by cpr
    ),
    cpr as (
      select g.*,
             k.closed_at is not null             as closed,
             k.closed_at,
             coalesce(a.amount, g.postex_amount) as amount,
             a.amount is not null                as adjusted,
             a.note,
             a.updated_at                        as adjusted_at
        from grouped g
        left join public.courier_cpr_closures k on k.cpr = g.cpr
        left join public.courier_cpr_amounts a on a.cpr = g.cpr
       where coalesce(k.closed_at, g.generated_at) >= private.earnings_start()
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
        'amount', coalesce((select round(sum(amount), 2) from cpr where closed and closed_at > now() - interval '30 days'), 0),
        'count',  (select count(*) from cpr where closed and closed_at > now() - interval '30 days')),
      'paid_all', jsonb_build_object(
        'amount', coalesce((select round(sum(amount), 2) from cpr where closed), 0),
        'count',  (select count(*) from cpr where closed)),
      'generated', jsonb_build_object(
        'amount', coalesce((select round(sum(amount), 2) from cpr where not closed), 0),
        'count',  (select count(*) from cpr where not closed)),
      'holding', jsonb_build_object(
        'amount',  coalesce((select round(sum(net), 2) from holding), 0),
        'count',   (select count(*) from holding),
        'parcels', coalesce((select jsonb_agg(j order by booked_at desc nulls last) from holding), '[]'::jsonb)),
      'cprs', coalesce((select jsonb_agg(jsonb_build_object(
                  'cpr', cpr, 'generated_at', generated_at, 'closed', closed, 'closed_at', closed_at,
                  'postex_settled', postex_settled, 'postex_settled_at', postex_settled_at,
                  'amount', amount, 'postex_amount', postex_amount, 'adjusted', adjusted, 'note', note,
                  'adjusted_at', adjusted_at, 'cod', cod, 'charges', charges, 'delivered', delivered,
                  'returns', returns, 'to_mark', to_mark, 'count', parcels_count, 'parcels', parcels)
                  order by (not closed) desc, coalesce(closed_at, generated_at) desc nulls last, cpr desc)
                  from cpr), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', e.id, 'earned_on', e.earned_on, 'amount', e.amount, 'note', e.note)
                  order by e.earned_on desc, e.created_at desc)
                  from public.earning_entries e), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.close_cpr(text, numeric, text), public.reopen_cpr(text)
  from public, anon, authenticated;
grant execute on function public.close_cpr(text, numeric, text), public.reopen_cpr(text)
  to authenticated;
revoke all on function private.earning_lines() from public, anon, authenticated;
