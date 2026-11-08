-- Run this entire migration AFTER admin-portals.sql and community-tools.sql.
-- Additive administration tools. No accounts, products, orders or sample data are created.
begin;
alter table public.lk_profiles add column if not exists account_active boolean not null default true;
alter table public.lk_products add column if not exists moderation text not null default 'approved'
 check (moderation in ('pending','approved','rejected'));

create table if not exists public.lk_console_settings (
 singleton boolean primary key default true check(singleton),
 store_name text not null default 'LK Tech Store' check(length(store_name) between 1 and 80),
 support_email text not null default '', moderation_required boolean not null default false
);
insert into public.lk_console_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.lk_categories (
 name text primary key check(length(btrim(name)) between 1 and 40), active boolean not null default true
);
-- These are the store's existing category definitions, not example products.
insert into public.lk_categories(name) select unnest(array['Tech','Home','Accessories','Lifestyle']) on conflict do nothing;
insert into public.lk_categories(name) select distinct data->>'category' from public.lk_products
 where length(btrim(data->>'category')) between 1 and 40 on conflict do nothing;
create table if not exists public.lk_admin_events (
 id bigint generated always as identity primary key, actor_id uuid, actor_name text not null default 'System',
 action text not null, entity_id text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists lk_events_time on public.lk_admin_events(created_at desc,id desc);
create table if not exists public.lk_seller_decisions (
 id bigint generated always as identity primary key, seller_id uuid not null,
 decision text not null check(decision in ('approved','rejected')), reason text not null default '',
 actor_id uuid, created_at timestamptz not null default now()
);
create index if not exists lk_decisions_seller on public.lk_seller_decisions(seller_id,id desc);
create table if not exists public.lk_seller_documents (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
 name text not null check(length(name) between 1 and 120), image text not null, created_at timestamptz not null default now()
);
create table if not exists public.lk_orders (
 id text primary key check(length(id) between 1 and 100), customer_id uuid references public.lk_profiles(auth_id) on delete set null,
 seller_id uuid references public.lk_profiles(auth_id) on delete set null, customer_name text not null, seller_name text not null,
 items jsonb not null check(jsonb_typeof(items)='array'), total_cents bigint not null check(total_cents>=0),
 currency text not null default 'USD' check(currency='USD'),
 status text not null default 'processing' check(status in ('processing','shipped','delivered','cancelled')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')),
 refunded_cents bigint not null default 0 check(refunded_cents>=0 and refunded_cents<=total_cents),
 tracking text not null default '' check(length(tracking)<=200),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists lk_orders_time on public.lk_orders(created_at desc,id);
create table if not exists public.lk_announcements (
 id uuid primary key default gen_random_uuid(), author_id uuid, title text not null check(length(title) between 1 and 120),
 body text not null check(length(body) between 1 and 2000),
 audience text not null check(audience in ('all','customer','seller','worker','individual')),
 recipient_id uuid references public.lk_profiles(auth_id) on delete cascade,
 created_at timestamptz not null default now(), check((audience='individual')=(recipient_id is not null))
);
create table if not exists public.lk_support_tickets (
 customer_id uuid primary key references public.lk_profiles(auth_id) on delete cascade,
 status text not null default 'open' check(status in ('open','in_progress','resolved')),
 updated_at timestamptz not null default now()
);
create table if not exists public.lk_admin_preferences (
 auth_id uuid primary key references public.lk_profiles(auth_id) on delete cascade,
 show_security_alerts boolean not null default true, show_pending_sellers boolean not null default true
);
do $$ declare t text; begin
 foreach t in array array['lk_console_settings','lk_categories','lk_admin_events','lk_seller_decisions','lk_seller_documents','lk_orders','lk_announcements','lk_support_tickets','lk_admin_preferences'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
-- Server-only order ingestion by a future checkout/payment integration.
grant select,insert,update on public.lk_orders to service_role;

create or replace function public.lk_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lk_profiles p where p.auth_id=auth.uid() and p.account_active
 and p.verification_status='approved' and (lk_private.is_owner_id(p.auth_id) or exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)));
$$;
create or replace function lk_private.me(expected_role text default null)
returns public.lk_profiles language plpgsql stable security definer set search_path='' as $$
declare result public.lk_profiles; begin
 select * into result from public.lk_profiles where auth_id=auth.uid();
 if not found or not result.account_active then raise exception 'Your account is unavailable. Contact support.' using errcode='42501'; end if;
 if result.verification_status<>'approved' then raise exception 'Please wait, we will verify you.' using errcode='42501'; end if;
 if expected_role is not null and result.role<>expected_role and not(expected_role in ('customer','seller') and public.lk_is_admin()) then raise exception 'Sign in through the correct account website.' using errcode='42501'; end if;
 return result;
end $$;
create or replace function public.lk_has_store_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lk_profiles where auth_id=auth.uid() and account_active and verification_status='approved' and (role in ('customer','seller') or public.lk_is_admin()));
$$;
create or replace function public.lk_catalog_owner_is_approved(account_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lk_profiles p where p.auth_id=account_id and p.account_active and p.verification_status='approved'
 and (p.role='seller' or lk_private.is_owner_id(p.auth_id) or exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)));
