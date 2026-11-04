-- Run after worker-verification.sql. Safe to rerun; adds no example accounts.
begin;
create table if not exists public.lk_account_audit (
 id bigint generated always as identity primary key, actor_id uuid, target_id uuid,
 before_state jsonb not null, after_state jsonb not null, created_at timestamptz not null default now()
);
alter table public.lk_account_audit enable row level security;
revoke all on public.lk_account_audit from public,anon,authenticated;

create or replace function public.lk_directory(page_number integer default 1, role_filter text default 'all', username_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin_access boolean; staff jsonb; result jsonb; total bigint;
begin
 admin_access:=public.lk_is_admin(); staff:=public.lk_staff_status();
 if not admin_access and not coalesce((staff->>'isWorker')::boolean,false) then raise exception 'Worker or Admin access is required.' using errcode='42501'; end if;
 if page_number is null or page_number<1 or page_number>100000 or role_filter is null or role_filter not in ('all','admin','customer','seller','worker') or username_search is null or username_search !~ '^[a-zA-Z0-9_]{0,30}$' then raise exception 'Choose a valid directory filter.'; end if;
 if not admin_access and role_filter in ('admin','customer') then raise exception 'Admin access is required.' using errcode='42501'; end if;
 select count(*) into total from public.lk_profiles p where (admin_access or p.role in ('seller','worker'))
 and (role_filter='all' or p.role=role_filter or (role_filter='admin' and exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)))
 and strpos(p.username,lower(username_search))>0;
 select coalesce(jsonb_agg(entry order by created_at desc,auth_id),'[]'::jsonb) into result from (
  select p.created_at,p.auth_id,jsonb_build_object('auth_id',p.auth_id,'id',p.id,'role',p.role,'username',p.username,'name',p.name,'verification_status',p.verification_status,'created_at',p.created_at)
   || case when admin_access then jsonb_build_object('email',p.email,'isAdmin',exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)) else '{}'::jsonb end as entry
  from public.lk_profiles p where (admin_access or p.role in ('seller','worker'))
  and (role_filter='all' or p.role=role_filter or (role_filter='admin' and exists(select 1 from public.lk_admins a where a.auth_id=p.auth_id)))
  and strpos(p.username,lower(username_search))>0 order by p.created_at desc,p.auth_id limit 25 offset (page_number-1)*25
 ) entries;
 return jsonb_build_object('users',result,'total',total,'page',page_number,'pageSize',25);
end $$;

