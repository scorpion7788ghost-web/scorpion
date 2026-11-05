-- Run the complete file after owner-access.sql and worker-verification.sql.
-- Enables Buyer/Seller access for server-authorized Admins and the protected Owner.
-- Existing identities, Owner protection, product ownership and admin grants are preserved.
begin;

create or replace function lk_private.me(expected_role text default null)
returns public.lk_profiles language plpgsql stable security definer set search_path='' as $$
declare result public.lk_profiles;
begin
 select * into result from public.lk_profiles where auth_id=auth.uid();
 if not found then raise exception 'Please sign in.' using errcode='42501'; end if;
 if result.verification_status<>'approved' then
  raise exception 'Please wait, we will verify you.' using errcode='42501';
 end if;
 if expected_role is not null and result.role<>expected_role
  and not (expected_role in ('customer','seller') and public.lk_is_admin()) then
  raise exception 'Sign in through the correct account website.' using errcode='42501';
 end if;
 return result;
end $$;

create or replace function public.lk_has_store_access()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lk_profiles where auth_id=auth.uid()
  and verification_status='approved' and (role in ('customer','seller') or public.lk_is_admin()));
$$;

create or replace function public.lk_catalog_owner_is_approved(account_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lk_profiles p where p.auth_id=account_id
  and p.verification_status='approved' and (p.role='seller'
   or lk_private.is_owner_id(account_id)
   or exists(select 1 from public.lk_admins a where a.auth_id=account_id)));
$$;
revoke all on function public.lk_catalog_owner_is_approved(uuid) from public,anon,authenticated;
grant execute on function public.lk_catalog_owner_is_approved(uuid) to authenticated;
alter policy lk_member_shops on public.lk_shops
 using ((select public.lk_has_store_access()) and public.lk_catalog_owner_is_approved(owner_id));
alter policy lk_member_products on public.lk_products
 using ((select public.lk_has_store_access()) and public.lk_catalog_owner_is_approved(owner_id)
  and (status='active' or owner_id=(select auth.uid())));

-- Creates only the caller's shop; repeat calls never overwrite its name or products.
create or replace function public.lk_open_seller_shop()
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb;
begin
 account:=lk_private.me('seller');
 insert into public.lk_shops(id,owner_id,profile)
 values(account.id,account.auth_id,jsonb_build_object('id',account.id,'name',account.name||' Store',
  'tagline','','description','','email',account.email,'phone','','location','','color','#c5a6f5'))
 on conflict(owner_id) do nothing;
 select profile into result from public.lk_shops where owner_id=account.auth_id;
 return result;
end $$;
revoke all on function public.lk_open_seller_shop() from public,anon,authenticated;
grant execute on function public.lk_open_seller_shop() to authenticated;

create or replace function public.lk_access_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('isAdmin',public.lk_is_admin(),'isOwner',public.lk_is_owner(),'portalAccessVersion',1);
$$;
revoke all on function lk_private.me(text) from public,anon,authenticated;
commit;
