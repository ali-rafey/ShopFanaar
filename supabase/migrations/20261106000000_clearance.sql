-- Clearance: a collection the admin fills from Products → Clearance (or the
-- Collections list in the product editor). A piece on clearance keeps its
-- full price as compare_at_price, so the store shows it struck through.
-- The store's menu shows a Clearance link only while at least one active
-- piece is in this collection.

insert into public.collections (handle, title, nav_group, position)
values ('clearance', 'Clearance', 'clearance', 8)
on conflict (handle) do nothing;
