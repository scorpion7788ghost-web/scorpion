/* Executes real PostgreSQL in isolation. Never writes to the hosted database. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(1),admin=id(2),buyer=id(3),worker=id(4),seller=id(5);
 async function account(n,role,name){await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id(n),name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name}),JSON.stringify({lk_managed:true})]);}
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','',false)");}}
 const rpc=async(who,sql,args=[])=> (await as(who,'select '+sql+' as result',args)).rows[0].result;
 const read=(who,section,filters={})=>rpc(who,'public.lk_admin_console($1,$2)',[section,JSON.stringify(filters)]);
 const command=(who,action,input)=>rpc(who,'public.lk_admin_command($1,$2)',[action,JSON.stringify(input)]);
 const item={name:'Isolated test item',summary:'Test only',description:'Not live data',price:'12.00',stock:'5',category:'Tech',status:'active',image:'assets/products/placeholder.svg'};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await account(1,'customer','scorpion');
  for(const file of ['admin-access.sql','worker-verification.sql','community-tools.sql','owner-access.sql','admin-portals.sql','admin-console.sql'])await db.exec(fs.readFileSync('supabase/'+file,'utf8'));
  await db.exec(fs.readFileSync('supabase/admin-console.sql','utf8'));
  for(const [n,r,name] of [[2,'customer','admin'],[3,'customer','buyer'],[4,'worker','worker'],[5,'seller','seller']])await account(n,r,name);
  await rpc(owner,'public.lk_admin_update_account($1,$2,$3,true)',[admin,'Admin','']);
  for(const who of [buyer,worker,seller]){
   for(const section of ['dashboard','accounts','verifications','products','orders','analytics','notifications','support','logs','settings','seller-detail'])await assert.rejects(read(who,section));
   for(const action of ['account-status','seller-approve','seller-reject','product-edit','order-status','announcement','ticket-status','category','settings','preferences'])await assert.rejects(command(who,action,{}));
  }
  assert.equal((await read(admin,'dashboard')).metrics.users,5);
  assert.equal((await read(admin,'orders')).total,0);
  await assert.rejects(read(admin,'accounts',{page:0}));await assert.rejects(read(admin,'orders',{from:'2026-10-02',to:'2026-10-01'}));
  assert.equal((await read(admin,'accounts',{search:'buy',sort:'name',direction:'asc'})).rows[0].username,'buyer');
  for(const who of [owner,admin])await assert.rejects(command(who,'account-status',{id:owner,active:false}));
  await assert.rejects(command(admin,'account-status',{id:admin,active:false}));
  await command(admin,'account-status',{id:buyer,active:false});
  assert.equal(await rpc(buyer,'public.lk_has_store_access()'),false);
  await assert.rejects(rpc(buyer,'public.lk_chat_send($1,$2,null)',['No',id(99)]));
  await assert.rejects(rpc(buyer,'public.lk_save_cart($1)',['{}']));
  await command(admin,'account-status',{id:buyer,active:true});
  await command(admin,'seller-reject',{id:seller,reason:'Missing business information'});
  assert.equal((await read(admin,'verifications',{status:'rejected'})).total,1);
  assert.equal((await read(admin,'dashboard')).metrics.pending,0);
  await assert.rejects(rpc(seller,'public.lk_open_seller_shop()'));
  await command(admin,'seller-approve',{id:seller});
  assert.equal((await read(admin,'seller-detail',{id:seller})).history.length,2);
  let p=await rpc(seller,'public.lk_save_product($1,null)',[JSON.stringify(item)]);
  await command(admin,'product-edit',{...item,id:p.id,price:'19.50',brand:'Updated'});
  assert.equal((await read(admin,'product-detail',{id:p.id})).data.price,19.5);
  await assert.rejects(command(admin,'product-edit',{...item,id:p.id,price:'-1'}));
  await command(admin,'product-reject',{id:p.id,reason:'Review needed'});
  assert.equal((await as(buyer,'select * from public.lk_products')).rows.length,0);
  await assert.rejects(rpc(buyer,'public.lk_save_cart($1)',[JSON.stringify({[p.id]:1})]));
  await rpc(seller,'public.lk_product_status($1,$2)',[p.id,'active']);
  assert.equal((await as(buyer,'select * from public.lk_products')).rows.length,0,'Seller cannot bypass moderation');
  await command(admin,'product-approve',{id:p.id});
  assert.equal((await as(buyer,'select * from public.lk_products')).rows.length,1);
  await command(admin,'category',{name:'Computers',active:true});
  assert((await rpc(seller,'public.lk_console_categories()')).includes('Computers'));
  await rpc(seller,'public.lk_save_product($1,null)',[JSON.stringify({...item,category:'Computers'})]);
  await command(admin,'category',{name:'Computers',active:false});await assert.rejects(rpc(seller,'public.lk_save_product($1,null)',[JSON.stringify({...item,category:'Computers'})]));
  await assert.rejects(command(admin,'settings',{store_name:'Changed',support_email:'',moderation_required:true}));
  await command(owner,'settings',{store_name:'LK Tech Store',support_email:'',moderation_required:true});
  p=await rpc(seller,'public.lk_save_product($1,null)',[JSON.stringify(item)]);
  assert.equal((await read(admin,'product-detail',{id:p.id})).moderation,'pending');
  const buyerRow=(await read(admin,'accounts',{search:'buyer'})).rows[0];
  const notice={requestId:id(80),title:'Private announcement',body:'Only for buyer',audience:'individual',recipient:buyerRow.id};
  await command(admin,'announcement',notice);await command(admin,'announcement',notice);
  assert.equal((await read(admin,'notifications')).total,1);
  assert.equal((await rpc(buyer,'public.lk_notifications()')).length,1);
  assert.equal((await rpc(seller,'public.lk_notifications()')).length,0);
  await rpc(buyer,'public.lk_chat_send($1,$2,null)',['Support question',id(81)]);
  assert.equal((await read(admin,'support',{status:'open'})).total,1);
  await command(admin,'ticket-status',{id:buyer,status:'resolved'});
  await rpc(buyer,'public.lk_chat_send($1,$2,null)',['Follow up',id(82)]);
  assert.equal((await read(admin,'support')).rows[0].status,'open');
  await db.query('insert into public.lk_orders(id,customer_id,seller_id,customer_name,seller_name,items,total_cents) values($1,$2,$3,$4,$5,$6,$7)',['TEST-ORDER',buyer,seller,'Buyer','Seller','[]',1950]);
  await command(admin,'order-status',{id:'TEST-ORDER',expected:'processing',status:'shipped',tracking:'TRACK-123'});
  await assert.rejects(command(admin,'order-status',{id:'TEST-ORDER',expected:'processing',status:'cancelled',reason:'Stale request'}));
  await command(admin,'order-status',{id:'TEST-ORDER',expected:'shipped',status:'delivered',tracking:'TRACK-123'});
  await db.exec("update public.lk_orders set payment_status='paid'");
  await assert.rejects(command(admin,'order-status',{id:'TEST-ORDER',expected:'delivered',status:'cancelled',reason:'Cannot refund here'}));
  await db.query("insert into public.lk_orders(id,customer_name,seller_name,items,total_cents,payment_status) values('PAID','Buyer','Seller','[]',2000,'paid'),('UNPAID','Buyer','Seller','[]',500,'unpaid')");
  await assert.rejects(command(admin,'order-status',{id:'PAID',expected:'processing',status:'cancelled',reason:'Paid requires provider'}));
  await command(admin,'order-status',{id:'UNPAID',expected:'processing',status:'cancelled',reason:'Customer requested cancellation'});
  await db.exec("delete from public.lk_orders where id in ('PAID','UNPAID')");
  const report=await read(admin,'analytics');assert.equal(report.metrics.sales,1950);assert.equal(report.metrics.periodOrders,1);assert.equal(report.series.reduce((sum,d)=>sum+d.sales,0),1950);
  await db.query('update auth.users set last_sign_in_at=now() where id=$1',[admin]);
  assert.equal((await read(owner,'logs',{status:'admin.login'})).total,1);
  for(const table of ['lk_orders','lk_admin_events','lk_announcements','lk_seller_documents','lk_console_settings'])await assert.rejects(as(buyer,'select * from public.'+table));
  await command(owner,'account-status',{id:admin,active:false});assert.equal(await rpc(admin,'public.lk_is_admin()'),false);await assert.rejects(read(admin,'dashboard'));
  await assert.rejects(rpc(owner,'public.lk_update_account($1)',[JSON.stringify({name:'Changed',email:''})]),'Owner remains immutable');
  await assert.rejects(rpc(worker,'public.lk_admin_update_account($1,$2,$3,true)',[buyer,'Buyer','']),'Workers cannot promote admins');
  await command(owner,'account-status',{id:admin,active:true});await assert.rejects(rpc(admin,'public.lk_admin_update_account($1,$2,$3,true)',[buyer,'Buyer','']),'Regular Admin cannot promote');
  for(let n=10;n<37;n++)await account(n,'customer','user_'+n);
  const page2=await read(owner,'accounts',{page:2,sort:'name',direction:'asc',search:'user_'});assert.equal(page2.rows.length,2);assert.equal(page2.total,27);
  await db.exec('set role anon');try{await assert.rejects(db.query("select public.lk_admin_console('dashboard','{}')"));}finally{await db.exec('reset role');}
  console.log('PASS: repeatable migration, all admin sections, role denials, immutable Owner, suspension, seller history, product edits/moderation, categories, orders, actual revenue, notification privacy/retries, ticket reopening, audit and login history.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