create or replace function public.lk_admin_update_account(target_auth_id uuid, display_name text, contact_email text, admin_access boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.lk_profiles; old_admin boolean; updated public.lk_profiles;
begin
 -- Serialize permission changes and recheck the caller after acquiring the lock.
 perform pg_advisory_xact_lock(730411);
 if not public.lk_is_admin() then raise exception 'Admin access is required.' using errcode='42501'; end if;
 if target_auth_id=auth.uid() then raise exception 'Use My Account to edit yourself. Another Admin must change your access.' using errcode='42501'; end if;
 if admin_access is null or display_name is null or char_length(trim(display_name)) not between 1 and 80 or contact_email is null or char_length(trim(contact_email))>120 or (trim(contact_email)<>'' and trim(contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter valid account details.'; end if;
 select * into target from public.lk_profiles where auth_id=target_auth_id for update;
 if not found then raise exception 'This account no longer exists.'; end if;
 if admin_access and target.verification_status<>'approved' then raise exception 'Approve this seller before granting Admin access.'; end if;
 old_admin:=exists(select 1 from public.lk_admins where auth_id=target_auth_id);
 update public.lk_profiles set name=trim(display_name),email=trim(contact_email),updated_at=now() where auth_id=target_auth_id returning * into updated;
 if admin_access then insert into public.lk_admins(auth_id) values(target_auth_id) on conflict do nothing;
 else delete from public.lk_admins where auth_id=target_auth_id; end if;
 insert into public.lk_account_audit(actor_id,target_id,before_state,after_state) values(auth.uid(),target_auth_id,
  jsonb_build_object('name',target.name,'email',target.email,'isAdmin',old_admin),jsonb_build_object('name',updated.name,'email',updated.email,'isAdmin',admin_access));
 return jsonb_build_object('ok',true,'username',updated.username);
end $$;

create table if not exists public.lk_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.lk_profiles(auth_id) on delete cascade,
 author_id uuid references public.lk_profiles(auth_id) on delete set null,
 author_kind text not null check(author_kind in ('customer','admin')),
 body text not null check(char_length(body) between 1 and 2000),
 client_id uuid not null, created_at timestamptz not null default now(),
 unique(conversation_id,client_id)
);
create index if not exists lk_messages_thread on public.lk_messages(conversation_id,id desc);
alter table public.lk_messages enable row level security;
revoke all on public.lk_messages from public,anon,authenticated;

create or replace function lk_private.chat_target(target_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in.' using errcode='42501'; end if;
 result:=coalesce(target_id,auth.uid());
 if result<>auth.uid() and not public.lk_is_admin() then raise exception 'This conversation is private.' using errcode='42501'; end if;
 if not exists(select 1 from public.lk_profiles where auth_id=result and role='customer') then raise exception 'Choose a customer conversation.' using errcode='42501'; end if;
 return result;
end $$;

create or replace function public.lk_chat_messages(target_id uuid default null, before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid; messages jsonb; oldest bigint;
begin
 target:=lk_private.chat_target(target_id);
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb),min(m.id) into messages,oldest from (
  select id,author_kind,body,created_at from public.lk_messages where conversation_id=target and (before_id is null or id<before_id) order by id desc limit 50
 ) m;
 return jsonb_build_object('messages',messages,'hasOlder',exists(select 1 from public.lk_messages where conversation_id=target and id<oldest));
end $$;

create or replace function public.lk_chat_send(message_body text, client_request_id uuid, target_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; sent public.lk_messages; kind text;
begin
 target:=lk_private.chat_target(target_id);
 if client_request_id is null or message_body is null or char_length(trim(message_body)) not between 1 and 2000 then raise exception 'Enter a message between 1 and 2000 characters.'; end if;
 kind:=case when target_id is not null and public.lk_is_admin() then 'admin' else 'customer' end;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,730412));
 select * into sent from public.lk_messages where conversation_id=target and client_id=client_request_id;
 if found then
  if sent.author_id is distinct from auth.uid() then raise exception 'Invalid message request.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'id',sent.id);
 end if;
 if (select count(*) from public.lk_messages where author_id=auth.uid() and created_at>now()-interval '1 minute')>=12 then raise exception 'Please wait a minute before sending more messages.'; end if;
 insert into public.lk_messages(conversation_id,author_id,author_kind,body,client_id) values(target,auth.uid(),kind,trim(message_body),client_request_id) returning * into sent;
 return jsonb_build_object('ok',true,'id',sent.id);
end $$;

create or replace function public.lk_chat_inbox(page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not public.lk_is_admin() then raise exception 'Admin access is required.' using errcode='42501'; end if;
 if page_number is null or page_number<1 or page_number>100000 then raise exception 'Choose a valid page.'; end if;
 select count(distinct conversation_id) into total from public.lk_messages;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.last_id desc),'[]'::jsonb) into result from (
  select p.auth_id,p.name,p.username,m.body as preview,m.author_kind,m.created_at,m.id as last_id from public.lk_profiles p
  join lateral(select * from public.lk_messages where conversation_id=p.auth_id order by id desc limit 1)m on true
  order by m.id desc limit 25 offset (page_number-1)*25
 )t;
 return jsonb_build_object('conversations',result,'total',total,'pageSize',25);
end $$;

create or replace function public.lk_community_status() returns jsonb language sql stable set search_path='' as $$ select '{"version":1}'::jsonb; $$;
revoke all on function lk_private.chat_target(uuid) from public,anon,authenticated;
revoke all on function public.lk_directory(integer,text,text),public.lk_admin_update_account(uuid,text,text,boolean),public.lk_chat_messages(uuid,bigint),public.lk_chat_send(text,uuid,uuid),public.lk_chat_inbox(integer),public.lk_community_status() from public,anon,authenticated;
grant execute on function public.lk_directory(integer,text,text),public.lk_admin_update_account(uuid,text,text,boolean),public.lk_chat_messages(uuid,bigint),public.lk_chat_send(text,uuid,uuid),public.lk_chat_inbox(integer) to authenticated;
grant execute on function public.lk_community_status() to anon,authenticated;
commit;
