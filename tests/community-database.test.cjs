/* Isolated PostgreSQL tests. No requests to the live project. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.LK_PGLITE_MODULE||'../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const admin=id(1),buyer=id(2),other=id(3),worker=id(4),seller=id(5);
 async function account(n,role,name){await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id(n),name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name,contact_email:''}),JSON.stringify({lk_managed:true})]);}
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
 async function rpc(who,sql,args=[]){return (await as(who,'select '+sql+' as result',args)).rows[0].result;}
 async function denied(who,sql,args=[]){await assert.rejects(rpc(who,sql,args));}
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await account(1,'customer','scorpion');
  await db.exec(fs.readFileSync('supabase/admin-access.sql','utf8'));await db.exec(fs.readFileSync('supabase/worker-verification.sql','utf8'));
  await account(2,'customer','buyer');await account(3,'customer','other');await account(4,'worker','worker');await account(5,'seller','seller');
  const upgrade=fs.readFileSync('supabase/community-tools.sql','utf8');await db.exec(upgrade);await db.exec(upgrade);
  let directory=await rpc(worker,"public.lk_directory(1,'all','')");assert.equal(directory.total,2);assert(directory.users.every(p=>['seller','worker'].includes(p.role)&&!('email' in p)&&!('isAdmin' in p)));
  for(const who of [buyer,seller])await denied(who,"public.lk_directory(1,'all','')");
  await denied(worker,"public.lk_directory(1,'admin','')");await denied(worker,"public.lk_directory(1,'customer','')");await denied(worker,"public.lk_directory(0,'all','')");
  for(let n=10;n<38;n++)await account(n,'seller','seller_'+n);
  directory=await rpc(worker,"public.lk_directory(1,'seller','')");assert.equal(directory.total,29);assert.equal(directory.users.length,25);
  assert.equal((await rpc(worker,"public.lk_directory(2,'seller','')")).users.length,4);
  assert.equal((await rpc(admin,"public.lk_directory(1,'admin','')")).total,1);
  const update='public.lk_admin_update_account($1,$2,$3,$4)';
  await denied(worker,update,[buyer,'Changed','',true]);await denied(buyer,update,[buyer,'Changed','',true]);await denied(admin,update,[admin,'Self','',false]);
  await denied(admin,update,[seller,'Pending','',true]);
  await rpc(admin,update,[other,'Second Admin','second@example.test',true]);assert.equal(await rpc(other,'public.lk_is_admin()'),true);
  await rpc(admin,update,[other,'Updated Admin','updated@example.test',true]);
  assert.equal((await rpc(admin,"public.lk_directory(1,'admin','other')")).users[0].name,'Updated Admin');
  await rpc(admin,update,[other,'Buyer Again','',false]);assert.equal(await rpc(other,'public.lk_is_admin()'),false);assert.equal(await rpc(admin,'public.lk_is_admin()'),true);
  await denied(other,update,[admin,'Hacked','',false]);
  assert.equal((await db.query('select count(*)::int as n from public.lk_account_audit')).rows[0].n,3);
  const send='public.lk_chat_send($1,$2,$3)',read='public.lk_chat_messages($1,$2)';
  const first=await rpc(buyer,send,['Hello <script>test</script>',id(100),null]);assert.equal((await rpc(buyer,send,['Hello <script>test</script>',id(100),null])).id,first.id,'A retry must not duplicate a message');
  await rpc(other,send,['Private second conversation',id(101),null]);
  await denied(other,read,[buyer,null]);await denied(worker,read,[buyer,null]);await denied(seller,send,['No',id(102),null]);await denied(worker,'public.lk_chat_inbox(1)');
  await denied(other,send,['Spoofed reply',id(103),buyer]);await rpc(admin,send,['Admin response',id(104),buyer]);
  const thread=await rpc(buyer,read,[null,null]);assert.equal(thread.messages.length,2);assert.equal(thread.messages[1].author_kind,'admin');assert.equal(thread.messages[0].body,'Hello <script>test</script>');
  assert.equal((await rpc(admin,'public.lk_chat_inbox(1)')).total,2);
  for(let n=200;n<260;n++)await db.query("insert into public.lk_messages(conversation_id,author_id,author_kind,body,client_id,created_at) values($1,$1,'customer','History',$2,now()-interval '1 hour')",[buyer,id(n)]);
  const recent=await rpc(buyer,read,[null,null]);assert.equal(recent.messages.length,50);assert.equal(recent.hasOlder,true);
  const earlier=await rpc(buyer,read,[null,recent.messages[0].id]);assert.equal(earlier.messages.length,12);assert.equal(earlier.hasOlder,false);
  for(let n=300;n<311;n++)await rpc(buyer,send,['Message',id(n),null]);await denied(buyer,send,['Too many',id(312),null]);
  await denied(buyer,send,[' ',id(313),null]);await denied(admin,send,['x'.repeat(2001),id(314),buyer]);
  for(const table of ['lk_messages','lk_account_audit'])await assert.rejects(as(worker,'select * from public.'+table));
  await db.exec('set role anon');try{await assert.rejects(db.query("select public.lk_directory(1,'all','')"));await assert.rejects(db.query('select public.lk_chat_messages(null,null)'));assert.equal((await db.query('select public.lk_community_status() as s')).rows[0].s.version,1);}finally{await db.exec('reset role');}
  console.log('PASS: repeatable migration, full paginated staff directory, private fields, Admin edits/grants/revocation and audit, self-protection, private customer/Admin chat, retry deduplication, history pagination, rate limits, and anonymous/Worker denials.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
