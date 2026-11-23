-- Earnings for any period (Ali, 2026-11-24): Overview → Earnings → "Pick a
-- period" — e.g. the last 45 days, last month, or any two dates. Periods are
-- whole Pakistan calendar days, both ends included; "the last N days" is
-- today and the N − 1 days before it. The Overview tile's "last 30 days"
-- now counts the same way, so the two always agree.

-- Earnings between two dates (null from = from the start, null to = today):
-- totals by kind, and every line, newest first.
create or replace function public.earnings_between(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_from  timestamptz;
  v_to    timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The start date is after the end date.';
  end if;
  v_from := coalesce(p_from, date '2000-01-01')::timestamp at time zone 'Asia/Karachi';
  v_to   := (coalesce(p_to, v_today) + 1)::timestamp at time zone 'Asia/Karachi';

  return (
    with l as (
      select * from private.earning_lines() where at >= v_from and at < v_to
    )
    select jsonb_build_object(
      'from',      p_from,
      'to',        coalesce(p_to, v_today),
      'total',     coalesce(round(sum(amount), 2), 0),
      'postex',    coalesce(round(sum(amount) filter (where kind = 'postex'), 2), 0),
      'in_person', coalesce(round(sum(amount) filter (where kind = 'in_person'), 2), 0),
      'added',     coalesce(round(sum(amount) filter (where kind = 'added'), 2), 0),
      'lines',     coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'amount', round(amount, 2), 'at', at)
                                      order by at desc), '[]'::jsonb))
      from l
  );
end;
$$;

-- The tile: the last 30 days counted as calendar days, like the periods.
create or replace function public.earnings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := ((now() at time zone 'Asia/Karachi')::date - 29)::timestamp at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return (
    with l as (select * from private.earning_lines())
    select jsonb_build_object(
      'since', private.earnings_start(),
      'd30', jsonb_build_object(
        'total',     coalesce((select round(sum(amount), 2) from l where at >= v_from), 0),
        'postex',    coalesce((select round(sum(amount), 2) from l where kind = 'postex' and at >= v_from), 0),
        'in_person', coalesce((select round(sum(amount), 2) from l where kind = 'in_person' and at >= v_from), 0),
        'added',     coalesce((select round(sum(amount), 2) from l where kind = 'added' and at >= v_from), 0)),
      'all', jsonb_build_object(
        'total',     coalesce((select round(sum(amount), 2) from l), 0),
        'postex',    coalesce((select round(sum(amount), 2) from l where kind = 'postex'), 0),
        'in_person', coalesce((select round(sum(amount), 2) from l where kind = 'in_person'), 0),
        'added',     coalesce((select round(sum(amount), 2) from l where kind = 'added'), 0),
        'in_person_count', (select count(*) from l where kind = 'in_person')))
  );
end;
$$;

revoke execute on function public.earnings_between(date, date) from public, anon, authenticated;
grant execute on function public.earnings_between(date, date) to authenticated;
