-- First-time setup for a dedicated Supabase project. Schema only: no sample records.
-- Run this whole file in SQL Editor before registering real users.
begin;
create schema lk_private;
revoke all on schema lk_private from public, anon, authenticated;

create table public.lk_profiles (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  id text not null unique,
  role text not null check (role in ('customer','seller')),
  username text not null check (username ~ '^[a-z0-9_]{3,30}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  email text not null default '' check (length(email)<=120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role, username)
);
create table public.lk_shops (
  id text primary key references public.lk_profiles(id) on delete cascade,
  owner_id uuid not null unique references public.lk_profiles(auth_id) on delete cascade,
  profile jsonb not null check (jsonb_typeof(profile)='object')
);
create table public.lk_products (
  id text primary key,
  seller_id text not null references public.lk_shops(id) on delete cascade,
  owner_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data)='object'),
  status text generated always as (data->>'status') stored,
  created_at timestamptz not null default now(),
  check (status in ('active','draft','archived'))
);
create index lk_product_owner on public.lk_products(owner_id);
create index lk_product_public on public.lk_products(status, created_at desc);
create unique index lk_product_sku on public.lk_products(seller_id,lower(data->>'sku')) where data->>'sku' <> '';
create table public.lk_drafts (
  owner_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
  draft_key text not null,
  data jsonb not null check (jsonb_typeof(data)='object'),
  primary key(owner_id,draft_key)
);
create table public.lk_carts (
  owner_id uuid primary key references public.lk_profiles(auth_id) on delete cascade,
  items jsonb not null check (jsonb_typeof(items)='object')
);

alter table public.lk_profiles enable row level security;
alter table public.lk_shops enable row level security;
alter table public.lk_products enable row level security;
alter table public.lk_drafts enable row level security;
alter table public.lk_carts enable row level security;
create policy lk_own_profile on public.lk_profiles for select to authenticated using (auth_id=(select auth.uid()));
create policy lk_public_shops on public.lk_shops for select to anon,authenticated using (true);
create policy lk_public_products on public.lk_products for select to anon,authenticated using (status='active' or owner_id=(select auth.uid()));
create policy lk_own_drafts on public.lk_drafts for select to authenticated using (owner_id=(select auth.uid()));
create policy lk_own_cart on public.lk_carts for select to authenticated using (owner_id=(select auth.uid()));
-- Clients cannot mutate tables directly, even if someone bypasses the website UI.
revoke all on public.lk_profiles,public.lk_shops,public.lk_products,public.lk_drafts,public.lk_carts from public,anon,authenticated;
grant select on public.lk_shops,public.lk_products to anon,authenticated;
grant select on public.lk_profiles,public.lk_drafts,public.lk_carts to authenticated;

