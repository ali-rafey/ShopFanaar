-- Fanaar Accounts — the partners' private books, in their own Supabase
-- project, separate from the store's. Opened from the store admin
-- (Settings → Fanaar Accounts) with its own sign-in.
--
-- Only members can read or write anything. Sign-ups are switched off in the
-- project: the owner creates each login in the Supabase dashboard and adds
-- it to public.members.
--
--   investments     money Ali, Ahmad and Sarmad put in
--   expenses        business (fabric, production or stitching, Meta ads) or
--                   other (wasted, anything else)
--   rejected_stock  pieces that came out faulty — their cost is lost
--   abl_entries     the Fanaar Account (ABL): money in, money out, and
--                   corrections to match the bank
--   cash_in_hand    one figure
--
-- Listed stock (pieces in stock × cost per piece) comes from the store's own
-- database (inventory_value()), so it isn't kept here.

create table public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);

create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.investments (
  id         uuid primary key default gen_random_uuid(),
  partner    text not null check (partner in ('Ali', 'Ahmad', 'Sarmad')),
  amount     bigint not null check (amount > 0 and amount < 1000000000),
  note       text check (char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  -- business: fabric, production (or stitching), meta_ads
  -- other:    wasted (parties etc.), other
  category   text not null check (category in ('fabric', 'production', 'meta_ads', 'wasted', 'other')),
  amount     bigint not null check (amount > 0 and amount < 1000000000),
  note       text check (char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rejected_stock (
  id         uuid primary key default gen_random_uuid(),
  article    text not null check (char_length(btrim(article)) between 1 and 200),
  fault      text check (char_length(fault) <= 200),
  pieces     int not null check (pieces between 1 and 100000),
  cost       bigint not null check (cost >= 0 and cost < 1000000000), -- total, for all the pieces
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.abl_entries (
  id         uuid primary key default gen_random_uuid(),
  -- in: money into the account (positive); out: money out (negative);
  -- correction: the difference that brings the balance in line with the bank.
  kind       text not null check (kind in ('in', 'out', 'correction')),
  amount     bigint not null check (amount <> 0 and abs(amount) < 1000000000),
  note       text check (char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'in' and amount > 0) or (kind = 'out' and amount < 0) or kind = 'correction')
);

create table public.cash_in_hand (
  id         int primary key default 1 check (id = 1),
  amount     bigint not null default 0 check (amount >= 0 and amount < 1000000000),
  updated_at timestamptz not null default now()
);
insert into public.cash_in_hand (id) values (1);

create trigger investments_touch before update on public.investments
  for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();
create trigger rejected_stock_touch before update on public.rejected_stock
  for each row execute function public.touch_updated_at();
create trigger abl_entries_touch before update on public.abl_entries
  for each row execute function public.touch_updated_at();
create trigger cash_in_hand_touch before update on public.cash_in_hand
  for each row execute function public.touch_updated_at();

-- Row-level security: members only, for everything ------------------------

alter table public.members        enable row level security;
alter table public.investments    enable row level security;
alter table public.expenses       enable row level security;
alter table public.rejected_stock enable row level security;
alter table public.abl_entries    enable row level security;
alter table public.cash_in_hand   enable row level security;

revoke all on public.members, public.investments, public.expenses, public.rejected_stock,
              public.abl_entries, public.cash_in_hand
  from anon;

-- Who the members are is managed in the dashboard / SQL, never from the app.
create policy "members see members" on public.members
  for select to authenticated using (public.is_member());

create policy "members keep investments" on public.investments
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members keep expenses" on public.expenses
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members keep rejected stock" on public.rejected_stock
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members keep the ABL account" on public.abl_entries
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members see cash in hand" on public.cash_in_hand
  for select to authenticated using (public.is_member());
create policy "members update cash in hand" on public.cash_in_hand
  for update to authenticated using (public.is_member()) with check (public.is_member());

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- Keeps this free project awake: Supabase pauses a free project after a week
-- without activity, and the books may go unopened for longer. A daily Vercel
-- cron (api/keepalive.js) calls this; it reads nothing.
create function public.ping()
returns int
language sql
stable
as $$
  select 1;
$$;

grant execute on function public.ping() to anon;
