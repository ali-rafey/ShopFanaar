# Fanaar — setup & operations

The custom Fanaar store at [shopfanaar.com](https://www.shopfanaar.com). It has
no Shopify dependency at runtime:

- **Storefront** (React + Vite, hosted on Vercel): catalog, cart, cash-on-delivery
  checkout, order confirmation/tracking page.
- **Admin** at `/admin`: products (create / edit / delete, photos, sizes &
  stock, sale prices), orders (confirm → pack → ship → deliver, cancel/return
  with automatic restock, courier + tracking, WhatsApp confirm, packing slip),
  live new-order feed, inbox (contact-form messages + newsletter subscribers,
  CSV export), checkout settings.
- **Customer pages**: Contact (with a message form), Shipping, Returns and
  Privacy, at the same URLs the Shopify store used (`/pages/contact`,
  `/policies/shipping-policy`, `/policies/refund-policy`,
  `/policies/privacy-policy`) so old links keep working.
- **Database** (Supabase / Postgres): products, stock, orders. All rules that
  matter — prices, stock, who can see what — are enforced in the database, not
  the browser. See [`supabase/migrations/20261005000000_init.sql`](../supabase/migrations/20261005000000_init.sql).

## How an order flows

1. The shopper checks out at `/checkout` → the browser calls the
   `place_order` database function.
2. `place_order` re-prices every line from the database, locks and checks
   stock, decrements it, and creates the order in one transaction — two
   shoppers can never buy the last unit, and a tampered cart can't change a
   price.
3. The shopper lands on `/order/<id>` (bookmarkable status page). Meta Pixel
   fires `Purchase`.
4. The order appears instantly in `/admin` (live feed + tab badge). The admin
   confirms (WhatsApp button pre-fills a confirmation message), packs, adds the
   courier + tracking number, ships, and marks delivered / paid. Every step is
   logged on the order's timeline.
5. Cancelling or returning puts the units back in stock automatically (once).

## Local development

```bash
npm install
npm run dev      # http://localhost:5173  (admin: /admin)
npm run build    # production build → dist/
```

Without Supabase keys the dev server runs in **demo mode**: a database in your
browser's localStorage, seeded from `src/data/store.js`, so checkout and the
admin can be tried end-to-end (any email signs in). Demo mode is never included
in production builds — a production build without keys shows the bundled
catalog and a "checkout not available" notice.

## Supabase

Project `iswmwlkytwyupfznxfpq`. The migrations in `supabase/migrations/` and
the seed are **applied** (5 Oct 2026). Future schema changes: add a new
timestamped file to `supabase/migrations/` and run
`supabase db push --db-url "<connection string>"` — the CLI tracks which
migrations have already run.

Setting up a fresh project from scratch:

1. **Create the database.** SQL Editor → run each file in
   [`supabase/migrations/`](../supabase/migrations) in order, then
   [`supabase/seed.sql`](../supabase/seed.sql) (the starting catalog).
2. **Create the admin login.** Authentication → Users → *Add user* (email +
   password, tick *Auto confirm*). Then in the SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   Recommended: Authentication → Sign In / Providers → turn **off** "Allow new
   users to sign up" (non-admin accounts can't do anything anyway, but there's
   no reason to allow them).
3. **Add the keys.** Project Settings → API: copy the Project URL and the
   anon / publishable key into `.env.local` (local) and into Vercel → Project →
   Settings → Environment Variables (production):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
   Redeploy. Never put the `service_role` / secret key in a `VITE_` variable.

## Editing content

- **Products, prices, stock, photos, collections membership** → `/admin`.
  Uploaded photos are resized and converted to WebP in the browser, then stored
  in the Supabase `product-images` bucket.
- **Shipping fee, free-shipping threshold, pausing orders** → `/admin/settings`
  (the Shipping policy page shows these live).
- **Contact details** (WhatsApp, phone, email, hours) → `shop.contact` in
  `src/data/store.js`; empty values are hidden on the Contact page.
- **Policy wording** → `src/pages/Policies.jsx`.
- **Editorial content** (hero, category tiles, lookbook, About copy) → still in
  `src/data/store.js`.
- `node scripts/generate-seed.mjs` regenerates `supabase/seed.sql` from
  `store.js` (only needed for a fresh database).

## Deploy (Vercel)

`vercel.json` rewrites every path to the SPA, sets long-term caching for hashed
assets, adds basic security headers, and marks `/admin` as `noindex`. Vercel
auto-detects Vite (`npm run build`, output `dist`).

## Notes

- **Images:** the original catalog images are self-hosted in `public/images`
  (Shopify's CDN blocks hotlinking from other domains).
  `scripts/fetch-images.mjs` was the one-off Shopify download script; it's not
  used by the build.
- **Fonts:** Bodoni Moda + Inter, self-hosted in `public/fonts`.
- **Meta Pixel:** `src/lib/pixel.js` — PageView, ViewContent, AddToCart,
  InitiateCheckout, Purchase. Not loaded on admin pages.

## Order notifications (phone)

Every new order sends a push notification ("Fanaar has a new order for 2
items totaling Rs.5,050 from Online Store.") to each admin device that turned
them on. Tapping it opens the order.

How it works: a deferred trigger on `orders` (`private.notify_new_order`)
calls `/api/notify-order` through `pg_net` once the order is committed; that
Vercel function signs and sends the Web Push. Failures never block an order.

- **Vercel env (type "Secret"):** `VAPID_PRIVATE_KEY`, `NOTIFY_SECRET`.
  The matching public key is in `src/lib/vapid.js`; the same `NOTIFY_SECRET`
  is stored in the database in `private.notify_config` (with the function URL).
- **iPhone:** Safari → Share → Add to Home Screen, open Fanaar from the Home
  Screen, sign in, Settings → *Turn on notifications on this device*.
- **Android / desktop:** open `/admin` in Chrome → Settings → turn on.
- *Send test notification* in Settings checks the whole chain and explains
  any setup problem.
- Sound: `public/sounds/new-order.mp3` plays in an open admin window
  (`src/admin/sound.js`). iPhone web-app notifications always use the phone's
  Default Alert sound, so the same file is installed on the owner's iPhone as
  a tone (`.m4r`, made with `afconvert in.mp3 out.m4r -f m4af -d aac`) and
  chosen under Settings → Sounds & Haptics → Default Alerts. Android lets you
  pick a sound per app.
