-- Run after admin-console.sql and buyer-experience.sql. No sample orders or delivery prices.
begin;
create table if not exists public.lk_delivery_rates (
 district text primary key check(length(btrim(district)) between 1 and 80),
 fee_cents integer not null check(fee_cents between 0 and 10000000),
 per_seller boolean not null default false, active boolean not null default true
);
create table if not exists public.lk_checkouts (
 id uuid primary key default gen_random_uuid(), customer_id uuid references public.lk_profiles(auth_id) on delete set null,
 quote jsonb not null, delivery jsonb, placed_at timestamptz,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes'
);
create index if not exists lk_checkouts_customer on public.lk_checkouts(customer_id,created_at desc);
alter table public.lk_delivery_rates enable row level security;
alter table public.lk_checkouts enable row level security;
revoke all on public.lk_delivery_rates,public.lk_checkouts from public,anon,authenticated;
alter table public.lk_orders add column if not exists checkout_id uuid references public.lk_checkouts(id);
alter table public.lk_orders add column if not exists payment_method text check(payment_method is null or payment_method='cod');
alter table public.lk_orders add column if not exists delivery_fee_cents bigint not null default 0 check(delivery_fee_cents>=0);
alter table public.lk_orders add column if not exists subtotal_cents bigint;
alter table public.lk_orders drop constraint if exists lk_orders_status_check;
alter table public.lk_orders add constraint lk_orders_status_check check(status in ('pending','processing','shipped','delivered','cancelled'));
create index if not exists lk_orders_checkout on public.lk_orders(checkout_id);

-- Stock reservation/restoration alone must not take an approved listing out of the catalog.
create or replace function lk_private.console_product_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.lk_is_admin() then
  if tg_op='UPDATE' then new.moderation:=old.moderation; end if;
  if (select moderation_required from public.lk_console_settings where singleton) then
   if tg_op='INSERT' then new.moderation:='pending';
   elsif (new.data-'stock'-'updatedAt') is distinct from (old.data-'stock'-'updatedAt') then new.moderation:='pending'; end if;
  end if;
 end if; return new;
end $$;

create or replace function public.lk_delivery_options() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform lk_private.me('customer');
 return (select coalesce(jsonb_agg(to_jsonb(r) order by district),'[]') from public.lk_delivery_rates r where active);
end $$;
create or replace function public.lk_delivery_config(operation text default 'list',input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare district_name text;
begin
 perform lk_private.console_require_admin();
 if operation='save' then
  if not public.lk_is_owner() then raise exception 'Only the Owner can configure delivery fees.' using errcode='42501'; end if;
  district_name:=lk_private.text(input->'district',80,true);
  if district_name !~ '[^[:space:]]' or coalesce(input->>'feeCents','') !~ '^[0-9]{1,8}$' or (input->>'feeCents')::bigint>10000000
   or jsonb_typeof(input->'perSeller') is distinct from 'boolean' or jsonb_typeof(input->'active') is distinct from 'boolean' then raise exception 'Enter a valid district and delivery fee.'; end if;
  insert into public.lk_delivery_rates values(district_name,(input->>'feeCents')::integer,(input->>'perSeller')::boolean,(input->>'active')::boolean)
   on conflict(district) do update set fee_cents=excluded.fee_cents,per_seller=excluded.per_seller,active=excluded.active;
  perform lk_private.console_event('delivery-config',district_name,input-'district');
 elsif operation<>'list' or operation is null then raise exception 'Invalid delivery action.'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(r) order by district),'[]') from public.lk_delivery_rates r);
end $$;

