-- Orders paid by PostEx (Ali, 2026-11-23): when PostEx closes a CPR, the
-- orders whose parcels it delivered in that payment are marked paid —
-- matched by tracking number, never returns (PostEx collected nothing), never
-- cancelled or returned orders. Each order is marked once, with a timeline
-- line saying which CPR paid it; an admin who later sets it back to unpaid
-- isn't overruled. api/postex.js calls this after every payments check. The
-- 27 orders PostEx had already paid were marked the same way by hand on
-- 2026-11-23.
--
-- Also: orders handed over in person count as earnings only once they're
-- marked paid (an in-person order marked unpaid hasn't been paid yet). And
-- amounts added by hand can be for any date — e.g. money from before 2026,
-- when PostEx payments aren't tracked: they count in the all-time total, and
-- in the last 30 days only when their date falls inside them.

alter table public.earning_entries drop constraint if exists earning_entries_earned_on_check;
alter table public.earning_entries
  add constraint earning_entries_earned_on_check check (earned_on >= date '2000-01-01');

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
    select o.id, o.order_number, p.cpr, p.settled_at
      from public.orders o
      join public.courier_payments p on p.tracking_number = o.tracking_number
     where p.settled and p.status ilike 'delivered'
       and o.courier = 'PostEx'
       and o.payment_status = 'unpaid'
       and o.status not in ('cancelled', 'returned')
       and not exists (select 1 from public.order_events e
                        where e.order_id = o.id and e.kind = 'payment' and e.message like 'Paid by PostEx in %')
       for update of o
  ),
  paid as (
    update public.orders o
       set payment_status = 'paid'
      from due
     where o.id = due.id
    returning o.id
  ),
  logged as (
    insert into public.order_events (order_id, kind, message)
    select due.id, 'payment',
           'Paid by PostEx in ' || due.cpr || ' (closed ' ||
           to_char(due.settled_at at time zone 'Asia/Karachi', 'FMDD Mon YYYY') || ')'
      from due
      join paid on paid.id = due.id
    returning order_id
  )
  select coalesce(jsonb_agg(due.order_number order by due.order_number), '[]'::jsonb)
    into v_marked
    from due
    join logged on logged.order_id = due.id;

  return v_marked;
end;
$$;

revoke execute on function public.courier_mark_paid() from public, anon, authenticated;
grant execute on function public.courier_mark_paid() to authenticated;

-- Same as *_earnings.sql, except in-person orders count once they're paid.
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
     where o.status = 'delivered' and o.tracking_number is null and o.payment_status = 'paid'
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

revoke all on function private.earning_lines() from public, anon, authenticated;