create function lk_private.text(value jsonb, maxlen integer, required boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
  result:=case when jsonb_typeof(value)='string' then btrim(value #>> '{}') else '' end;
  if length(result)>maxlen or (required and result='') then raise exception 'Check the required text fields and their maximum lengths.'; end if;
  return result;
end $$;

create function lk_private.me(expected_role text default null)
returns public.lk_profiles language plpgsql stable security definer set search_path='' as $$
declare result public.lk_profiles;
begin
  select * into result from public.lk_profiles where auth_id=auth.uid();
  if not found or (expected_role is not null and result.role<>expected_role) then
    raise exception 'Sign in through the correct account website.' using errcode='42501';
  end if;
  return result;
end $$;

create function lk_private.image(value jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare result text; bytes bytea;
begin
  result:=lk_private.text(value,900000,false);
  if result='' or result='assets/products/placeholder.svg' then return 'assets/products/placeholder.svg'; end if;
  if result !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Upload a JPG, PNG, or WebP photo.'; end if;
  bytes:=decode(split_part(result,',',2),'base64');
  if (result like 'data:image/png;%' and substring(bytes from 1 for 8)<>decode('89504e470d0a1a0a','hex'))
    or (result like 'data:image/jpeg;%' and substring(bytes from 1 for 3)<>decode('ffd8ff','hex'))
    or (result like 'data:image/webp;%' and (substring(bytes from 1 for 4)<>decode('52494646','hex') or substring(bytes from 9 for 4)<>decode('57454250','hex')))
    or octet_length(bytes)<12 then raise exception 'The uploaded image is invalid.'; end if;
  return result;
end $$;

create function lk_private.register_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare account_role text; account_username text; account_name text; contact text; account_id text;
begin
  account_role:=new.raw_user_meta_data->>'role';
  account_username:=lower(lk_private.text(new.raw_user_meta_data->'username',30,true));
  account_name:=lk_private.text(new.raw_user_meta_data->'name',80,true);
  contact:=lk_private.text(new.raw_user_meta_data->'contact_email',120,false);
  if account_role is null or account_role not in ('customer','seller') or account_username !~ '^[a-z0-9_]{3,30}$'
    or new.email is distinct from account_username||'@'||account_role||'.lk-store.invalid' then
    raise exception 'Invalid account registration.';
  end if;
  if contact<>'' and contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid contact email.'; end if;
  account_id:=account_role||'_'||replace(new.id::text,'-','');
  insert into public.lk_profiles(auth_id,id,role,username,name,email) values(new.id,account_id,account_role,account_username,account_name,contact);
  if account_role='seller' then
    insert into public.lk_shops(id,owner_id,profile) values(account_id,new.id,jsonb_build_object('id',account_id,'name',account_name,'tagline','','description','','email','','phone','','location','','color','#c5a6f5'));
  end if;
  return new;
end $$;
create trigger lk_new_account after insert on auth.users for each row execute function lk_private.register_profile();

create function public.lk_update_account(input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; contact text;
begin
  account:=lk_private.me(); contact:=lk_private.text(input->'email',120,false);
  if contact<>'' and contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid contact email.'; end if;
  update public.lk_profiles set name=lk_private.text(input->'name',80,true),email=contact,updated_at=now() where auth_id=account.auth_id;
end $$;

create function public.lk_update_shop(input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb; contact text;
begin
  account:=lk_private.me('seller');
  if input ? 'storeId' and input->>'storeId' is distinct from account.id then raise exception 'You can only manage your own store.' using errcode='42501'; end if;
  contact:=lk_private.text(input->'email',120,false);
  if contact<>'' and contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid store email.'; end if;
  result:=jsonb_build_object('id',account.id,'name',lk_private.text(input->'name',120,true),'tagline',lk_private.text(input->'tagline',140),'description',lk_private.text(input->'description',2000),'email',contact,'phone',lk_private.text(input->'phone',120),'location',lk_private.text(input->'location',120),'color','#c5a6f5');
  update public.lk_shops set profile=result where owner_id=account.auth_id;
  return result;
end $$;

create function public.lk_save_product(input jsonb, product_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; old_product public.lk_products; product_key text; result jsonb; price numeric; stock integer; chosen_status text; category text;
begin
  account:=lk_private.me('seller');
  if input ? 'storeId' and input->>'storeId' is distinct from account.id then raise exception 'You can only manage your own store.' using errcode='42501'; end if;
  if product_id is not null then
    select * into old_product from public.lk_products p where p.id=product_id and p.owner_id=account.auth_id for update;
    if not found then raise exception 'Product not found in your store.' using errcode='42501'; end if;
  end if;
  if coalesce(input->>'price','') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then raise exception 'Enter a valid price with up to two decimal places.'; end if;
  price:=(input->>'price')::numeric;
  if price<0.01 or price>999999.99 then raise exception 'Enter a price from $0.01 to $999,999.99.'; end if;
  if coalesce(input->>'stock','') !~ '^[0-9]{1,5}$' then raise exception 'Stock must be a whole number from 0 to 99,999.'; end if;
  stock:=(input->>'stock')::integer; chosen_status:=input->>'status'; category:=input->>'category';
  if chosen_status is null or chosen_status not in ('active','draft','archived') or category is null or category not in ('Tech','Home','Accessories','Lifestyle') then raise exception 'Choose a valid category and status.'; end if;
  product_key:=coalesce(product_id,'product_'||replace(gen_random_uuid()::text,'-',''));
  result:=jsonb_build_object('id',product_key,'sellerId',account.id,'name',lk_private.text(input->'name',80,true),'summary',lk_private.text(input->'summary',100,true),'description',lk_private.text(input->'description',2000,true),'category',category,'price',price,'priceCents',round(price*100)::integer,'stock',stock,'status',chosen_status,'sku',lk_private.text(input->'sku',40),'image',lk_private.image(input->'image'),'color',case when input->>'color' ~ '^#[a-fA-F0-9]{6}$' then input->>'color' else '#e7dbed' end,'isNew',coalesce(input->'isNew'='true'::jsonb,false),'isCustom',true,'createdAt',coalesce(old_product.data->>'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updatedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  if product_id is null then insert into public.lk_products(id,seller_id,owner_id,data) values(product_key,account.id,account.auth_id,result);
  else update public.lk_products set data=result where id=product_key and owner_id=account.auth_id; end if;
  delete from public.lk_drafts d where d.owner_id=account.auth_id and d.draft_key=coalesce(product_id,'new');
  return result;
exception when unique_violation then raise exception 'That SKU is already used in your store.';
end $$;

create function public.lk_product_status(product_id text,next_status text)
returns void language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles;
begin
  account:=lk_private.me('seller');
  if next_status is null or next_status not in ('active','draft','archived') then raise exception 'Choose a valid status.'; end if;
  update public.lk_products set data=data||jsonb_build_object('status',next_status,'updatedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) where id=product_id and owner_id=account.auth_id;
  if not found then raise exception 'Product not found in your store.' using errcode='42501'; end if;
end $$;

create function public.lk_save_draft(draft_key text,input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb; field text; size integer;
begin
  account:=lk_private.me('seller');
  if draft_key is null or (draft_key<>'new' and not exists(select 1 from public.lk_products where id=draft_key and owner_id=account.auth_id)) then raise exception 'That draft is not part of your store.' using errcode='42501'; end if;
  if input is null then delete from public.lk_drafts d where d.owner_id=account.auth_id and d.draft_key=lk_save_draft.draft_key; return; end if;
  result:='{}'::jsonb;
  for field,size in select * from (values('name',80),('summary',100),('description',2000),('category',30),('price',30),('stock',10),('status',20),('sku',40),('imageName',200),('color',10)) fields(name,maxlen) loop
    result:=result||jsonb_build_object(field,lk_private.text(input->field,size));
  end loop;
  result:=result||jsonb_build_object('image',lk_private.image(input->'image'),'isNew',coalesce(input->'isNew'='true'::jsonb,false));
  insert into public.lk_drafts as d(owner_id,draft_key,data) values(account.auth_id,lk_save_draft.draft_key,result) on conflict on constraint lk_drafts_pkey do update set data=excluded.data;
end $$;

create function public.lk_save_cart(items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; product_key text; quantity jsonb; product_data jsonb;
begin
  account:=lk_private.me('customer');
  if jsonb_typeof(items) is distinct from 'object' or octet_length(items::text)>100000 then raise exception 'Cart items must be a small JSON object.'; end if;
  for product_key,quantity in select * from jsonb_each(items) loop
    if jsonb_typeof(quantity)<>'number' or quantity::text !~ '^[0-9]{1,2}$' or quantity::integer<1 then raise exception 'Cart quantities must be whole numbers from 1 to 99.'; end if;
    select data into product_data from public.lk_products where id=product_key and status='active' for share;
    if not found or quantity::integer>(product_data->>'stock')::integer then raise exception 'A product is unavailable or its quantity exceeds stock.'; end if;
  end loop;
  insert into public.lk_carts as c(owner_id,items) values(account.auth_id,items) on conflict(owner_id) do update set items=excluded.items;
  return items;
end $$;

-- Only these owner-checking functions are callable from a signed-in browser.
revoke all on function public.lk_update_account(jsonb),public.lk_update_shop(jsonb),public.lk_save_product(jsonb,text),public.lk_product_status(text,text),public.lk_save_draft(text,jsonb),public.lk_save_cart(jsonb) from public,anon,authenticated;
grant execute on function public.lk_update_account(jsonb),public.lk_update_shop(jsonb),public.lk_save_product(jsonb,text),public.lk_product_status(text,text),public.lk_save_draft(text,jsonb),public.lk_save_cart(jsonb) to authenticated;
commit;
