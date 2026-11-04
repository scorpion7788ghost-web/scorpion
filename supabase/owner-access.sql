-- Run after community-tools.sql. Pins the existing scorpion customer account.
-- No accounts are created, and no existing account is automatically demoted.
begin;
create table if not exists lk_private.owner_account (
 singleton boolean primary key default true check(singleton),
 auth_id uuid not null unique
);
revoke all on lk_private.owner_account from public,anon,authenticated,service_role;
do $$ declare owner_id uuid; begin
 if not exists(select 1 from lk_private.owner_account) then
  select auth_id into owner_id from public.lk_profiles where role='customer' and username='scorpion';
  if owner_id is null then raise exception 'The existing scorpion customer account is required.'; end if;
  insert into lk_private.owner_account(auth_id) values(owner_id);
 end if;
end $$;

create or replace function lk_private.is_owner_id(account_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lk_private.owner_account where auth_id=account_id);
$$;
create or replace function public.lk_is_owner()
returns boolean language sql stable security definer set search_path='' as $$
 select lk_private.is_owner_id(auth.uid());
$$;
create or replace function public.lk_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select public.lk_is_owner() or exists(select 1 from public.lk_admins where auth_id=auth.uid());
$$;
create or replace function public.lk_access_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('isAdmin',public.lk_is_admin(),'isOwner',public.lk_is_owner());
$$;

-- The Owner remains in the Admin directory and compatible with the existing
-- account service's protected-Admin deletion check.
insert into public.lk_admins(auth_id) select o.auth_id from lk_private.owner_account o where not exists(select 1 from public.lk_admins a where a.auth_id=o.auth_id);

create or replace function lk_private.protect_owner_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lk_private.is_owner_id(old.auth_id) then raise exception 'The Owner account is protected and cannot be edited or deleted.' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists lk_protect_owner_profile on public.lk_profiles;
create trigger lk_protect_owner_profile before update or delete on public.lk_profiles for each row execute function lk_private.protect_owner_profile();

create or replace function lk_private.protect_owner_auth()
returns trigger language plpgsql security definer set search_path='' as $$
declare field text;
begin
 if lk_private.is_owner_id(old.id) then
  if tg_op='DELETE' then raise exception 'The Owner account cannot be deleted.' using errcode='42501'; end if;
  -- Permit operational Auth updates (sign-in time, token/session refresh).
  -- Protect credentials, identity, metadata, and suspension/deletion settings.
  foreach field in array array['id','email','phone','encrypted_password','raw_user_meta_data','raw_app_meta_data','deleted_at','banned_until','is_anonymous','aud','role'] loop
   if to_jsonb(new)->field is distinct from to_jsonb(old)->field then raise exception 'The Owner account is locked.' using errcode='42501'; end if;
  end loop;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists lk_protect_owner_auth on auth.users;
create trigger lk_protect_owner_auth before update or delete on auth.users for each row execute function lk_private.protect_owner_auth();

create or replace function lk_private.protect_admin_membership()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then
  if lk_private.is_owner_id(old.auth_id) then raise exception 'Owner permissions cannot be changed.' using errcode='42501'; end if;
 end if;
 -- Direct service requests are not a substitute for an authenticated Owner.
 if not public.lk_is_owner() then raise exception 'Only the Owner can change Admin permissions.' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists lk_protect_admin_membership on public.lk_admins;
create trigger lk_protect_admin_membership before insert or update or delete on public.lk_admins for each row execute function lk_private.protect_admin_membership();

