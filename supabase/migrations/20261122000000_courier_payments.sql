-- PostEx payments (CPRs) for the admin: Overview → Earnings → PostEx payments.
--
-- PostEx's API has no list of CPRs (cash payment receipts). Each parcel's
-- payment status says which CPR it went into and when that CPR was generated
-- (cpr1, cpr1Date), and whether PostEx has closed it — paid — and when
-- (settle, settlementDate). api/postex.js ("payments") keeps this table up to
-- date: every parcel from get-all-order with the cash PostEx collects and its
-- charges, plus its payment status until it's paid (after that it never
-- changes, so it isn't asked again). courier_payments_report() groups it into
-- CPRs for the page.
--
-- Every PostEx parcel is here, including ones booked in the PostEx portal and
-- before the store moved off Shopify — all of them count towards what PostEx
-- pays. No customer details are kept; parcels are matched to store orders by
-- tracking number when the report is made.

create table public.courier_payments (
  tracking_number text primary key check (tracking_number ~ '^[0-9A-Za-z-]{6,40}$'),
  ref         text,                                -- PostEx's order reference
  booked_at   timestamptz,
  status      text not null,                       -- PostEx's own status (Delivered, Return, …)
  cod         int not null default 0,              -- cash PostEx collects
  fee         numeric(10,2) not null default 0,    -- delivery charge + its tax
  return_fee  numeric(10,2) not null default 0,    -- return charge + its tax
  cpr         text,                                -- the CPR the parcel went into
  cpr_at      timestamptz,                         -- when that CPR was generated
  settled     boolean not null default false,      -- the CPR is closed: PostEx has paid
  settled_at  timestamptz,
  checked_at  timestamptz,                         -- last payment-status check
  updated_at  timestamptz not null default now()
);

create index courier_payments_cpr_idx on public.courier_payments (cpr) where cpr is not null;
create index courier_payments_open_idx on public.courier_payments (booked_at) where not settled;

alter table public.courier_payments enable row level security;
revoke all on public.courier_payments from anon, authenticated;
grant select on public.courier_payments to authenticated;
create policy "admins read courier payments" on public.courier_payments
  for select to authenticated using ((select public.is_admin()));

-- Save parcels from PostEx (api/postex.js). p_rows = [{ tracking_number, ref,
-- booked_at, status, cod, fee, return_fee, checked, cpr, cpr_at, settled,
-- settled_at }]. The payment fields only count when `checked` is true (the
-- parcel's payment status was asked this time), and a paid parcel stays paid
-- with the CPR it was paid in.
create or replace function public.courier_save_payments(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r         jsonb;
  n         int := 0;
  v_checked boolean;
  v_settled boolean;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    return 0;
  end if;

  for r in select e from jsonb_array_elements(p_rows) e limit 5000 loop
    continue when coalesce(r ->> 'tracking_number', '') !~ '^[0-9A-Za-z-]{6,40}$';
    v_checked := coalesce((r ->> 'checked')::boolean, false);
    v_settled := v_checked and coalesce((r ->> 'settled')::boolean, false);

    insert into public.courier_payments as p
      (tracking_number, ref, booked_at, status, cod, fee, return_fee,
       cpr, cpr_at, settled, settled_at, checked_at, updated_at)
    values (
      r ->> 'tracking_number',
      left(nullif(btrim(r ->> 'ref'), ''), 60),
      (r ->> 'booked_at')::timestamptz,
      left(coalesce(nullif(btrim(r ->> 'status'), ''), 'Unknown'), 40),
      greatest(coalesce(round((r ->> 'cod')::numeric), 0), 0),
      greatest(coalesce(round((r ->> 'fee')::numeric, 2), 0), 0),
      greatest(coalesce(round((r ->> 'return_fee')::numeric, 2), 0), 0),
      case when v_checked then left(nullif(btrim(r ->> 'cpr'), ''), 40) end,
      case when v_checked then (r ->> 'cpr_at')::timestamptz end,
      v_settled,
      case when v_settled then (r ->> 'settled_at')::timestamptz end,
      case when v_checked then now() end,
      now())
    on conflict (tracking_number) do update set
      ref        = excluded.ref,
      booked_at  = coalesce(excluded.booked_at, p.booked_at),
      status     = excluded.status,
      cod        = excluded.cod,
      fee        = excluded.fee,
      return_fee = excluded.return_fee,
      cpr        = case when v_checked and not p.settled then excluded.cpr else p.cpr end,
      cpr_at     = case when v_checked and not p.settled then excluded.cpr_at else p.cpr_at end,
      settled    = p.settled or excluded.settled,
      settled_at = case when v_checked and not p.settled then excluded.settled_at else p.settled_at end,
      checked_at = case when v_checked then now() else p.checked_at end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- What the page shows. Amounts are PostEx's own figures: for a delivered
-- parcel the cash collected minus the delivery charge, for a returned one
-- minus the return charge.
--   paid_30d / paid_all — closed CPRs (paid), by when PostEx closed them
--   generated           — CPRs generated but not closed yet
--   holding             — delivered or returned parcels not in a CPR yet
--   cprs                — every CPR with its parcels, newest first
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
    cpr as (
      select cpr,
             min(cpr_at)                                            as generated_at,
             bool_and(settled)                                      as settled,
             max(settled_at)                                        as settled_at,
             round(sum(net), 2)                                     as amount,
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
    holding as (
      select * from parcel
       where cpr is null and (status ilike 'delivered' or status ilike 'return%')
    )
    select jsonb_build_object(
      'checked_at', (select max(checked_at) from public.courier_payments),
      'since',      (select min(settled_at) from public.courier_payments where settled),
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
                  'amount', amount, 'cod', cod, 'charges', charges, 'delivered', delivered,
                  'returns', returns, 'count', parcels_count, 'parcels', parcels)
                  order by coalesce(settled_at, generated_at) desc nulls last, cpr desc)
                  from cpr), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.courier_save_payments(jsonb), public.courier_payments_report()
  from public, anon, authenticated;
grant execute on function public.courier_save_payments(jsonb), public.courier_payments_report()
  to authenticated;
