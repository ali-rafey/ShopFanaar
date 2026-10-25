-- What each product costs to make (fabric, stitching, production) per piece.
--
-- Kept in its own table, readable by admins only — public.products is read
-- by the storefront, and shoppers must never see costs. Used by the product
-- editor (profit per piece) and by Fanaar Accounts, which values the listed
-- stock as pieces in stock × cost per piece (inventory_value()).

create table public.product_costs (
  product_id text primary key references public.products (id) on delete cascade,
  cost       int not null check (cost between 0 and 1000000),
  updated_at timestamptz not null default now()
);

create trigger product_costs_touch before update on public.product_costs
  for each row execute function public.touch_updated_at();

alter table public.product_costs enable row level security;

create policy "admins manage product costs" on public.product_costs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.product_costs from anon;

-- Every product with its pieces in stock, cost per piece and stock value.
-- Products without a cost are listed (value unknown) so the admin can see
-- what's missing rather than getting a silently low total.
create function public.inventory_value()
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
      select pr.id, pr.title, pr.status, pr.images[1] as image, pr.price, c.cost,
             coalesce((select sum(v.stock) from public.product_variants v where v.product_id = pr.id), 0)::int as pieces
        from public.products pr
        left join public.product_costs c on c.product_id = pr.id
    )
    select jsonb_build_object(
      'products', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'title', title, 'status', status, 'image', image, 'price', price,
                 'cost', cost, 'pieces', pieces, 'value', pieces * cost)
               order by (cost is null and pieces > 0) desc, pieces * coalesce(cost, 0) desc, pieces desc, title)
          from p), '[]'::jsonb),
      'total_value', (select coalesce(sum(pieces::bigint * cost), 0) from p where cost is not null),
      'total_pieces', (select coalesce(sum(pieces), 0) from p),
      'missing_cost', (select count(*) from p where cost is null and pieces > 0)
    )
  );
end;
$$;

revoke execute on function public.inventory_value() from public, anon, authenticated;
grant execute on function public.inventory_value() to authenticated;
