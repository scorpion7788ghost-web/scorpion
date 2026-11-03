-- Optional SQL Editor verification. Every temporary record is rolled back.
-- Run after schema.sql. A failing assertion aborts the transaction; do not commit it.
begin;
select set_config('lk_test.seller_one',gen_random_uuid()::text,true);
select set_config('lk_test.seller_two',gen_random_uuid()::text,true);
select set_config('lk_test.customer',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select account_id::uuid,username||'@'||account_role||'.lk-store.invalid',
  jsonb_build_object('role',account_role,'username',username,'name','Temporary access check','contact_email','private-access-check@example.invalid')
from (
  select account_id,account_role,'qa_'||left(replace(account_id,'-',''),24) as username
  from (values(current_setting('lk_test.seller_one'),'seller'),(current_setting('lk_test.seller_two'),'seller'),(current_setting('lk_test.customer'),'customer')) as accounts(account_id,account_role)
) as prepared;

select set_config('request.jwt.claim.sub',current_setting('lk_test.seller_one'),true);
set local role authenticated;
do $$
declare listing jsonb; mine text;
begin
  select id into mine from public.lk_profiles;
  if (select count(*) from public.lk_profiles)<>1 then raise exception 'FAIL: private profiles leaked.'; end if;
  perform public.lk_update_shop(jsonb_build_object('name','Temporary owned shop','storeId',mine));
  listing:=public.lk_save_product('{"name":"Temporary access check","summary":"Transactional verification","description":"Removed by rollback","category":"Tech","price":"12.50","stock":"3","status":"draft","sku":"","isNew":true}'::jsonb,null);
  perform set_config('lk_test.product',listing->>'id',true);
  perform public.lk_save_draft('new','{"name":"Temporary private draft"}'::jsonb);
  if (select count(*) from public.lk_drafts)<>1 then raise exception 'FAIL: own draft inaccessible.'; end if;
  begin
    update public.lk_profiles set role='customer';
    raise exception 'FAIL: direct role mutation was allowed.';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',current_setting('lk_test.seller_two'),true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.lk_products where id=current_setting('lk_test.product')) then raise exception 'FAIL: another seller draft leaked.'; end if;
  if exists(select 1 from public.lk_drafts where owner_id=current_setting('lk_test.seller_one')::uuid) then raise exception 'FAIL: private editor draft leaked.'; end if;
  begin
    perform public.lk_product_status(current_setting('lk_test.product'),'active');
    raise exception 'FAIL: another seller product was changed.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lk_update_shop(jsonb_build_object('storeId','seller_'||replace(current_setting('lk_test.seller_one'),'-',''),'name','Unauthorized change'));
    raise exception 'FAIL: another seller shop was changed.';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',current_setting('lk_test.customer'),true);
set local role authenticated;
do $$
begin
  begin
    perform public.lk_product_status(current_setting('lk_test.product'),'active');
    raise exception 'FAIL: customer changed a product.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lk_save_cart(jsonb_build_object(current_setting('lk_test.product'),1));
    raise exception 'FAIL: a private draft was accepted into a customer cart.';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',current_setting('lk_test.seller_one'),true);
set local role authenticated;
select public.lk_product_status(current_setting('lk_test.product'),'active');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
begin
  if not exists(select 1 from public.lk_products where id=current_setting('lk_test.product') and status='active') then raise exception 'FAIL: published product is not public.'; end if;
  begin
    perform * from public.lk_profiles;
    raise exception 'FAIL: anonymous visitors read registration details.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lk_product_status(current_setting('lk_test.product'),'archived');
    raise exception 'FAIL: anonymous write allowed.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: profile privacy, product visibility, immutable roles, seller ownership, private drafts, and anonymous/customer write denial. All test records rolled back.' as result;
