-- The average PostEx cost per parcel used for earnings (admin_stats), as
-- set by the owner: Rs 380, delivered or returned (was Rs 300).
create or replace function public.courier_fee_estimate()
returns int
language sql
immutable
as $$
  select 380;
$$;