-- Directory and account editing functions follow below.
create or replace function public.lk_directory(page_number integer default 1, role_filter text default 'all', username_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin_access boolean; staff jsonb; result jsonb; total bigint;
begin
 admin_access:=public.lk_is_admin(); staff:=public.lk_staff_status();
 if not admin_access and not coalesce((staff->>'isWorker')::boolean,false) then raise exception 'Worker or Admin access is required.' using errcode='42501'; end if;
 if page_number is null or page_number<1 or page_number>100000 or role_filter is null or role_filter not in ('all','admin','customer','seller','worker') or username_search is null or username_search !~ '^[a-zA-Z0-9_]{0,30}$' then raise exception 'Choose a valid directory filter.'; end if;
 if not admin_access and role_filter in ('admin','customer') then raise exception 'Admin access is required.' using errcode='42501'; end if;
 select count(*) into total from public.lk_profiles p where (admin_access or p.role in ('seller','worker'))
 and (role_filter='all' or p.role=role_filter or (role_filter='admin' and exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)))
 and strpos(p.username,lower(username_search))>0;
 select coalesce(jsonb_agg(entry order by created_at desc,auth_id),'[]'::jsonb) into result from (
  select p.created_at,p.auth_id,jsonb_build_object('auth_id',p.auth_id,'id',p.id,'role',p.role,'username',p.username,'name',p.name,'verification_status',p.verification_status,'created_at',p.created_at)
   || case when admin_access then jsonb_build_object('email',p.email,'isAdmin',exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id),'isOwner',lk_private.is_owner_id(p.auth_id)) else '{}'::jsonb end as entry
  from public.lk_profiles p where (admin_access or p.role in ('seller','worker'))
  and (role_filter='all' or p.role=role_filter or (role_filter='admin' and exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)))
  and strpos(p.username,lower(username_search))>0 order by p.created_at desc,p.auth_id limit 25 offset (page_number-1)*25
 ) entries;
 return jsonb_build_object('users',result,'total',total,'page',page_number,'pageSize',25);
end $$;

create or replace function public.lk_admin_update_account(target_auth_id uuid, display_name text, contact_email text, admin_access boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.lk_profiles; old_admin boolean; updated public.lk_profiles;
begin
 -- Serialize permission changes and recheck the caller after acquiring the lock.
 perform pg_advisory_xact_lock(730411);
 if not public.lk_is_admin() then raise exception 'Admin access is required.' using errcode='42501'; end if;
 if lk_private.is_owner_id(target_auth_id) then raise exception 'The Owner account is protected and cannot be edited.' using errcode='42501'; end if;
 if target_auth_id=auth.uid() then raise exception 'Use My Account to edit yourself. Only the Owner can change Admin access.' using errcode='42501'; end if;
 if admin_access is null or display_name is null or char_length(trim(display_name)) not between 1 and 80 or contact_email is null or char_length(trim(contact_email))>120 or (trim(contact_email)<>'' and trim(contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter valid account details.'; end if;
 select * into target from public.lk_profiles where auth_id=target_auth_id for update;
 if not found then raise exception 'This account no longer exists.'; end if;
 if admin_access and target.verification_status<>'approved' then raise exception 'Approve this seller before granting Admin access.'; end if;
 old_admin:=exists(select 1 from public.lk_admins where auth_id=target_auth_id);
 if not public.lk_is_owner() and (old_admin or admin_access is distinct from old_admin) then raise exception 'Only the Owner can manage Admin accounts or change Admin permissions.' using errcode='42501'; end if;
 update public.lk_profiles set name=trim(display_name),email=trim(contact_email),updated_at=now() where auth_id=target_auth_id returning * into updated;
 if admin_access then insert into public.lk_admins(auth_id) values(target_auth_id) on conflict do nothing;
 else delete from public.lk_admins where auth_id=target_auth_id; end if;
 insert into public.lk_account_audit(actor_id,target_id,before_state,after_state) values(auth.uid(),target_auth_id,
  jsonb_build_object('name',target.name,'email',target.email,'isAdmin',old_admin),jsonb_build_object('name',updated.name,'email',updated.email,'isAdmin',admin_access));
 return jsonb_build_object('ok',true,'username',updated.username);
end $$;


create or replace function public.lk_owner_status() returns jsonb language sql stable set search_path='' as $$ select '{"version":1}'::jsonb; $$;
revoke all on function lk_private.is_owner_id(uuid),lk_private.protect_owner_profile(),lk_private.protect_owner_auth(),lk_private.protect_admin_membership() from public,anon,authenticated,service_role;
revoke all on function public.lk_is_owner(),public.lk_access_status(),public.lk_owner_status() from public,anon,authenticated;
grant execute on function public.lk_is_owner(),public.lk_access_status() to authenticated;
grant execute on function public.lk_owner_status() to anon,authenticated;
commit;
