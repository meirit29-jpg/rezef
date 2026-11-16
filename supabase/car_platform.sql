-- =====================================================================
-- פלטפורמת בדיקת רכב – סכימה ל-Supabase
-- להרצה פעם אחת ב-SQL Editor. לא נוגע בטבלה rezef_state של אפליקציית הכושר.
-- אחרי ההרצה: להפוך את עצמך למנהל:
--   update car_profiles set role = 'admin' where user_id = (select id from auth.users where email = 'YOUR@EMAIL');
-- =====================================================================

-- פרופיל + חבילה (נכתב רק ע"י השרת/מנהל – למשתמש אין הרשאת עדכון)
create table if not exists public.car_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free','single','pro')),
  role       text not null default 'user' check (role in ('user','admin')),
  credits    int  not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.is_car_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from car_profiles where user_id = auth.uid() and role = 'admin');
$$;

-- יצירת פרופיל אוטומטית למשתמש חדש
create or replace function public.car_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into car_profiles(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists car_on_auth_user on auth.users;
create trigger car_on_auth_user after insert on auth.users
  for each row execute function public.car_new_user();
-- משתמשים קיימים
insert into car_profiles(user_id) select id from auth.users on conflict do nothing;

-- אירועי שימוש (בלי מספר רכב – מזעור מידע)
create table if not exists public.car_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('check','pdf','compare','save')),
  created_at timestamptz not null default now()
);
create index if not exists car_events_created on public.car_events(created_at);

-- בדיקות שמורות
create table if not exists public.car_saved_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plate      text not null,
  label      text,
  report     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists car_saved_user on public.car_saved_reports(user_id, created_at desc);

-- מועדפים
create table if not exists public.car_favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plate      text not null,
  label      text,
  created_at timestamptz not null default now(),
  primary key (user_id, plate)
);

-- תשלומים – נכתבים רק מצד השרת (webhook של ספק הסליקה עם service_role)
create table if not exists public.car_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  provider      text not null,
  provider_ref  text unique,
  plan          text not null,
  amount_agorot int  not null check (amount_agorot >= 0),
  currency      text not null default 'ILS',
  status        text not null check (status in ('pending','paid','refunded','failed')),
  created_at    timestamptz not null default now()
);

-- ---------------- RLS ----------------
alter table car_profiles      enable row level security;
alter table car_events        enable row level security;
alter table car_saved_reports enable row level security;
alter table car_favorites     enable row level security;
alter table car_payments      enable row level security;

drop policy if exists p_read on car_profiles;
create policy p_read on car_profiles for select using (user_id = auth.uid() or is_car_admin());

drop policy if exists e_ins on car_events;
create policy e_ins on car_events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists e_read on car_events;
create policy e_read on car_events for select using (is_car_admin());

drop policy if exists s_own on car_saved_reports;
create policy s_own on car_saved_reports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists f_own on car_favorites;
create policy f_own on car_favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pay_read on car_payments;
create policy pay_read on car_payments for select using (user_id = auth.uid() or is_car_admin());

grant insert on car_events to anon;

-- ---------------- נתוני ניהול ----------------
create or replace function public.car_admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare res json;
begin
  if not is_car_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select json_build_object(
    'checks_total',   (select count(*) from car_events where kind = 'check'),
    'checks_30d',     (select count(*) from car_events where kind = 'check' and created_at > now() - interval '30 days'),
    'checks_today',   (select count(*) from car_events where kind = 'check' and created_at::date = now()::date),
    'pdf_total',      (select count(*) from car_events where kind = 'pdf'),
    'compare_total',  (select count(*) from car_events where kind = 'compare'),
    'saved_total',    (select count(*) from car_saved_reports),
    'users_total',    (select count(*) from car_profiles),
    'users_paid',     (select count(*) from car_profiles where plan <> 'free' or credits > 0),
    'revenue_agorot', (select coalesce(sum(amount_agorot),0) from car_payments where status = 'paid'),
    'revenue_30d_agorot', (select coalesce(sum(amount_agorot),0) from car_payments where status = 'paid' and created_at > now() - interval '30 days'),
    'payments_paid',  (select count(*) from car_payments where status = 'paid'),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select created_at::date as day,
               count(*) filter (where kind = 'check') as checks,
               count(*) filter (where kind = 'pdf')   as pdfs
        from car_events where created_at > now() - interval '30 days'
        group by 1) d),
    'recent_payments', (select coalesce(json_agg(p), '[]'::json) from (
        select created_at, plan, amount_agorot, status, provider from car_payments
        order by created_at desc limit 20) p)
  ) into res;
  return res;
end $$;
grant execute on function public.car_admin_stats() to authenticated;
