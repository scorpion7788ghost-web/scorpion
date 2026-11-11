-- Run after admin-console.sql. Additive, rerunnable; no sample reviews or changed orders.
begin;
create table if not exists public.lk_product_reviews (
 id uuid primary key default gen_random_uuid(),
 product_id text not null references public.lk_products(id) on delete cascade,
 customer_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 title text not null check(length(btrim(title)) between 1 and 100),
 body text not null check(length(btrim(body)) between 1 and 3000),
 verified_purchase boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(product_id,customer_id)
);
create index if not exists lk_reviews_product_date on public.lk_product_reviews(product_id,created_at desc,id);
create index if not exists lk_reviews_product_rating on public.lk_product_reviews(product_id,rating,created_at desc,id);
alter table public.lk_product_reviews enable row level security;
-- Default-deny RLS and no table privileges: all access passes through the guarded RPCs below.
revoke all on public.lk_product_reviews from public,anon,authenticated;

create or replace function lk_private.review_purchase(product_key text,customer_key uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.lk_orders o join public.lk_products p on p.id=product_key and p.owner_id=o.seller_id
  where o.customer_id=customer_key and o.payment_status='paid' and o.status<>'cancelled'
  and o.refunded_cents<o.total_cents
  and exists(select 1 from jsonb_array_elements(o.items) item
   where coalesce(item->>'productId',item->>'product_id',item->>'id')=product_key
   and coalesce(item->>'quantity','') ~ '^[1-9][0-9]{0,4}$')
 );
$$;
create or replace function lk_private.review_json(review public.lk_product_reviews)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',review.id,'rating',review.rating,'title',review.title,'body',review.body,
  'name',(select p.name from public.lk_profiles p where p.auth_id=review.customer_id),
  'verifiedPurchase',review.verified_purchase,'createdAt',review.created_at,'updatedAt',review.updated_at,
  'isMine',review.customer_id=auth.uid());
$$;

create or replace function public.lk_product_review_list(product_key text,sort_order text default 'newest',page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.lk_profiles; product public.lk_products; summary jsonb; reviews jsonb; mine jsonb; eligible boolean;
begin
 account:=lk_private.me('customer');
 if sort_order is null or sort_order not in ('newest','oldest','highest','lowest') or page_number is null or page_number<1 or page_number>100000 then raise exception 'Choose a valid review sort and page.'; end if;
 select * into product from public.lk_products p where p.id=product_key and p.status='active' and p.moderation='approved' and public.lk_catalog_owner_is_approved(p.owner_id);
 if not found then raise exception 'This product is no longer available.' using errcode='42501'; end if;
 select jsonb_build_object('total',count(*),'average',coalesce(round(avg(rating),2),0),'distribution',jsonb_build_object(
  '5',count(*) filter(where rating=5),'4',count(*) filter(where rating=4),'3',count(*) filter(where rating=3),
  '2',count(*) filter(where rating=2),'1',count(*) filter(where rating=1))) into summary
 from public.lk_product_reviews where product_id=product_key;
 select lk_private.review_json(r) into mine from public.lk_product_reviews r where r.product_id=product_key and r.customer_id=account.auth_id;
 select coalesce(jsonb_agg(lk_private.review_json(r)),'[]'::jsonb) into reviews from (
  select r.* from public.lk_product_reviews r where r.product_id=product_key
  order by case when sort_order='highest' then r.rating end desc,
   case when sort_order='lowest' then r.rating end asc,
   case when sort_order='oldest' then r.created_at end asc,
   case when sort_order<>'oldest' then r.created_at end desc,r.id
  limit 10 offset (page_number-1)*10
 ) r;
 eligible:=product.owner_id<>account.auth_id and lk_private.review_purchase(product_key,account.auth_id);
 return jsonb_build_object('summary',summary,'reviews',reviews,'mine',mine,'page',page_number,'pageSize',10,'canReview',eligible,
  'eligibilityMessage',case when product.owner_id=account.auth_id then 'You cannot review products from your own store.'
   when not eligible then 'Reviews are available after a paid purchase of this product is recorded. Cancelled and fully refunded orders do not qualify.' else '' end);
end $$;

create or replace function public.lk_product_review_write(operation text,product_key text,review_id uuid default null,
 review_rating integer default null,review_title text default null,review_body text default null,expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; product public.lk_products; existing public.lk_product_reviews; saved public.lk_product_reviews;
begin
 account:=lk_private.me('customer');
 if operation is null or operation not in ('create','update','delete') then raise exception 'Choose a valid review action.'; end if;
 if operation<>'create' then
  select * into existing from public.lk_product_reviews r where r.id=review_id and r.product_id=product_key and r.customer_id=account.auth_id for update;
  if not found then raise exception 'You can only manage your own review.' using errcode='42501'; end if;
  if expected_updated_at is null or expected_updated_at<>existing.updated_at then raise exception 'Your review changed in another tab. Reload the reviews before trying again.' using errcode='40001'; end if;
  if operation='delete' then
   delete from public.lk_product_reviews where id=existing.id and customer_id=account.auth_id;
   return jsonb_build_object('deleted',true);
  end if;
 end if;
 select * into product from public.lk_products p where p.id=product_key and p.status='active' and p.moderation='approved' and public.lk_catalog_owner_is_approved(p.owner_id) for share;
 if not found then raise exception 'This product is no longer available.' using errcode='42501'; end if;
 if product.owner_id=account.auth_id then raise exception 'You cannot review products from your own store.' using errcode='42501'; end if;
 if review_rating is null or review_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5 stars.'; end if;
 review_title:=btrim(review_title); review_body:=btrim(review_body);
 if review_title is null or length(review_title) not between 1 and 100 or review_title !~ '[^[:space:]]'
  or review_body is null or length(review_body) not between 1 and 3000 or review_body !~ '[^[:space:]]'
 then raise exception 'Enter a title (1-100 characters) and review (1-3000 characters).'; end if;
 if operation='create' then
  if review_id is not null then raise exception 'A new review cannot specify an existing review.'; end if;
  if not lk_private.review_purchase(product_key,account.auth_id) then raise exception 'A paid purchase of this product is required to write a review.' using errcode='42501'; end if;
  insert into public.lk_product_reviews(product_id,customer_id,rating,title,body,verified_purchase)
  values(product_key,account.auth_id,review_rating,review_title,review_body,true) returning * into saved;
 else
  update public.lk_product_reviews set rating=review_rating,title=review_title,body=review_body,updated_at=clock_timestamp()
  where id=existing.id and customer_id=account.auth_id returning * into saved;
 end if;
 return lk_private.review_json(saved);
exception when unique_violation then raise exception 'You already reviewed this product. Edit your existing review instead.' using errcode='23505';
end $$;
revoke all on function lk_private.review_purchase(text,uuid),lk_private.review_json(public.lk_product_reviews) from public,anon,authenticated,service_role;
revoke all on function public.lk_product_review_list(text,text,integer),public.lk_product_review_write(text,text,uuid,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.lk_product_review_list(text,text,integer),public.lk_product_review_write(text,text,uuid,integer,text,text,timestamptz) to authenticated;
commit;
