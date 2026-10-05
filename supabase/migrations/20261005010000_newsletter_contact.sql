-- ============================================================================
-- Newsletter sign-ups + contact-form messages.
-- Shoppers can only write through subscribe() / send_contact_message();
-- only admins can read them.
-- ============================================================================

create table public.subscribers (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  created_at timestamptz not null default now()
);

create table public.contact_messages (
  id           bigint generated always as identity primary key,
  name         text not null,
  email        text,
  phone        text,
  order_number int,
  message      text not null,
  status       text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at   timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);

-- Returns 'subscribed' or 'already'.
create or replace function public.subscribe(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) > 200
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  -- Crude flood guard for scripted sign-ups.
  if (select count(*) from public.subscribers
       where created_at > now() - interval '10 minutes') >= 50 then
    raise exception 'Please try again in a few minutes.';
  end if;

  insert into public.subscribers (email) values (v_email)
  on conflict (email) do nothing;
  return case when found then 'subscribed' else 'already' end;
end;
$$;

-- payload = { name, email?, phone?, order_number?, message }
create or replace function public.send_contact_message(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := nullif(btrim(payload ->> 'name'), '');
  v_email   text := nullif(lower(btrim(payload ->> 'email')), '');
  v_phone   text := nullif(regexp_replace(coalesce(payload ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
  v_order   text := nullif(regexp_replace(coalesce(payload ->> 'order_number', ''), '[^0-9]', '', 'g'), '');
  v_message text := nullif(btrim(payload ->> 'message'), '');
begin
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Please enter your name.';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Please leave an email or phone number so we can reply.';
  end if;
  if v_email is not null
     and (char_length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Please enter a valid email address.';
  end if;
  if v_phone is not null and char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 10 and 13 then
    raise exception 'Please enter a valid phone number.';
  end if;
  if v_message is null or char_length(v_message) not between 5 and 2000 then
    raise exception 'Please write a message (up to 2000 characters).';
  end if;
  if char_length(v_order) > 9 then
    raise exception 'Please check the order number.';
  end if;

  if (select count(*) from public.contact_messages
       where created_at > now() - interval '1 hour'
         and (email = v_email or phone = v_phone)) >= 3
     or (select count(*) from public.contact_messages
          where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'We''ve received your messages — we''ll reply soon.';
  end if;

  insert into public.contact_messages (name, email, phone, order_number, message)
  values (v_name, v_email, v_phone, v_order::int, v_message);
end;
$$;

-- Dashboard numbers now include unread messages.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz :=
    date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'by_status', coalesce((
      select jsonb_object_agg(status, n)
        from (select status, count(*) as n from public.orders group by status) s
    ), '{}'::jsonb),
    'orders_today', (select count(*) from public.orders where created_at >= v_today),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
       where created_at >= v_today and status not in ('cancelled', 'returned')),
    'orders_30d', (
      select count(*) from public.orders
       where created_at > now() - interval '30 days'
         and status not in ('cancelled', 'returned')),
    'revenue_30d', (
      select coalesce(sum(total), 0) from public.orders
       where created_at > now() - interval '30 days'
         and status not in ('cancelled', 'returned')),
    'low_stock', coalesce((
      select jsonb_agg(x)
        from (select p.id, p.title, p.handle, pv.size, pv.stock
                from public.product_variants pv
                join public.products p on p.id = pv.product_id
               where p.status = 'active' and pv.stock <= 3
               order by pv.stock, p.title, pv.position
               limit 20) x
    ), '[]'::jsonb),
    'unread_messages', (select count(*) from public.contact_messages where status = 'new'),
    'subscribers', (select count(*) from public.subscribers)
  );
end;
$$;

-- ---------- Access ----------------------------------------------------------

alter table public.subscribers      enable row level security;
alter table public.contact_messages enable row level security;

revoke all on public.subscribers, public.contact_messages from anon, authenticated;
grant select, delete on public.subscribers to authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;

create policy "admins read subscribers" on public.subscribers
  for select to authenticated using ((select public.is_admin()));
create policy "admins delete subscribers" on public.subscribers
  for delete to authenticated using ((select public.is_admin()));

create policy "admins read messages" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));
create policy "admins update messages" on public.contact_messages
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete messages" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));

revoke execute on function public.subscribe(text),
                           public.send_contact_message(jsonb)
  from public, anon, authenticated;
grant execute on function public.subscribe(text),
                          public.send_contact_message(jsonb)
  to anon, authenticated;
