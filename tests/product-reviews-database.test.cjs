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
  await db.exec(fs.readFileSync('supabase/product-reviews.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/product-reviews.sql','utf8'));
  const list=(who,sort='newest',page=1)=>rpc(who,'public.lk_product_review_list($1,$2,$3)',[p.id,sort,page]);
  const write=(who,operation,{id=null,rating=5,title='Great product',body='My actual experience',updatedAt=null,productId=p.id}={})=>rpc(who,'public.lk_product_review_write($1,$2,$3,$4,$5,$6,$7)',[operation,productId,id,rating,title,body,updatedAt]);
  const order=async(who,key,items,status='delivered',payment='paid',sellerId=seller)=>db.query("insert into public.lk_orders(id,customer_id,seller_id,customer_name,seller_name,items,total_cents,status,payment_status) values($1,$2,$3,'Buyer','Seller',$4,2500,$5,$6)",[key,who,sellerId,JSON.stringify(items),status,payment]);
  assert.equal((await list(buyer)).summary.total,0);assert.equal((await list(buyer)).summary.average,0);
  assert.equal((await list(buyer)).canReview,false);await assert.rejects(write(buyer,'create'),/paid purchase/);
  await order(buyer,'unpaid',[{productId:p.id,quantity:1}],'delivered','unpaid');
  await order(buyer,'cancelled',[{productId:p.id,quantity:1}],'cancelled');
  await order(buyer,'wrong-product',[{productId:'missing',quantity:1}]);
  await order(buyer,'wrong-seller',[{productId:p.id,quantity:1}],'delivered','paid',owner);
  await order(buyer,'invalid-quantity',[{productId:p.id,quantity:0}]);
  assert.equal((await list(buyer)).canReview,false,'Invalid orders cannot verify a purchase');
  await order(buyer,'paid',[{productId:p.id,quantity:1}]);
  assert.equal((await list(buyer)).canReview,true);
  for(const invalid of [{rating:0},{rating:6},{rating:null},{title:' '},{title:'\t\n'},{title:'x'.repeat(101)},{body:' '},{body:'\t\n'},{body:'x'.repeat(3001)}])await assert.rejects(write(buyer,'create',invalid));
  let review=await write(buyer,'create');assert.equal(review.verifiedPurchase,true);assert.equal(review.isMine,true);
  await assert.rejects(write(buyer,'create'),/already reviewed/);
  let read=await list(other);assert.equal(read.summary.average,5);assert.equal(read.summary.distribution['5'],1);assert.equal(read.reviews[0].isMine,false);assert.equal(read.mine,null);assert(!JSON.stringify(read).includes(buyer),'Do not expose customer auth IDs');
  await assert.rejects(write(other,'update',{...review,rating:1}),/own review/);
  await assert.rejects(write(other,'delete',review),/own review/);
  await assert.rejects(write(owner,'delete',review),/own review/);
  for(const who of [seller,worker])await assert.rejects(list(who));
  await order(other,'other-paid',[{id:p.id,quantity:1}]);
  let otherReview=await write(other,'create',{rating:1,title:'Not for me'});
  read=await list(buyer);assert.equal(read.summary.total,2);assert.equal(read.summary.average,3);
  assert.equal((await list(buyer,'highest')).reviews[0].rating,5);assert.equal((await list(buyer,'lowest')).reviews[0].rating,1);
  assert.equal((await list(buyer,'oldest')).reviews[0].id,review.id);assert.equal((await list(buyer,'newest')).reviews[0].id,otherReview.id);
  const previous=review;review=await write(buyer,'update',{...review,rating:4,title:'Updated title'});
  assert.equal(review.createdAt,previous.createdAt);assert.notEqual(review.updatedAt,previous.updatedAt);
  assert.equal((await list(buyer)).summary.average,2.5);
  await assert.rejects(write(buyer,'update',previous),/another tab/);
  await assert.rejects(write(buyer,'delete',previous),/another tab/);
  await db.exec(fs.readFileSync('supabase/product-reviews.sql','utf8'));
  assert.equal((await list(buyer)).mine.title,'Updated title','Rerunning setup preserves stored reviews');
  await write(other,'delete',otherReview);assert.equal((await list(buyer)).summary.average,4);
  await db.query('update public.lk_profiles set account_active=false where auth_id=$1',[buyer]);
  await assert.rejects(list(buyer));await assert.rejects(write(buyer,'delete',review));
  await db.query('update public.lk_profiles set account_active=true where auth_id=$1',[buyer]);
  await assert.rejects(as(buyer,'select * from public.lk_product_reviews'));
  await db.exec('grant select,insert,update,delete on public.lk_product_reviews to authenticated');
  assert.equal((await as(buyer,'select * from public.lk_product_reviews')).rows.length,0,'RLS defaults to deny even if table privileges are granted accidentally');
  assert.equal((await as(buyer,'delete from public.lk_product_reviews')).affectedRows,0);
  await db.exec('revoke all on public.lk_product_reviews from authenticated');
  await db.exec('set role anon');await assert.rejects(db.query('select public.lk_product_review_list($1)',[p.id]));await assert.rejects(db.query("select public.lk_product_review_write('create',$1)",[p.id]));await db.exec('reset role');
  await assert.rejects(list(buyer,'bad'));await assert.rejects(list(buyer,'newest',0));
  for(let n=10;n<21;n++){await account(n,'customer','pagination'+n);await order(id(n),'page'+n,[{product_id:p.id,quantity:1}]);await write(id(n),'create',{rating:(n%5)+1});}
  const first=await list(buyer),second=await list(buyer,'newest',2);assert.equal(first.reviews.length,10);assert.equal(second.reviews.length,2);assert.equal(new Set([...first.reviews,...second.reviews].map(r=>r.id)).size,12);
  assert.equal(Object.values(first.summary.distribution).reduce((a,b)=>a+b,0),12);
  await write(buyer,'delete',review);assert.equal((await list(buyer)).mine,null);
  console.log('PASS: persistent reviews, verified orders, validation, duplicate prevention, edit/delete ownership, stale-write protection, rating aggregates, sorting, pagination, RLS and role/anonymous denials.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