-- All cart writers take the same customer lock before touching product rows.
create or replace function public.lk_save_cart(items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; product_key text; quantity jsonb; product_data jsonb;
begin
 account:=lk_private.me('customer');
 perform pg_advisory_xact_lock(hashtextextended('lk-cart:'||account.auth_id::text,0));
 if jsonb_typeof(items) is distinct from 'object' or octet_length(items::text)>100000 then raise exception 'Cart items must be a small JSON object.'; end if;
 for product_key,quantity in select * from jsonb_each(items) order by key loop
  if jsonb_typeof(quantity)<>'number' or quantity::text !~ '^[0-9]{1,2}$' or quantity::integer<1 then raise exception 'Cart quantities must be whole numbers from 1 to 99.'; end if;
  select data into product_data from public.lk_products where id=product_key and status='active' and moderation='approved' and public.lk_catalog_owner_is_approved(owner_id) for share;
  if not found or quantity::integer>(product_data->>'stock')::integer then raise exception 'A product is unavailable or its quantity exceeds stock.'; end if;
 end loop;
 insert into public.lk_carts(owner_id,items) values(account.auth_id,items) on conflict(owner_id) do update set items=excluded.items;
 return items;
end $$;

create or replace function lk_private.cod_quote(account_id uuid,district_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cart jsonb; rate public.lk_delivery_rates; p public.lk_products; entry record; quantity integer; unit bigint;
 lines jsonb:='[]'; subtotal bigint:=0; fee bigint; sellers integer;
begin
 select * into rate from public.lk_delivery_rates where district=district_name and active for share;
 if not found then raise exception 'Delivery is not available for this district. Choose an available district.'; end if;
 select items into cart from public.lk_carts where owner_id=account_id;
 if cart is null or cart='{}'::jsonb then raise exception 'Your cart is empty.'; end if;
 for entry in select * from jsonb_each(cart) order by key loop
  if entry.value::text !~ '^[1-9][0-9]?$' then raise exception 'Invalid cart quantity.'; end if;
  quantity:=entry.value::integer;
  select * into p from public.lk_products where id=entry.key for update;
  if not found or p.status<>'active' or p.moderation<>'approved' or not public.lk_catalog_owner_is_approved(p.owner_id) then raise exception 'An item is no longer available. Return to your cart.'; end if;
  if coalesce(p.data->>'stock','') !~ '^[0-9]{1,5}$' or (p.data->>'stock')::integer<quantity then raise exception 'Not enough stock for %. Return to your cart.',p.data->>'name'; end if;
  if coalesce(p.data->>'price','') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' or (p.data->>'price')::numeric<=0 then raise exception 'An item price is unavailable. Contact support.'; end if;
  unit:=round((p.data->>'price')::numeric*100)::bigint; subtotal:=subtotal+unit*quantity;
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',p.id,'sellerId',p.owner_id,'sellerName',(select profile->>'name' from public.lk_shops where owner_id=p.owner_id),
   'name',p.data->>'name','image',p.data->>'image','sku',coalesce(p.data->>'sku',''),'quantity',quantity,'unit_cents',unit,'line_cents',unit*quantity));
 end loop;
 select count(distinct value->>'sellerId') into sellers from jsonb_array_elements(lines);
 fee:=rate.fee_cents*case when rate.per_seller then sellers else 1 end;
 return jsonb_build_object('items',lines,'cart',cart,'district',rate.district,'perSeller',rate.per_seller,'feePerDelivery',rate.fee_cents,
  'currency','USD','subtotal_cents',subtotal,'delivery_fee_cents',fee,'total_cents',subtotal+fee);
