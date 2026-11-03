/* Real PostgreSQL execution in an isolated in-memory PGlite database. No live records. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.LK_PGLITE_MODULE||'../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const ids={admin:'11111111-1111-4111-8111-111111111111',oldSeller:'22222222-2222-4222-8222-222222222222',buyer:'33333333-3333-4333-8333-333333333333',seller:'44444444-4444-4444-8444-444444444444',worker:'55555555-5555-4555-8555-555555555555',other:'66666666-6666-4666-8666-666666666666',forged:'77777777-7777-4777-8777-777777777777'};
 async function register(id,role,username,managed=false,metadata={}){
  return db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3::jsonb,$4::jsonb)',[id,username+'@'+role+'.lk-store.invalid',JSON.stringify({role,username,name:username,contact_email:'',...metadata}),JSON.stringify(managed?{lk_managed:true}:{})]);
 }
 async function asUser(id,sql,args=[]){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
  try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 async function denied(id,sql,args=[]){await assert.rejects(asUser(id,sql,args));}
 try{
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
  await register(ids.admin,'customer','scorpion');await register(ids.oldSeller,'seller','existing_seller');
  await db.exec(fs.readFileSync('supabase/admin-access.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/worker-verification.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/worker-verification.sql','utf8'));
  assert.equal((await db.query('select verification_status from public.lk_profiles where auth_id=$1',[ids.oldSeller])).rows[0].verification_status,'approved','Existing sellers remain active');
  await register(ids.buyer,'customer','buyer');
  await register(ids.seller,'seller','seller_one',false,{verification_status:'approved',roleOverride:'worker',isAdmin:true});
  await register(ids.other,'seller','seller_two',true);
  await assert.rejects(register(ids.forged,'worker','forged_worker',false,{lk_managed:true,isAdmin:true}),/Only an administrator/);
  await register(ids.worker,'worker','review_worker',true);
  assert.equal((await db.query('select verification_status from public.lk_profiles where auth_id=$1',[ids.seller])).rows[0].verification_status,'pending');
  assert.equal((await db.query('select verification_status from public.lk_profiles where auth_id=$1',[ids.other])).rows[0].verification_status,'pending','Admin-created sellers also need explicit approval');
  const product={name:'Isolated test product',summary:'Test',description:'Test',category:'Tech',price:'12.00',stock:'3',status:'active',sku:'test-1',image:'assets/products/placeholder.svg',color:'#ffffff'};
  const saved=(await asUser(ids.oldSeller,'select public.lk_save_product($1::jsonb,null) as item',[JSON.stringify(product)])).rows[0].item;
  for(const table of ['lk_shops','lk_products','lk_drafts','lk_carts'])assert.equal((await asUser(ids.seller,'select * from public.'+table)).rows.length,0,table+' is hidden from pending sellers');
  assert.equal((await asUser(ids.seller,'select * from public.lk_profiles')).rows.length,1,'Pending sellers can read only their own approval status');
  await denied(ids.seller,'select public.lk_update_shop($1::jsonb)',['{"name":"Bypass"}']);
  await denied(ids.seller,'select public.lk_save_product($1::jsonb,null)',[JSON.stringify(product)]);
  await denied(ids.seller,"select public.lk_save_draft('new','{}'::jsonb)");
  await denied(ids.seller,"update public.lk_profiles set verification_status='approved'");
  for(const id of [ids.buyer,ids.seller,ids.oldSeller]){
   await denied(id,'select public.lk_seller_reviews(1,\'\')');await denied(id,'select public.lk_approve_seller($1)',[ids.seller]);
  }
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data||'{\"role\":\"worker\",\"verification_status\":\"approved\",\"isAdmin\":true}'::jsonb where id=$1",[ids.seller]);
  await denied(ids.seller,'select public.lk_approve_seller($1)',[ids.seller]);
  assert.equal((await asUser(ids.seller,'select public.lk_staff_status() as status')).rows[0].status.isWorker,false);
  assert.equal((await asUser(ids.worker,'select public.lk_staff_status() as status')).rows[0].status.isWorker,true);
  assert.equal((await asUser(ids.worker,'select public.lk_is_admin() as value')).rows[0].value,false);
  assert.equal((await asUser(ids.worker,'select * from public.lk_profiles')).rows.length,1,'Worker cannot list other accounts directly');
  assert.equal((await asUser(ids.worker,'select * from public.lk_products')).rows.length,0);
  await denied(ids.worker,'select * from public.lk_admins');
  await denied(ids.worker,'delete from public.lk_profiles where auth_id=$1',[ids.buyer]);
  await denied(ids.worker,"insert into public.lk_profiles(auth_id,id,role,username,name) values($1,'forged','worker','forged','forged')",[ids.forged]);
  const queue=(await asUser(ids.worker,"select public.lk_seller_reviews(1,'') as result")).rows[0].result;
  assert.equal(queue.total,2);assert(queue.users.every(person=>[ids.seller,ids.other].includes(person.auth_id)));
  assert.equal((await asUser(ids.worker,"select public.lk_seller_reviews(1,'seller_one') as result")).rows[0].result.total,1);
  await asUser(ids.worker,'select public.lk_approve_seller($1)',[ids.seller]);
  const approved=(await db.query('select * from public.lk_profiles where auth_id=$1',[ids.seller])).rows[0];assert.equal(approved.verification_status,'approved');assert.equal(approved.verified_by,ids.worker);assert(approved.verified_at);
  await assert.rejects(asUser(ids.worker,'select public.lk_approve_seller($1)',[ids.seller]),/no longer awaiting/);
  await denied(ids.worker,'select public.lk_approve_seller($1)',[ids.buyer]);
  assert((await asUser(ids.seller,'select * from public.lk_products')).rows.length>0,'Approval unlocks store reads using the existing session');
  await asUser(ids.seller,'select public.lk_save_product($1::jsonb,null)',[JSON.stringify({...product,sku:'own'})]);
  await denied(ids.seller,'select public.lk_save_product($1::jsonb,$2)',[JSON.stringify(product),saved.id]);
  await asUser(ids.admin,'select public.lk_approve_seller($1)',[ids.other]);
  assert.equal((await asUser(ids.worker,"select public.lk_seller_reviews(1,'') as result")).rows[0].result.total,0);
  await db.exec('set role anon');
  try{assert.equal((await db.query('select public.lk_registration_status() as status')).rows[0].status.version,1);await assert.rejects(db.query("select public.lk_seller_reviews(1,'')"));await assert.rejects(db.query('select * from public.lk_profiles'));}finally{await db.exec('reset role');}
  await db.query('delete from auth.users where id=$1',[ids.worker]);
  await denied(ids.worker,"select public.lk_seller_reviews(1,'')");
  await db.exec(fs.readFileSync('supabase/verify-access.sql','utf8'));
  console.log('PASS: real PostgreSQL migration and rerun, admin-only Worker creation, public buyer/seller registration, pending-seller RLS and RPC denials, metadata spoof rejection, restricted Worker queue, audited Worker/admin approval, unchanged seller ownership, anonymous denials, and deleted Worker revocation.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
