-- Upgrade an existing installation after admin-access.sql. Safe to run again.
-- Existing accounts remain approved. All NEW sellers start pending, including
-- administrator-created sellers. No example users, stores, or products are added.
begin;
alter table public.lk_profiles drop constraint if exists lk_profiles_role_check;
alter table public.lk_profiles add constraint lk_profiles_role_check check (role in ('customer','seller','worker'));
alter table public.lk_profiles add column if not exists verification_status text not null default 'approved';
alter table public.lk_profiles add column if not exists verified_at timestamptz;
alter table public.lk_profiles add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table public.lk_profiles drop constraint if exists lk_profiles_verification_check;
alter table public.lk_profiles add constraint lk_profiles_verification_check
  check (verification_status in ('pending','approved') and (role='seller' or verification_status='approved'));
create index if not exists lk_seller_review_queue on public.lk_profiles(created_at,auth_id) where role='seller' and verification_status='pending';

-- Auth adminUserCreate applies app_metadata AFTER the initial INSERT. Deferred
-- triggers read the final row at commit, before any account becomes accessible.
-- Public signup cannot set trusted app_metadata and still cannot create Workers.
create or replace function lk_private.require_managed_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare registered_user auth.users;
begin
  select * into registered_user from auth.users where id=new.id;
  if not found then return new; end if;
  if registered_user.raw_user_meta_data->>'role' in ('customer','seller') then return new; end if;
  if registered_user.raw_user_meta_data->>'role'='worker' and registered_user.raw_app_meta_data->>'lk_managed'='true' then return new; end if;
  raise exception 'Only an administrator can create a Worker account.' using errcode='42501';
end $$;

create or replace function lk_private.register_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare registered_user auth.users; account_role text; account_username text; account_name text; contact text; account_id text;
begin
  select * into registered_user from auth.users where id=new.id;
  if not found then return new; end if;
  account_role:=registered_user.raw_user_meta_data->>'role';
  account_username:=lower(lk_private.text(registered_user.raw_user_meta_data->'username',30,true));
  account_name:=lk_private.text(registered_user.raw_user_meta_data->'name',80,true);
  contact:=lk_private.text(registered_user.raw_user_meta_data->'contact_email',120,false);
  if account_role is null or account_role not in ('customer','seller','worker') or account_username !~ '^[a-z0-9_]{3,30}$'
    or registered_user.email is distinct from account_username||'@'||account_role||'.lk-store.invalid' then
    raise exception 'Invalid account registration.';
  end if;
  if account_role='worker' and registered_user.raw_app_meta_data->>'lk_managed' is distinct from 'true' then
    raise exception 'Only an administrator can create a Worker account.' using errcode='42501';
  end if;
  if contact<>'' and contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid contact email.'; end if;
  account_id:=account_role||'_'||replace(registered_user.id::text,'-','');
  insert into public.lk_profiles(auth_id,id,role,username,name,email,verification_status)
  values(registered_user.id,account_id,account_role,account_username,account_name,contact,case when account_role='seller' then 'pending' else 'approved' end);
  if account_role='seller' then
    insert into public.lk_shops(id,owner_id,profile) values(account_id,registered_user.id,jsonb_build_object('id',account_id,'name',account_name,'tagline','','description','','email','','phone','','location','','color','#c5a6f5'));
  end if;
  return new;
end $$;

drop trigger if exists lk_managed_account on auth.users;
create constraint trigger lk_managed_account after insert on auth.users
deferrable initially deferred for each row execute function lk_private.require_managed_account();
drop trigger if exists lk_new_account on auth.users;
create constraint trigger lk_new_account after insert on auth.users
deferrable initially deferred for each row execute function lk_private.register_profile();

create or replace function lk_private.me(expected_role text default null)
returns public.lk_profiles language plpgsql stable security definer set search_path='' as $$
declare result public.lk_profiles;
begin
  select * into result from public.lk_profiles where auth_id=auth.uid();
  if not found or (expected_role is not null and result.role<>expected_role) then
    raise exception 'Sign in through the correct account website.' using errcode='42501';
  end if;
  if result.verification_status<>'approved' then
    raise exception 'Please wait, we will verify you.' using errcode='42501';
  end if;
  return result;
end $$;