$$;
create or replace function public.lk_staff_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('isAdmin',public.lk_is_admin(),'isWorker',exists(select 1 from public.lk_profiles where auth_id=auth.uid() and account_active and role='worker' and verification_status='approved'));
$$;
alter policy lk_member_products on public.lk_products using ((select public.lk_has_store_access()) and public.lk_catalog_owner_is_approved(owner_id)
 and ((status='active' and moderation='approved') or owner_id=(select auth.uid())));
create or replace function lk_private.chat_target(target_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid; begin
 perform lk_private.me(); result:=coalesce(target_id,auth.uid());
 if result<>auth.uid() and not public.lk_is_admin() then raise exception 'This conversation is private.' using errcode='42501'; end if;
 if not exists(select 1 from public.lk_profiles where auth_id=result and role='customer') then raise exception 'Choose a customer conversation.'; end if;
 return result;
end $$;
create or replace function lk_private.console_require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin if not public.lk_is_admin() then raise exception 'Admin access is required.' using errcode='42501'; end if; end $$;
create or replace function lk_private.console_event(event_action text, target text, info jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.lk_admin_events(actor_id,actor_name,action,entity_id,details)
 values(auth.uid(),coalesce((select username from public.lk_profiles where auth_id=auth.uid()),'System'),event_action,target,info);
$$;
create or replace function lk_private.console_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare record_id text; info jsonb; n jsonb:=to_jsonb(new); o jsonb:=to_jsonb(old); begin
 record_id:=case when tg_table_name='lk_profiles' then coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id') else coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'auth_id',to_jsonb(old)->>'auth_id') end;
 info:=case when tg_table_name='lk_products' then jsonb_build_object('name',coalesce(n->'data'->>'name',o->'data'->>'name'),'status',n->>'status','moderation',n->>'moderation')
 when tg_table_name='lk_profiles' then jsonb_build_object('username',coalesce(n->>'username',o->>'username'),'role',coalesce(n->>'role',o->>'role'),'active',n->'account_active')
 else '{}'::jsonb end;
 perform lk_private.console_event(tg_table_name||'.'||lower(tg_op),record_id,info);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists lk_console_profile_audit on public.lk_profiles;
create trigger lk_console_profile_audit after insert or update or delete on public.lk_profiles for each row execute function lk_private.console_audit();
drop trigger if exists lk_console_product_audit on public.lk_products;
create trigger lk_console_product_audit after insert or update or delete on public.lk_products for each row execute function lk_private.console_audit();
drop trigger if exists lk_console_permission_audit on public.lk_admins;
create trigger lk_console_permission_audit after insert or update or delete on public.lk_admins for each row execute function lk_private.console_audit();
create or replace function lk_private.console_auth_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.last_sign_in_at is distinct from old.last_sign_in_at then
  insert into public.lk_admin_events(actor_id,actor_name,action,entity_id,details) select new.id,p.username,
   case when exists(select 1 from public.lk_admins a where a.auth_id=new.id) then 'admin.login' else 'user.login' end,new.id::text,'{}' from public.lk_profiles p where p.auth_id=new.id;
 end if; return new;
end $$;
drop trigger if exists lk_console_login_audit on auth.users;
create trigger lk_console_login_audit after update of last_sign_in_at on auth.users for each row execute function lk_private.console_auth_audit();
create or replace function lk_private.console_product_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.lk_is_admin() then
  if tg_op='UPDATE' then new.moderation:=old.moderation; end if;
  if (select moderation_required from public.lk_console_settings where singleton) then
   if tg_op='INSERT' or new.data is distinct from old.data then new.moderation:='pending'; end if;
  end if;
 end if; return new;
end $$;
drop trigger if exists lk_console_product_guard on public.lk_products;
create trigger lk_console_product_guard before insert or update on public.lk_products for each row execute function lk_private.console_product_guard();
create or replace function lk_private.console_ticket_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.lk_support_tickets(customer_id,status) values(new.conversation_id,case when new.author_kind='customer' then 'open' else 'in_progress' end)
 on conflict(customer_id) do update set status=case when new.author_kind='customer' then 'open' else public.lk_support_tickets.status end,updated_at=now();
 return new;
end $$;
drop trigger if exists lk_console_ticket_sync on public.lk_messages;
create trigger lk_console_ticket_sync after insert on public.lk_messages for each row execute function lk_private.console_ticket_sync();
insert into public.lk_support_tickets(customer_id) select distinct conversation_id from public.lk_messages on conflict do nothing;

create or replace function public.lk_approve_seller(target_auth_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff jsonb; approved public.lk_profiles; begin
 staff:=public.lk_staff_status();
 if not coalesce((staff->>'isAdmin')::boolean,false) and not coalesce((staff->>'isWorker')::boolean,false) then raise exception 'Worker or Admin access is required.' using errcode='42501'; end if;
 update public.lk_profiles set verification_status='approved',verified_at=now(),verified_by=auth.uid(),updated_at=now()
 where auth_id=target_auth_id and role='seller' and verification_status='pending' and account_active returning * into approved;
 if not found then raise exception 'This seller is not awaiting verification or is inactive. Refresh the list.'; end if;
 insert into public.lk_seller_decisions(seller_id,decision,actor_id) values(target_auth_id,'approved',auth.uid());
 perform lk_private.console_event('seller.approved',target_auth_id::text);
 return jsonb_build_object('ok',true,'username',approved.username);
end $$;

create or replace function public.lk_console_categories() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform lk_private.me(); return (select coalesce(jsonb_agg(name order by name),'[]') from public.lk_categories where active); end $$;
create or replace function public.lk_notifications() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.lk_profiles; begin
 p:=lk_private.me(); return (select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from (
 select id,title,body,created_at from public.lk_announcements where audience='all' or audience=p.role or recipient_id=p.auth_id order by created_at desc limit 100)a);
end $$;

create or replace function public.lk_admin_console(section text, filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; pg integer; term text; state_filter text; sort_key text; descending boolean;
 since_date date; until_date date; grain text; rows_json jsonb; detail_id text;
begin
 perform lk_private.console_require_admin();
 if filters is null or jsonb_typeof(filters)<>'object' then raise exception 'Invalid filters.'; end if;
 pg:=coalesce((filters->>'page')::integer,1); term:=lower(lk_private.text(filters->'search',120));
 state_filter:=coalesce(nullif(filters->>'status',''),'all'); sort_key:=coalesce(filters->>'sort','created_at'); descending:=coalesce(filters->>'direction','desc')='desc';
 if pg<1 or pg>100000 or sort_key not in ('created_at','name','status','total','role') then raise exception 'Invalid page or sort.'; end if;
 since_date:=coalesce(nullif(filters->>'from','')::date,current_date-29); until_date:=coalesce(nullif(filters->>'to','')::date,current_date);
 if until_date<since_date or until_date-since_date>366 then raise exception 'Choose a date range of up to one year.'; end if;
 detail_id:=filters->>'id';
 if section in ('dashboard','analytics') then
  grain:=coalesce(filters->>'period','day'); if grain not in ('day','week','month') then raise exception 'Choose daily, weekly or monthly.'; end if;
  select jsonb_build_object('users',(select count(*) from public.lk_profiles),'sellers',(select count(*) from public.lk_profiles where role='seller'),
   'customers',(select count(*) from public.lk_profiles where role='customer'),'products',(select count(*) from public.lk_products),
   'orders',(select count(*) from public.lk_orders),'pending',(select count(*) from public.lk_profiles p where role='seller' and verification_status='pending' and not exists(select 1 from public.lk_seller_decisions d where d.id=(select max(d2.id) from public.lk_seller_decisions d2 where d2.seller_id=p.auth_id) and d.decision='rejected')),
   'sales',coalesce((select sum(total_cents) from public.lk_orders where payment_status in ('paid','refunded') and created_at>=since_date and created_at<until_date+1),0),
   'refunds',coalesce((select sum(refunded_cents) from public.lk_orders where created_at>=since_date and created_at<until_date+1),0),
   'periodOrders',(select count(*) from public.lk_orders where created_at>=since_date and created_at<until_date+1),
   'activeProducts',(select count(*) from public.lk_products where status='active' and moderation='approved'),
   'unresolved',(select count(*) from public.lk_support_tickets where status<>'resolved')) into result;
  select coalesce(jsonb_agg(jsonb_build_object('date',b.bucket,'sales',coalesce(o.sales,0),'orders',coalesce(o.orders,0),'users',coalesce(p.users,0),'sellers',coalesce(p.sellers,0)) order by b.bucket),'[]') into rows_json
   from (select distinct date_trunc(grain,d)::date bucket from generate_series(since_date::timestamp,until_date::timestamp,interval '1 day')d)b
   left join (select date_trunc(grain,created_at at time zone 'UTC')::date bucket,sum(case when payment_status in ('paid','refunded') then total_cents-refunded_cents else 0 end) sales,count(*) orders from public.lk_orders where created_at>=since_date and created_at<until_date+1 group by 1)o using(bucket)
   left join (select date_trunc(grain,created_at at time zone 'UTC')::date bucket,count(*) users,count(*) filter(where role='seller') sellers from public.lk_profiles where created_at>=since_date and created_at<until_date+1 group by 1)p using(bucket);
  return jsonb_build_object('metrics',result,'series',rows_json,'recentOrders',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from (select id,customer_name,status,total_cents,created_at from public.lk_orders order by created_at desc limit 5)o),
   'recentActivities',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select actor_name,action,created_at from public.lk_admin_events order by id desc limit 8)e));
 elsif section='settings' then
  return jsonb_build_object('settings',(select to_jsonb(s)-'singleton' from public.lk_console_settings s where singleton),
   'preferences',coalesce((select to_jsonb(p)-'auth_id' from public.lk_admin_preferences p where auth_id=auth.uid()),'{"show_security_alerts":true,"show_pending_sellers":true}'),
   'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by name),'[]') from public.lk_categories c));
 elsif section='seller-detail' then
  return jsonb_build_object('profile',(select to_jsonb(p) from public.lk_profiles p where auth_id=detail_id::uuid and role='seller'),
   'history',(select coalesce(jsonb_agg(to_jsonb(d) order by id desc),'[]') from public.lk_seller_decisions d where seller_id=detail_id::uuid),
   'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.lk_seller_documents d where seller_id=detail_id::uuid));
 elsif section='product-detail' then return (select to_jsonb(p) from public.lk_products p where id=detail_id);
 elsif section='order-detail' then return (select to_jsonb(o) from public.lk_orders o where id=detail_id);
 elsif section not in ('accounts','verifications','products','orders','notifications','support','logs') then raise exception 'Unknown section.';
 end if;
 with entries as (
  select p.auth_id::text id,p.name,p.created_at,p.role,
   case when not p.account_active then 'inactive' else 'active' end status,0::bigint amount,
   to_jsonb(p)||jsonb_build_object('isAdmin',exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id),'isOwner',lk_private.is_owner_id(p.auth_id)) data,
   lower(p.name||' '||p.username||' '||p.email) search
   from public.lk_profiles p where section='accounts' and (coalesce(filters->>'role','all')='all' or p.role=filters->>'role' or (filters->>'role'='admin' and exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)))
  union all
  select p.auth_id::text,p.name,p.created_at,p.role,case when p.verification_status='approved' then 'approved' when (select decision from public.lk_seller_decisions d where d.seller_id=p.auth_id order by id desc limit 1)='rejected' then 'rejected' else 'pending' end,0,to_jsonb(p),lower(p.name||' '||p.username)
   from public.lk_profiles p where section='verifications' and role='seller'
  union all
  select p.id,p.data->>'name',p.created_at,'',case when p.moderation<>'approved' then p.moderation else p.status end,coalesce((p.data->>'priceCents')::bigint,0),
   jsonb_build_object('id',p.id,'name',p.data->>'name','category',p.data->>'category','brand',p.data->>'brand','price',p.data->'price','stock',p.data->'stock','status',p.status,'moderation',p.moderation,'seller',s.username,'created_at',p.created_at),lower((p.data->>'name')||' '||coalesce(p.data->>'brand','')||' '||s.username)
   from public.lk_products p join public.lk_profiles s on s.auth_id=p.owner_id where section='products' and (coalesce(filters->>'category','all')='all' or p.data->>'category'=filters->>'category')
  union all
  select o.id,o.customer_name,o.created_at,'',o.status,o.total_cents,to_jsonb(o)-'items',lower(o.id||' '||o.customer_name||' '||o.seller_name) from public.lk_orders o where section='orders'
  union all
  select a.id::text,a.title,a.created_at,a.audience,a.audience,0,to_jsonb(a),lower(a.title||' '||a.body) from public.lk_announcements a where section='notifications'
  union all
  select p.auth_id::text,p.name,t.updated_at,p.role,t.status,0,jsonb_build_object('id',p.auth_id,'name',p.name,'username',p.username,'status',t.status,'created_at',t.updated_at,'preview',(select body from public.lk_messages where conversation_id=p.auth_id order by id desc limit 1)),lower(p.name||' '||p.username)
   from public.lk_support_tickets t join public.lk_profiles p on p.auth_id=t.customer_id where section='support'
  union all
  select e.id::text,e.actor_name,e.created_at,'',e.action,0,to_jsonb(e),lower(e.action||' '||e.actor_name||' '||coalesce(e.entity_id,'')) from public.lk_admin_events e where section='logs'
 ), matching as (select * from entries where strpos(search,term)>0 and (state_filter='all' or status=state_filter or (section='logs' and state_filter='security' and (data->'details'->>'active'='false' or status in ('product-reject','product-remove','seller-reject','lk_admins.delete'))))
  and (nullif(filters->>'from','') is null or created_at>=since_date) and (nullif(filters->>'to','') is null or created_at<until_date+1)),
 sorted as (select *,row_number() over(order by
  case when sort_key='created_at' and descending then created_at end desc,case when sort_key='created_at' and not descending then created_at end asc,
  case when sort_key='total' and descending then amount end desc,case when sort_key='total' and not descending then amount end asc,
  case when sort_key in ('name','status','role') and descending then case sort_key when 'name' then lower(name) when 'status' then status else role end end desc,
  case when sort_key in ('name','status','role') and not descending then case sort_key when 'name' then lower(name) when 'status' then status else role end end asc,id) rn from matching)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(data||jsonb_build_object('display_status',status) order by rn) from sorted where rn between (pg-1)*25+1 and pg*25),'[]'),
 'total',(select count(*) from matching),'page',pg,'pageSize',25) into result;
 return result;
