-- Additive upgrade after admin-console.sql. No product prices or records are changed.
begin;
create table if not exists public.lk_wishlist (
 owner_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
 product_id text not null references public.lk_products(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(owner_id,product_id)
);
alter table public.lk_wishlist enable row level security;
revoke all on public.lk_wishlist from public,anon,authenticated;

create or replace function public.lk_buyer_wishlist(operation text default 'list', item_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles;
begin
 account:=lk_private.me('customer');
 if operation is null or operation not in ('list','add','remove') then raise exception 'Choose a valid wishlist action.'; end if;
 if operation<>'list' and (item_id is null or length(item_id) not between 1 and 100) then raise exception 'Choose a valid product.'; end if;
 if operation='add' then
  perform pg_advisory_xact_lock(hashtextextended(account.auth_id::text,0));
  if not exists(select 1 from public.lk_products p where p.id=item_id and p.status='active' and p.moderation='approved' and public.lk_catalog_owner_is_approved(p.owner_id)) then raise exception 'This product is no longer available.'; end if;
  if (select count(*) from public.lk_wishlist where owner_id=account.auth_id)>=500 and not exists(select 1 from public.lk_wishlist where owner_id=account.auth_id and product_id=item_id) then raise exception 'Your wishlist is full. Remove an item first.'; end if;
  insert into public.lk_wishlist(owner_id,product_id) values(account.auth_id,item_id) on conflict do nothing;
 elsif operation='remove' then delete from public.lk_wishlist where owner_id=account.auth_id and product_id=item_id;
 end if;
 return (select coalesce(jsonb_agg(product_id order by created_at desc,product_id),'[]'::jsonb) from public.lk_wishlist where owner_id=account.auth_id);
end $$;

create or replace function public.lk_my_orders(page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb;
begin
 account:=lk_private.me('customer');
 if page_number is null or page_number<1 or page_number>100000 then raise exception 'Choose a valid page.'; end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id),'[]'::jsonb) into result from (
  select id,items,total_cents,currency,status,payment_status,tracking,seller_name,created_at
  from public.lk_orders where customer_id=account.auth_id order by created_at desc,id limit 20 offset (page_number-1)*20
 ) o;
 return jsonb_build_object('orders',result,'page',page_number,'total',(select count(*) from public.lk_orders where customer_id=account.auth_id));
end $$;
revoke all on function public.lk_buyer_wishlist(text,text),public.lk_my_orders(integer) from public,anon,authenticated;
grant execute on function public.lk_buyer_wishlist(text,text),public.lk_my_orders(integer) to authenticated;
commit;
