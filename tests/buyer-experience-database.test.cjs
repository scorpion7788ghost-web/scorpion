const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.qa/pglite/package/dist/index.cjs');
(async()=>{
 const db=new PGlite();await db.waitReady;
 const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(1),buyer=id(2),other=id(3),seller=id(4),worker=id(5);
 async function account(n,role,name){await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id(n),name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name}),JSON.stringify({lk_managed:true})]);}
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
 const rpc=async(who,sql,args=[])=> (await as(who,'select '+sql+' as result',args)).rows[0].result;
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await account(1,'customer','scorpion');
  for(const name of ['admin-access','worker-verification','community-tools','owner-access','admin-portals','admin-console','buyer-experience','buyer-experience'])await db.exec(fs.readFileSync('supabase/'+name+'.sql','utf8'));
  await account(2,'customer','buyer');await account(3,'customer','other');await account(4,'seller','seller');await account(5,'worker','worker');
  await rpc(owner,'public.lk_approve_seller($1)',[seller]);
  const p=await rpc(seller,'public.lk_save_product($1,null)',[JSON.stringify({name:'Isolated item',summary:'Test only',description:'Test only',category:'Tech',price:'25.00',stock:'3',status:'active',image:'assets/products/placeholder.svg'})]);
  assert.deepEqual(await rpc(buyer,"public.lk_buyer_wishlist('add',$1)",[p.id]),[p.id]);
  assert.deepEqual(await rpc(other,'public.lk_buyer_wishlist()'),[]);
  assert.deepEqual(await rpc(buyer,"public.lk_buyer_wishlist('add',$1)",[p.id]),[p.id],'Duplicate save is idempotent');
  for(const who of [seller,worker])await assert.rejects(rpc(who,'public.lk_buyer_wishlist()'));
  await assert.rejects(as(buyer,'select * from public.lk_wishlist'));
  await assert.rejects(rpc(buyer,"public.lk_buyer_wishlist('add','missing')"));
  await db.query("insert into public.lk_orders(id,customer_id,seller_id,customer_name,seller_name,items,total_cents) values ('private-order',$1,$2,'Buyer','Seller','[]',2500)",[buyer,seller]);
  assert.equal((await rpc(buyer,'public.lk_my_orders()')).orders[0].id,'private-order');
  assert.equal((await rpc(other,'public.lk_my_orders()')).total,0);
  assert.equal((await rpc(owner,'public.lk_my_orders()')).total,0,'Owner Buyer view must not expose others orders');
  await assert.rejects(rpc(buyer,'public.lk_my_orders(0)'));
  await db.query('update public.lk_profiles set account_active=false where auth_id=$1',[buyer]);
  await assert.rejects(rpc(buyer,'public.lk_buyer_wishlist()'));await assert.rejects(rpc(buyer,'public.lk_my_orders()'));
  await db.query('update public.lk_profiles set account_active=true where auth_id=$1',[buyer]);
  assert.deepEqual(await rpc(buyer,"public.lk_buyer_wishlist('remove',$1)",[p.id]),[]);
  await db.exec('set role anon');await assert.rejects(db.exec('select public.lk_buyer_wishlist()'));await db.exec('reset role');
  console.log('PASS: rerunnable buyer migration, private cross-device wishlist, idempotent saves, own-order isolation including Owner, role/suspension/anonymous denials and no direct table access.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