end $$;

create or replace function public.lk_admin_command(action text, input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; person public.lk_profiles; item public.lk_products; ord public.lk_orders; desired text; reason text; price numeric; stock integer; changes jsonb; recipient uuid;
begin
 perform pg_advisory_xact_lock(730411); perform lk_private.console_require_admin();
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>12000 then raise exception 'Invalid input.'; end if;
 reason:=lk_private.text(input->'reason',1000);
 if action='account-status' then
  target:=(input->>'id')::uuid;
  if target is null or target=auth.uid() or lk_private.is_owner_id(target) then raise exception 'This account is protected.' using errcode='42501'; end if;
  if exists(select 1 from public.lk_admins where auth_id=target) and not public.lk_is_owner() then raise exception 'Only the Owner can manage Admin accounts.' using errcode='42501'; end if;
  if jsonb_typeof(input->'active') is distinct from 'boolean' then raise exception 'Choose an account status.'; end if;
  update public.lk_profiles set account_active=(input->>'active')::boolean,updated_at=now() where auth_id=target;
  if not found then raise exception 'Account not found.'; end if;
 elsif action='seller-reject' then
  target:=(input->>'id')::uuid;
  if reason='' then raise exception 'Enter a rejection reason.'; end if;
  select * into person from public.lk_profiles where auth_id=target and role='seller' for update;
  if not found or person.verification_status<>'pending' then raise exception 'Only a pending seller can be rejected.'; end if;
  insert into public.lk_seller_decisions(seller_id,decision,reason,actor_id) values(target,'rejected',reason,auth.uid());
 elsif action='seller-approve' then return public.lk_approve_seller((input->>'id')::uuid);
 elsif action in ('product-edit','product-approve','product-reject','product-remove') then
  select * into item from public.lk_products where id=input->>'id' for update;
  if not found then raise exception 'Product not found.'; end if;
  if action='product-edit' then
   if coalesce(input->>'price','') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' or (input->>'price')::numeric<0.01 then raise exception 'Enter a price from 0.01 to 999999.99.'; end if;
   if coalesce(input->>'stock','') !~ '^[0-9]{1,5}$' then raise exception 'Enter stock from 0 to 99999.'; end if;
   price:=(input->>'price')::numeric; stock:=(input->>'stock')::integer;
   if not exists(select 1 from public.lk_categories where name=input->>'category' and active) or coalesce(input->>'status','') not in ('active','draft','archived') then raise exception 'Choose an active category and valid status.'; end if;
   changes:=jsonb_build_object('name',lk_private.text(input->'name',80,true),'summary',lk_private.text(input->'summary',100,true),'description',lk_private.text(input->'description',2000,true),'brand',lk_private.text(input->'brand',60),'category',input->>'category','price',price,'priceCents',round(price*100)::integer,'stock',stock,'status',input->>'status','updatedAt',now());
   update public.lk_products set data=data||changes where id=item.id;
  elsif action='product-remove' then
   if reason='' then raise exception 'Enter a removal reason.'; end if;
   -- Retain the listing for audit and restore; remove it from the storefront.
   update public.lk_products set data=data||jsonb_build_object('status','archived','updatedAt',now()),moderation='rejected' where id=item.id;
  else
   if action='product-reject' and reason='' then raise exception 'Enter a rejection reason.'; end if;
   update public.lk_products set moderation=case when action='product-approve' then 'approved' else 'rejected' end where id=item.id;
  end if;
 elsif action='order-status' then
  select * into ord from public.lk_orders where id=input->>'id' for update;
  if not found then raise exception 'Order not found.'; end if;
  if input->>'expected' is distinct from ord.status then raise exception 'Order changed. Refresh before updating.'; end if;
  desired:=input->>'status';
  if not ((ord.status='processing' and desired in ('shipped','cancelled')) or (ord.status='shipped' and desired='delivered') or desired=ord.status) then raise exception 'This order status transition is not allowed.'; end if;
  if desired='cancelled' and (ord.payment_status<>'unpaid' or reason='') then raise exception 'Only unpaid orders can be cancelled here, with a reason. Paid orders require a payment provider refund workflow.'; end if;
  update public.lk_orders set status=desired,tracking=lk_private.text(input->'tracking',200),updated_at=now() where id=ord.id;
 elsif action='announcement' then
  desired:=input->>'audience';
  if desired is null or desired not in ('all','customer','seller','worker','individual') then raise exception 'Choose an audience.'; end if;
  if desired='individual' then
   select auth_id into recipient from public.lk_profiles where id=input->>'recipient';
   if recipient is null then raise exception 'Choose an existing account ID from Account Management.'; end if;
  end if;
  insert into public.lk_announcements(id,author_id,title,body,audience,recipient_id)
   values((input->>'requestId')::uuid,auth.uid(),lk_private.text(input->'title',120,true),lk_private.text(input->'body',2000,true),desired,recipient)
   on conflict(id) do nothing;
 elsif action='ticket-status' then
  desired:=input->>'status'; if desired is null or desired not in ('open','in_progress','resolved') then raise exception 'Choose a ticket status.'; end if;
  update public.lk_support_tickets set status=desired,updated_at=now() where customer_id=(input->>'id')::uuid;
  if not found then raise exception 'Ticket not found.'; end if;
 elsif action='category' then
  desired:=lk_private.text(input->'name',40,true);
  if jsonb_typeof(input->'active') is distinct from 'boolean' then raise exception 'Choose category availability.'; end if;
  insert into public.lk_categories(name,active) values(desired,(input->>'active')::boolean) on conflict(name) do update set active=excluded.active;
 elsif action='settings' then
  if not public.lk_is_owner() then raise exception 'Only the Owner can change website configuration.' using errcode='42501'; end if;
  desired:=lk_private.text(input->'support_email',120);
  if desired<>'' and desired !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(input->'moderation_required') is distinct from 'boolean' then raise exception 'Enter a valid email and moderation setting.'; end if;
  update public.lk_console_settings set store_name=lk_private.text(input->'store_name',80,true),support_email=desired,moderation_required=(input->>'moderation_required')::boolean where singleton;
 elsif action='preferences' then
  if jsonb_typeof(input->'show_security_alerts') is distinct from 'boolean' or jsonb_typeof(input->'show_pending_sellers') is distinct from 'boolean' then raise exception 'Invalid notification preferences.'; end if;
  insert into public.lk_admin_preferences(auth_id,show_security_alerts,show_pending_sellers) values(auth.uid(),(input->>'show_security_alerts')::boolean,(input->>'show_pending_sellers')::boolean)
   on conflict(auth_id) do update set show_security_alerts=excluded.show_security_alerts,show_pending_sellers=excluded.show_pending_sellers;
 else raise exception 'Unknown administrative action.';
 end if;
 perform lk_private.console_event(action,coalesce(input->>'id',input->>'name'),jsonb_build_object('reason',reason));
 return '{"ok":true}'::jsonb;
end $$;

revoke all on function lk_private.console_require_admin(),lk_private.console_event(text,text,jsonb),lk_private.console_audit(),lk_private.console_auth_audit(),lk_private.console_product_guard(),lk_private.console_ticket_sync() from public,anon,authenticated,service_role;
revoke all on function public.lk_admin_console(text,jsonb),public.lk_admin_command(text,jsonb),public.lk_notifications(),public.lk_console_categories() from public,anon,authenticated;
grant execute on function public.lk_admin_console(text,jsonb),public.lk_admin_command(text,jsonb),public.lk_notifications(),public.lk_console_categories() to authenticated;
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
  if chosen_status is null or chosen_status not in ('active','draft','archived') or category is null or not exists(select 1 from public.lk_categories c where c.name=category and c.active) then raise exception 'Choose a valid category and status.'; end if;
  product_key:=coalesce(product_id,'product_'||replace(gen_random_uuid()::text,'-',''));
  result:=jsonb_build_object('id',product_key,'sellerId',account.id,'name',lk_private.text(input->'name',80,true),'summary',lk_private.text(input->'summary',100,true),'description',lk_private.text(input->'description',2000,true),'category',category,'price',price,'priceCents',round(price*100)::integer,'stock',stock,'status',chosen_status,'sku',lk_private.text(input->'sku',40),'brand',case when input ? 'brand' then lk_private.text(input->'brand',60) else coalesce(old_product.data->>'brand','') end,'image',lk_private.image(input->'image'),'color',case when input->>'color' ~ '^#[a-fA-F0-9]{6}$' then input->>'color' else '#e7dbed' end,'isNew',coalesce(input->'isNew'='true'::jsonb,false),'isCustom',true,'createdAt',coalesce(old_product.data->>'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updatedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  if product_id is null then insert into public.lk_products(id,seller_id,owner_id,data) values(product_key,account.id,account.auth_id,result);
  else update public.lk_products set data=result where id=product_key and owner_id=account.auth_id; end if;
  delete from public.lk_drafts d where d.owner_id=account.auth_id and d.draft_key=coalesce(product_id,'new');
  return result;
exception when unique_violation then raise exception 'That SKU is already used in your store.';
end $$;


create or replace function public.lk_save_cart(items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.lk_profiles; product_key text; quantity jsonb; product_data jsonb;
begin
  account:=lk_private.me('customer');
  if jsonb_typeof(items) is distinct from 'object' or octet_length(items::text)>100000 then raise exception 'Cart items must be a small JSON object.'; end if;
  for product_key,quantity in select * from jsonb_each(items) loop
    if jsonb_typeof(quantity)<>'number' or quantity::text !~ '^[0-9]{1,2}$' or quantity::integer<1 then raise exception 'Cart quantities must be whole numbers from 1 to 99.'; end if;
    select data into product_data from public.lk_products where id=product_key and status='active' and moderation='approved' and public.lk_catalog_owner_is_approved(owner_id) for share;
    if not found or quantity::integer>(product_data->>'stock')::integer then raise exception 'A product is unavailable or its quantity exceeds stock.'; end if;
  end loop;
  insert into public.lk_carts as c(owner_id,items) values(account.auth_id,items) on conflict(owner_id) do update set items=excluded.items;
  return items;
end $$;


commit;