end $$;
create or replace function public.lk_checkout_quote(district_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; result public.lk_checkouts;
begin
 account:=lk_private.me('customer');
 perform pg_advisory_xact_lock(hashtextextended('lk-cart:'||account.auth_id::text,0));
 insert into public.lk_checkouts(customer_id,quote) values(account.auth_id,lk_private.cod_quote(account.auth_id,district_name)) returning * into result;
 return result.quote-'cart'||jsonb_build_object('id',result.id,'expiresAt',result.expires_at);
end $$;
create or replace function lk_private.checkout_json(checkout_key uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'createdAt',c.placed_at,'delivery',c.delivery,'currency','USD','paymentMethod','cod',
 'subtotal_cents',c.quote->'subtotal_cents','delivery_fee_cents',c.quote->'delivery_fee_cents','total_cents',c.quote->'total_cents',
 'orders',(select coalesce(jsonb_agg(to_jsonb(o)-'customer_id'-'seller_id' order by o.id),'[]') from public.lk_orders o where o.checkout_id=c.id))
 from public.lk_checkouts c where c.id=checkout_key and c.placed_at is not null;
$$;
create or replace function public.lk_checkout_details(checkout_key uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.lk_profiles;
begin
 account:=lk_private.me('customer');
 if not exists(select 1 from public.lk_checkouts where id=checkout_key and customer_id=account.auth_id and placed_at is not null) then raise exception 'Order confirmation not found.' using errcode='42501'; end if;
 return lk_private.checkout_json(checkout_key);
end $$;
create or replace function public.lk_checkout_resume(checkout_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; checkout public.lk_checkouts;
begin
 account:=lk_private.me('customer');
 perform pg_advisory_xact_lock(hashtextextended('lk-cart:'||account.auth_id::text,0));
 select * into checkout from public.lk_checkouts where id=checkout_key and customer_id=account.auth_id;
 if not found then raise exception 'Checkout not found.' using errcode='42501'; end if;
 return jsonb_build_object('placed',checkout.placed_at is not null,'quote',checkout.quote-'cart'||jsonb_build_object('id',checkout.id,'expiresAt',checkout.expires_at));
end $$;
create or replace function public.lk_checkout_place(checkout_key uuid,delivery jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; checkout public.lk_checkouts; current_quote jsonb; cleaned jsonb:='{}'; key text; field_value text; group_row record; line jsonb; fee bigint; first_seller boolean:=true;
begin
 account:=lk_private.me('customer');
 perform pg_advisory_xact_lock(hashtextextended('lk-cart:'||account.auth_id::text,0));
 select * into checkout from public.lk_checkouts where id=checkout_key and customer_id=account.auth_id for update;
 if not found then raise exception 'Checkout not found. Refresh your order summary.' using errcode='42501'; end if;
 -- Retry after a lost response returns the original order, even after stock/cart changes.
 if checkout.placed_at is not null then return lk_private.checkout_json(checkout.id); end if;
 if checkout.expires_at<now() then raise exception 'Your order summary expired. Refresh it before placing your order.'; end if;
 if jsonb_typeof(delivery) is distinct from 'object' or octet_length(delivery::text)>6000 then raise exception 'Enter valid delivery information.'; end if;
 foreach key in array array['name','mobile','email','address','city','district','postalCode','instructions'] loop
  field_value:=btrim(coalesce(delivery->>key,''));
  if jsonb_typeof(delivery->key) not in ('string','null') or length(field_value)>(case key when 'address' then 500 when 'instructions' then 1000 when 'email' then 120 else 100 end) then raise exception 'Invalid delivery field: %.',key; end if;
  if key not in ('email','instructions') and (field_value='' or field_value !~ '[^[:space:]]') then raise exception 'Please complete %.',key; end if;
  cleaned:=cleaned||jsonb_build_object(key,field_value);
 end loop;
 if cleaned->>'mobile' !~ '^\+?[0-9 ()-]{7,25}$' or length(regexp_replace(cleaned->>'mobile','[^0-9]','','g')) not between 7 and 15 then raise exception 'Enter a valid mobile number.'; end if;
 if cleaned->>'postalCode' !~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,15}$' then raise exception 'Enter a valid postal code.'; end if;
 if cleaned->>'email'<>'' and cleaned->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
 if cleaned->>'district' is distinct from checkout.quote->>'district' then raise exception 'The delivery district changed. Refresh your order summary.'; end if;
 current_quote:=lk_private.cod_quote(account.auth_id,cleaned->>'district');
 if current_quote is distinct from checkout.quote then raise exception 'Your cart, prices or delivery fee changed. Refresh your order summary and review the new total.'; end if;
 for group_row in select value->>'sellerId' seller_id,jsonb_agg(value order by value->>'productId') items,sum((value->>'line_cents')::bigint) subtotal,max(value->>'sellerName') seller_name
  from jsonb_array_elements(current_quote->'items') group by value->>'sellerId' order by value->>'sellerId' loop
  fee:=case when (current_quote->>'perSeller')::boolean or first_seller then (current_quote->>'feePerDelivery')::bigint else 0 end;
  insert into public.lk_orders(id,customer_id,seller_id,customer_name,seller_name,items,total_cents,currency,status,payment_status,payment_method,checkout_id,subtotal_cents,delivery_fee_cents)
   values('LK-'||gen_random_uuid()::text,account.auth_id,group_row.seller_id::uuid,cleaned->>'name',coalesce(group_row.seller_name,'Store'),group_row.items,
   group_row.subtotal+fee,'USD','pending','unpaid','cod',checkout.id,group_row.subtotal,fee);
  first_seller:=false;
 end loop;
 for line in select value from jsonb_array_elements(current_quote->'items') loop
  update public.lk_products set data=data||jsonb_build_object('stock',(data->>'stock')::integer-(line->>'quantity')::integer,'updatedAt',clock_timestamp()) where id=line->>'productId';
 end loop;
 update public.lk_checkouts set delivery=cleaned,placed_at=clock_timestamp() where id=checkout.id;
 update public.lk_carts set items='{}' where owner_id=account.auth_id;
 perform lk_private.console_event('cod-order-placed',checkout.id::text,jsonb_build_object('total_cents',current_quote->'total_cents'));
 return lk_private.checkout_json(checkout.id);
end $$;

create or replace function public.lk_my_orders(page_number integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb;
begin
 account:=lk_private.me('customer');
 if page_number is null or page_number<1 or page_number>100000 then raise exception 'Choose a valid page.'; end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id),'[]') into result from (
  select id,items,total_cents,currency,status,payment_status,payment_method,checkout_id,tracking,seller_name,created_at
  from public.lk_orders where customer_id=account.auth_id order by created_at desc,id limit 20 offset (page_number-1)*20) o;
 return jsonb_build_object('orders',result,'page',page_number,'total',(select count(*) from public.lk_orders where customer_id=account.auth_id));
end $$;
create or replace function public.lk_seller_orders(page_number integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.lk_profiles; result jsonb;
begin
 account:=lk_private.me('seller');
 if page_number is null or page_number<1 or page_number>100000 then raise exception 'Choose a valid page.'; end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id),'[]') into result from (
  select o.id,o.customer_name,o.items,o.total_cents,o.currency,o.status,o.payment_status,o.payment_method,o.tracking,o.created_at,c.delivery
  from public.lk_orders o left join public.lk_checkouts c on c.id=o.checkout_id where o.seller_id=account.auth_id order by o.created_at desc,o.id limit 20 offset (page_number-1)*20) o;
 return jsonb_build_object('orders',result,'page',page_number,'total',(select count(*) from public.lk_orders where seller_id=account.auth_id));
end $$;
-- COD fulfillment and cash collection are Admin-only; sellers can read their own delivery details.
create or replace function public.lk_cod_manage(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ord public.lk_orders; desired text; line jsonb; reason text;
begin
 perform lk_private.console_require_admin();
 select * into ord from public.lk_orders where id=input->>'id' and payment_method='cod' for update;
 if not found then raise exception 'COD order not found.'; end if;
 desired:=input->>'status';reason:=lk_private.text(input->'reason',1000);
 if input->>'expected' is distinct from ord.status or input->>'expectedPayment' is distinct from ord.payment_status then raise exception 'Order changed. Refresh before updating.'; end if;
 if desired is null or not (desired=ord.status or (ord.status='pending' and desired in ('processing','cancelled')) or (ord.status='processing' and desired in ('shipped','cancelled')) or (ord.status='shipped' and desired='delivered')) then raise exception 'This order status transition is not allowed.'; end if;
 if jsonb_typeof(input->'collected') is distinct from 'boolean' then raise exception 'Confirm the cash collection status.'; end if;
 if (input->>'collected')::boolean and desired<>'delivered' then raise exception 'Cash can only be recorded as collected for a delivered order.'; end if;
 if desired='cancelled' and (ord.payment_status<>'unpaid' or reason='') then raise exception 'Cancellation requires an unpaid order and a reason.'; end if;
 if desired='cancelled' and ord.status<>'cancelled' then
  for line in select value from jsonb_array_elements(ord.items) order by value->>'productId' loop
   update public.lk_products set data=data||jsonb_build_object('stock',(data->>'stock')::integer+(line->>'quantity')::integer,'updatedAt',clock_timestamp()) where id=line->>'productId';
  end loop;
 end if;
 update public.lk_orders set status=desired,tracking=lk_private.text(input->'tracking',200),payment_status=case when (input->>'collected')::boolean then 'paid' else payment_status end,updated_at=clock_timestamp() where id=ord.id;
 perform lk_private.console_event('cod-order-updated',ord.id,jsonb_build_object('status',desired,'collected',input->'collected','reason',reason));
 return '{"ok":true}';
end $$;
-- Add private shipping details only to the already Admin-guarded order detail RPC.
do $$ begin
 if to_regprocedure('lk_private.admin_console_before_cod(text,jsonb)') is null then
  alter function public.lk_admin_console(text,jsonb) rename to lk_admin_console_before_cod;
  alter function public.lk_admin_console_before_cod(text,jsonb) set schema lk_private;
  alter function lk_private.lk_admin_console_before_cod(text,jsonb) rename to admin_console_before_cod;
 end if;
end $$;
create or replace function public.lk_admin_console(section text,filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=lk_private.admin_console_before_cod(section,filters);
 if section='order-detail' and result->>'checkout_id' is not null then
  result:=result||jsonb_build_object('delivery',(select delivery from public.lk_checkouts where id=(result->>'checkout_id')::uuid));
 end if;
 return result;
end $$;
revoke all on function lk_private.admin_console_before_cod(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lk_admin_console(text,jsonb) from public,anon,authenticated;
grant execute on function public.lk_admin_console(text,jsonb) to authenticated;

-- Route old admin clients through the same COD rules instead of allowing a stock-restoration bypass.
do $$ begin
 if to_regprocedure('lk_private.admin_command_before_cod(text,jsonb)') is null then
  alter function public.lk_admin_command(text,jsonb) rename to lk_admin_command_before_cod;
  alter function public.lk_admin_command_before_cod(text,jsonb) set schema lk_private;
  alter function lk_private.lk_admin_command_before_cod(text,jsonb) rename to admin_command_before_cod;
 end if;
end $$;
create or replace function public.lk_admin_command(action text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if action='order-status' and exists(select 1 from public.lk_orders where id=input->>'id' and payment_method='cod') then
  return public.lk_cod_manage(input||jsonb_build_object('collected',false,'expectedPayment','unpaid'));
 end if;
 return lk_private.admin_command_before_cod(action,input);
end $$;
revoke all on function lk_private.cod_quote(uuid,text),lk_private.checkout_json(uuid),lk_private.admin_command_before_cod(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lk_delivery_options(),public.lk_delivery_config(text,jsonb),public.lk_checkout_quote(text),public.lk_checkout_details(uuid),public.lk_checkout_resume(uuid),public.lk_checkout_place(uuid,jsonb),public.lk_seller_orders(integer),public.lk_cod_manage(jsonb),public.lk_admin_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.lk_delivery_options(),public.lk_delivery_config(text,jsonb),public.lk_checkout_quote(text),public.lk_checkout_details(uuid),public.lk_checkout_resume(uuid),public.lk_checkout_place(uuid,jsonb),public.lk_seller_orders(integer),public.lk_cod_manage(jsonb),public.lk_admin_command(text,jsonb) to authenticated;
commit;