create or replace function public.lk_has_store_access()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lk_profiles where auth_id=auth.uid() and role in ('customer','seller') and verification_status='approved');
$$;
create or replace function public.lk_seller_is_approved(seller_auth_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lk_profiles where auth_id=seller_auth_id and role='seller' and verification_status='approved');
$$;
create or replace function public.lk_staff_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('isAdmin',public.lk_is_admin(),'isWorker',exists(select 1 from public.lk_profiles where auth_id=auth.uid() and role='worker' and verification_status='approved'));
$$;
create or replace function public.lk_registration_status()
returns jsonb language sql stable set search_path='' as $$ select '{"version":1,"enabled":true,"workerCreationVersion":2}'::jsonb; $$;

-- A pending seller can read their own profile to check the waiting state, but
-- cannot read the catalog, drafts or carts, or execute seller mutation RPCs.
drop policy if exists lk_public_shops on public.lk_shops;
drop policy if exists lk_public_products on public.lk_products;
drop policy if exists lk_member_shops on public.lk_shops;
drop policy if exists lk_member_products on public.lk_products;
drop policy if exists lk_own_drafts on public.lk_drafts;
drop policy if exists lk_own_cart on public.lk_carts;
create policy lk_member_shops on public.lk_shops for select to authenticated
  using ((select public.lk_has_store_access()) and public.lk_seller_is_approved(owner_id));
create policy lk_member_products on public.lk_products for select to authenticated
  using ((select public.lk_has_store_access()) and public.lk_seller_is_approved(owner_id) and (status='active' or owner_id=(select auth.uid())));
create policy lk_own_drafts on public.lk_drafts for select to authenticated
  using (owner_id=(select auth.uid()) and (select public.lk_has_store_access()));
create policy lk_own_cart on public.lk_carts for select to authenticated
  using (owner_id=(select auth.uid()) and (select public.lk_has_store_access()));
revoke all on public.lk_profiles,public.lk_shops,public.lk_products,public.lk_drafts,public.lk_carts from public,anon,authenticated;
grant select on public.lk_profiles,public.lk_shops,public.lk_products,public.lk_drafts,public.lk_carts to authenticated;

-- Staff see only the pending seller queue through this function. Workers do not
-- receive broad table access or access to customer/worker account management.
create or replace function public.lk_seller_reviews(page_number integer default 1, username_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare staff jsonb; result jsonb; total bigint;
begin
  staff:=public.lk_staff_status();
  if not coalesce((staff->>'isAdmin')::boolean,false) and not coalesce((staff->>'isWorker')::boolean,false) then
    raise exception 'Worker or administrator access is required.' using errcode='42501';
  end if;
  if page_number is null or page_number<1 or page_number>100000 or username_search is null or username_search !~ '^[a-zA-Z0-9_]{0,30}$' then raise exception 'Choose a valid page or username.'; end if;
  select count(*) into total from public.lk_profiles where role='seller' and verification_status='pending' and strpos(username,lower(username_search))>0;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.auth_id),'[]'::jsonb) into result from (
    select auth_id,username,name,email,created_at from public.lk_profiles
    where role='seller' and verification_status='pending' and strpos(username,lower(username_search))>0
    order by created_at,auth_id limit 25 offset (page_number-1)*25
  ) p;
  return jsonb_build_object('users',result,'total',total,'page',page_number,'pageSize',25);
end $$;

create or replace function public.lk_approve_seller(target_auth_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff jsonb; approved public.lk_profiles;
begin
  staff:=public.lk_staff_status();
  if not coalesce((staff->>'isAdmin')::boolean,false) and not coalesce((staff->>'isWorker')::boolean,false) then
    raise exception 'Worker or administrator access is required.' using errcode='42501';
  end if;
  update public.lk_profiles set verification_status='approved',verified_at=now(),verified_by=auth.uid(),updated_at=now()
    where auth_id=target_auth_id and role='seller' and verification_status='pending' returning * into approved;
  if not found then raise exception 'This seller is no longer awaiting verification. Refresh the list.'; end if;
  return jsonb_build_object('ok',true,'username',approved.username);
end $$;

revoke all on function public.lk_has_store_access(),public.lk_seller_is_approved(uuid),public.lk_staff_status(),public.lk_seller_reviews(integer,text),public.lk_approve_seller(uuid),public.lk_registration_status() from public,anon,authenticated;
grant execute on function public.lk_has_store_access(),public.lk_seller_is_approved(uuid),public.lk_staff_status(),public.lk_seller_reviews(integer,text),public.lk_approve_seller(uuid) to authenticated;
grant execute on function public.lk_registration_status() to anon,authenticated;
commit;
