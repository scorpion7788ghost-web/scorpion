/* Actual PostgreSQL permission tests; all accounts live only in this in-memory DB. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.LK_PGLITE_MODULE||'../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(1),admin=id(2),buyer=id(3),worker=id(4),seller=id(5),workerAdmin=id(6),sellerAdmin=id(7);
 async function account(n,role,name){await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id(n),name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name,contact_email:''}),JSON.stringify({lk_managed:true})]);}
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','',false)");}}
 async function rpc(who,sql,args=[]){return (await as(who,'select '+sql+' as result',args)).rows[0].result;}
 const promote=(who,target,name,grant)=>rpc(who,'public.lk_admin_update_account($1,$2,$3,$4)',[target,name,'',grant]);
 const item={name:'Permission check',summary:'Test only',description:'Isolated database item',price:'15.00',stock:'3',category:'Tech',status:'active',image:'assets/products/placeholder.svg'};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text default 'hash',last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await account(1,'customer','scorpion');
  for(const file of ['admin-access.sql','worker-verification.sql','community-tools.sql','owner-access.sql','product-brands.sql'])await db.exec(fs.readFileSync('supabase/'+file,'utf8'));
  for(const [n,role,name] of [[2,'customer','admin'],[3,'customer','buyer'],[4,'worker','worker'],[5,'seller','seller'],[6,'worker','staff_admin'],[7,'seller','shop_admin']])await account(n,role,name);
  await rpc(owner,'public.lk_approve_seller($1)',[sellerAdmin]);
  await promote(owner,admin,'Admin',true);await promote(owner,workerAdmin,'Staff Admin',true);await promote(owner,sellerAdmin,'Shop Admin',true);
  const originalOwner=(await db.query('select to_jsonb(p) as p from public.lk_profiles p where auth_id=$1',[owner])).rows[0].p;
  const migration=fs.readFileSync('supabase/admin-portals.sql','utf8');await db.exec(migration);await db.exec(migration);
  let ownerProduct;
  for(const who of [owner,admin,workerAdmin,sellerAdmin]){
   assert.equal((await rpc(who,'public.lk_access_status()')).portalAccessVersion,1);
   const shop=await rpc(who,'public.lk_open_seller_shop()');assert(shop.id);
   assert.deepEqual(await rpc(who,'public.lk_open_seller_shop()'),shop,'Opening twice preserves store details');
   const product=await rpc(who,'public.lk_save_product($1::jsonb,null)',[JSON.stringify({...item,storeId:shop.id})]);
   assert.equal(product.sellerId,shop.id);if(who===owner)ownerProduct=product;
   await rpc(who,'public.lk_save_draft($1,$2::jsonb)',['new',JSON.stringify({name:'Draft'})]);
   assert.equal((await as(who,'select * from public.lk_drafts')).rows.length,1);
   const cart=await rpc(who,'public.lk_save_cart($1::jsonb)',[JSON.stringify({[product.id]:1})]);assert.equal(cart[product.id],1);
   await assert.rejects(rpc(who,'public.lk_save_product($1::jsonb,null)',[JSON.stringify({...item,storeId:'other_store'})]));
  }
  assert.equal((await as(buyer,'select * from public.lk_products')).rows.length,4,'Buyers can see active Admin products');
  for(const who of [buyer,worker,seller]){
   await assert.rejects(rpc(who,'public.lk_open_seller_shop()'));
   await assert.rejects(promote(who,buyer,'Buyer',true));
  }
  assert.equal((await as(seller,'select * from public.lk_products')).rows.length,0,'Pending sellers remain blocked');
  for(const who of [admin,workerAdmin,sellerAdmin,buyer]){
   await assert.rejects(rpc(who,'public.lk_product_status($1,$2)',[ownerProduct.id,'archived']),'Nobody can modify another store inventory');
   await assert.rejects(promote(who,buyer,'Buyer',true),'Only Owner can grant Admin');
   await assert.rejects(promote(who,owner,'Changed',false),'Owner remains immutable');
  }
  await rpc(owner,'public.lk_product_status($1,$2)',[ownerProduct.id,'draft']);
  assert.equal((await as(admin,'select * from public.lk_products where id=$1',[ownerProduct.id])).rows.length,0,'Admins cannot read another store draft');
  await promote(owner,admin,'Former Admin',false);
  await assert.rejects(rpc(admin,'public.lk_open_seller_shop()'),'Revocation removes Seller access immediately');
  await assert.rejects(rpc(admin,'public.lk_save_product($1::jsonb,null)',[JSON.stringify(item)]));
  await promote(owner,workerAdmin,'Former Staff Admin',false);
  assert.equal(await rpc(workerAdmin,'public.lk_has_store_access()'),false);
  await assert.rejects(rpc(workerAdmin,'public.lk_save_cart($1::jsonb)',['{}']));
  await rpc(owner,'public.lk_approve_seller($1)',[seller]);await rpc(seller,'public.lk_open_seller_shop()');
  await rpc(seller,'public.lk_save_product($1::jsonb,null)',[JSON.stringify(item)]);
  await assert.rejects(rpc(seller,'public.lk_save_cart($1::jsonb)',['{}']),'Ordinary Seller has no new Buyer privilege');
  assert.deepEqual((await db.query('select to_jsonb(p) as p from public.lk_profiles p where auth_id=$1',[owner])).rows[0].p,originalOwner,'Owner identity is unchanged');
  await assert.rejects(rpc(owner,"public.lk_update_account('{\"name\":\"Changed\",\"email\":\"\"}')"));
  await db.exec('set role anon');await assert.rejects(db.query('select public.lk_open_seller_shop()'));await db.exec('reset role');
  const permissionsBefore=(await db.query("select pg_get_functiondef('public.lk_catalog_owner_is_approved(uuid)'::regprocedure) as definition")).rows[0].definition;
  const moreProducts=fs.readFileSync('supabase/owner-more-products.sql','utf8');await db.exec(moreProducts);
  const samples=(await db.query("select * from public.lk_products where data->>'sampleCollection'='owner-tech-v2'")).rows;
  assert.equal(samples.length,3);assert(samples.every(p=>p.owner_id===owner&&p.data.image.startsWith('data:image/jpeg;base64,')&&p.data.isNew));
  await db.query("update public.lk_products set data=data||'{\"price\":123.45,\"priceCents\":12345,\"stock\":2}'::jsonb where id=$1",[samples[0].id]);
  await db.exec(moreProducts);
  assert.equal((await db.query("select count(*)::int as n from public.lk_products where data->>'sampleCollection'='owner-tech-v2'")).rows[0].n,3,'Repeated imports never duplicate listings');
  assert.equal((await db.query('select data from public.lk_products where id=$1',[samples[0].id])).rows[0].data.price,123.45,'Import preserves edited prices and inventory');
  assert.equal((await db.query("select pg_get_functiondef('public.lk_catalog_owner_is_approved(uuid)'::regprocedure) as definition")).rows[0].definition,permissionsBefore,'Sample import never replaces Admin catalog permissions');
  assert.deepEqual((await db.query('select to_jsonb(p) as p from public.lk_profiles p where auth_id=$1',[owner])).rows[0].p,originalOwner);
  assert.equal((await as(buyer,"select * from public.lk_products where data->>'sampleCollection'='owner-tech-v2'")).rows.length,3);
  console.log('PASS: Owner/Admin access and isolation, exclusive Owner promotion, revocation, Owner protection, plus three image-backed Owner products with repeatable imports preserving permissions and edited products.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
