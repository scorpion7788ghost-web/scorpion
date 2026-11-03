-- Upgrade the existing store. Run the entire file once in Supabase SQL Editor.
-- Existing accounts and products are preserved. No sample records are added.
begin;
do $$ begin
  if not exists(select 1 from public.lk_profiles where role='customer' and username='scorpion') then
    raise exception 'The customer account scorpion must exist before enabling administrator access.';
  end if;
end $$;

create table if not exists public.lk_admins (
  auth_id uuid primary key references public.lk_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lk_admins enable row level security;
revoke all on public.lk_admins from public,anon,authenticated;
grant select on public.lk_admins,public.lk_profiles to service_role;
insert into public.lk_admins(auth_id)
select auth_id from public.lk_profiles where role='customer' and username='scorpion'
on conflict do nothing;

create or replace function public.lk_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lk_admins where auth_id=(select auth.uid()));
$$;
revoke all on function public.lk_is_admin() from public,anon;
grant execute on function public.lk_is_admin() to authenticated;

-- An Auth admin API call sets app_metadata; browser signup cannot set it.
create or replace function lk_private.require_managed_account()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'lk_managed' is distinct from 'true' then
    raise exception 'Accounts are created by the store administrator.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists lk_managed_account on auth.users;
create trigger lk_managed_account before insert on auth.users
for each row execute function lk_private.require_managed_account();

-- Sign-in is enforced in the database, including direct API calls.
revoke all on public.lk_shops,public.lk_products from public,anon;
drop policy if exists lk_public_shops on public.lk_shops;
drop policy if exists lk_public_products on public.lk_products;
drop policy if exists lk_member_shops on public.lk_shops;
drop policy if exists lk_member_products on public.lk_products;
create policy lk_member_shops on public.lk_shops for select to authenticated
using (exists(select 1 from public.lk_profiles where auth_id=(select auth.uid())));
create policy lk_member_products on public.lk_products for select to authenticated
using (exists(select 1 from public.lk_profiles where auth_id=(select auth.uid()))
  and (status='active' or owner_id=(select auth.uid())));
commit;
