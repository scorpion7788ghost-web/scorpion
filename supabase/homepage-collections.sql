-- Run after admin-console.sql. Read-only rankings; no records or tables are changed.
begin;
create or replace function public.lk_homepage_collections()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform lk_private.me('customer');
 with sales as (
  select p.id,
   sum(case when line->>'quantity' ~ '^[1-9][0-9]{0,5}$' then (line->>'quantity')::integer else 0 end) as units,
   sum(case when o.created_at>=now()-interval '30 days' and line->>'quantity' ~ '^[1-9][0-9]{0,5}$' then (line->>'quantity')::integer else 0 end) as recent
  from public.lk_orders o cross join lateral jsonb_array_elements(o.items) line
  join public.lk_products p on p.id=coalesce(line->>'productId',line->>'product_id',line->>'id') and p.owner_id=o.seller_id
  where o.payment_status='paid' and o.status<>'cancelled' and o.refunded_cents=0
   and p.status='active' and p.moderation='approved' and public.lk_catalog_owner_is_approved(p.owner_id)
  group by p.id
 )
 select jsonb_build_object(
  'bestSellers',coalesce((select jsonb_agg(id order by units desc,id) from (select id,units from sales where units>0 order by units desc,id limit 12) b),'[]'::jsonb),
  'trending',coalesce((select jsonb_agg(id order by recent desc,id) from (select id,recent from sales where recent>0 order by recent desc,id limit 12) t),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.lk_homepage_collections() from public,anon,authenticated;
grant execute on function public.lk_homepage_collections() to authenticated;
commit;
