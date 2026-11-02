-- Two product-page chapters the admin fills in from the product editor:
--
--   manufacturing  { "text": "How it's made…", "rows": [{ "label": "Fabric", "value": "Waffle thermal" }, …] }
--                  shown as "Manufacturing": a paragraph and a table (fabric,
--                  composition, stitching, made in…).
--   inspiration    styling photos (product-images storage URLs), shown as
--                  "Inspiration".
--
-- Public like the rest of the product (the storefront reads them); only
-- admins write, through the existing products policies.

alter table public.products
  add column manufacturing jsonb
    check (manufacturing is null
           or (jsonb_typeof(manufacturing) = 'object' and pg_column_size(manufacturing) <= 16384)),
  add column inspiration text[] not null default '{}'
    check (cardinality(inspiration) <= 24);
