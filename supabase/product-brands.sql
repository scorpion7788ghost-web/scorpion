-- Optional product brand storage. Run after the existing store setup. Safe to rerun.
-- Existing products are preserved; missing brands stay unspecified.
begin;

create or replace function public.lk_save_product(input jsonb, product_id text default null)
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
  result:=jsonb_build_object('id',product_key,'sellerId',account.id,'name',lk_private.text(input->'name',80,true),'summary',lk_private.text(input->'summary',100,true),'description',lk_private.text(input->'description',2000,true),'category',category,'price',price,'priceCents',round(price*100)::integer,'stock',stock,'status',chosen_status,'sku',lk_private.text(input->'sku',40),'brand',case when input ? 'brand' then lk_private.text(input->'brand',60) else coalesce(old_product.data->>'brand','') end,'image',lk_private.image(input->'image'),'color',case when input->>'color' ~ '^#[a-fA-F0-9]{6}$' then input->>'color' else '#e7dbed' end,'isNew',coalesce(input->'isNew'='true'::jsonb,false),'isCustom',true,'createdAt',coalesce(old_product.data->>'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updatedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  if product_id is null then insert into public.lk_products(id,seller_id,owner_id,data) values(product_key,account.id,account.auth_id,result);
  else update public.lk_products set data=result where id=product_key and owner_id=account.auth_id; end if;
  delete from public.lk_drafts d where d.owner_id=account.auth_id and d.draft_key=coalesce(product_id,'new');
  return result;
exception when unique_violation then raise exception 'That SKU is already used in your store.';
end $$;

create or replace function public.lk_save_draft(draft_key text,input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb; field text; size integer;
begin
  account:=lk_private.me('seller');
  if draft_key is null or (draft_key<>'new' and not exists(select 1 from public.lk_products where id=draft_key and owner_id=account.auth_id)) then raise exception 'That draft is not part of your store.' using errcode='42501'; end if;
  if input is null then delete from public.lk_drafts d where d.owner_id=account.auth_id and d.draft_key=lk_save_draft.draft_key; return; end if;
  result:='{}'::jsonb;
  for field,size in select * from (values('name',80),('summary',100),('description',2000),('category',30),('price',30),('stock',10),('status',20),('sku',40),('brand',60),('imageName',200),('color',10)) fields(name,maxlen) loop
    result:=result||jsonb_build_object(field,lk_private.text(input->field,size));
  end loop;
  result:=result||jsonb_build_object('image',lk_private.image(input->'image'),'isNew',coalesce(input->'isNew'='true'::jsonb,false));
  insert into public.lk_drafts as d(owner_id,draft_key,data) values(account.auth_id,lk_save_draft.draft_key,result) on conflict on constraint lk_drafts_pkey do update set data=excluded.data;
end $$;

create or replace function public.lk_product_fields_status()
returns jsonb language sql stable set search_path='' as $$ select '{"brand":true,"version":1}'::jsonb; $$;
revoke all on function public.lk_product_fields_status() from public,anon,authenticated;
grant execute on function public.lk_product_fields_status() to authenticated;
commit;
