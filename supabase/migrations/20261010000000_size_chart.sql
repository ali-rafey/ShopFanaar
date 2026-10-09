-- Per-product size chart, edited in the admin and shown in the product page's
-- "Size & fit" panel. null = no size guide for that product. Shape:
--   { "note":    "Fits true to size…",
--     "columns": ["Chest (in)", "Length (in)"],
--     "rows":    [{ "size": "S", "values": ["38–40", "27"] }, …] }

alter table public.products
  add column size_chart jsonb
    check (size_chart is null
           or (jsonb_typeof(size_chart) = 'object' and pg_column_size(size_chart) <= 16384));

-- Existing products keep the chart the product page has shown for every piece
-- so far; from here on each one can be edited on its own.
update public.products
   set size_chart = '{
     "note": "Fits true to size with a relaxed drape. If you prefer a closer fit, size down.",
     "columns": ["Chest (in)", "Length (in)"],
     "rows": [
       { "size": "S", "values": ["38–40", "27"] },
       { "size": "M", "values": ["40–42", "28"] },
       { "size": "L", "values": ["42–44", "29"] }
     ]
   }'::jsonb
 where size_chart is null;
