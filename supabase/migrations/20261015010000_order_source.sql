-- Where each order came from: a Meta ad (platform, campaign, ad set, ad) or
-- an organic route (Instagram, Google, WhatsApp, another site, direct), as
-- worked out on the storefront (src/lib/attribution.js) and saved right after
-- checkout. Shown on the admin order page.
--
-- Shoppers' browsers send it, so set_order_source() only accepts it for a
-- brand-new order (placed in the last two hours, identified by its private
-- id), only once, and only known keys as short text.

alter table public.orders
  add column source jsonb
    check (source is null or (jsonb_typeof(source) = 'object' and pg_column_size(source) <= 4096));

create or replace function public.set_order_source(p_order_id uuid, p_source jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'kind', 'platform', 'campaign', 'adset', 'ad', 'campaign_id', 'landing', 'referrer', 'touched_at',
    'first_kind', 'first_platform', 'first_campaign', 'first_at'
  ];
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  if p_order_id is null or p_source is null or jsonb_typeof(p_source) <> 'object' then
    return;
  end if;
  for k in select jsonb_object_keys(p_source) loop
    if k = any(v_allowed) and jsonb_typeof(p_source -> k) in ('string', 'number') then
      v_clean := v_clean || jsonb_build_object(k, left(btrim(p_source ->> k), 150));
    end if;
  end loop;
  if coalesce(v_clean ->> 'kind', '') not in ('ad', 'organic', 'direct') then
    return;
  end if;

  update public.orders
     set source = v_clean
   where id = p_order_id
     and source is null
     and created_at > now() - interval '2 hours';
end;
$$;

revoke execute on function public.set_order_source(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_order_source(uuid, jsonb) to anon, authenticated;
