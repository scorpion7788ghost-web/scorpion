-- Repair Worker creation after worker-verification.sql. Safe to run again.
-- Updates account-creation triggers only; preserves existing accounts and approvals.
begin;
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

create or replace function public.lk_registration_status()
returns jsonb language sql stable set search_path='' as $$ select '{"version":1,"enabled":true,"workerCreationVersion":2}'::jsonb; $$;
revoke all on function public.lk_registration_status() from public;
grant execute on function public.lk_registration_status() to anon,authenticated;
commit;
