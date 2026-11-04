const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.LK_PGLITE_MODULE||'../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const seller='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',buyer='20000000-0000-4000-8000-000000000003';
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
 async function save(who,data,id=null){return (await as(who,'select public.lk_save_product($1::jsonb,$2) as p',[JSON.stringify(data),id])).rows[0].p;}
 const input={name:'Headset',summary:'A headset',description:'Seller product',category:'Tech',price:'49.99',stock:'5',status:'active',sku:'HEADSET'};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',['20000000-0000-4000-8000-000000000004','scorpion@customer.lk-store.invalid',JSON.stringify({role:'customer',username:'scorpion',name:'Scorpion'})]);
  for(const file of ['admin-access.sql','worker-verification.sql'])await db.exec(fs.readFileSync('supabase/'+file,'utf8'));
  for(const [id,role,name] of [[seller,'seller','sellerone'],[other,'seller','sellertwo'],[buyer,'customer','buyerone']]){
   await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id,name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name}),JSON.stringify({lk_managed:true})]);
  }
  await db.query("update public.lk_profiles set verification_status='approved' where auth_id=$1",[seller]);
  const old=await save(seller,input);
  const upgrade=fs.readFileSync('supabase/product-brands.sql','utf8');await db.exec(upgrade);await db.exec(upgrade);
  assert.deepEqual((await db.query('select data from public.lk_products where id=$1',[old.id])).rows[0].data,old,'Upgrade leaves existing products unchanged');
  const branded=await save(seller,{...input,brand:'  Acme  '},old.id);assert.equal(branded.brand,'Acme');
  const retained=await save(seller,input,old.id);assert.equal(retained.brand,'Acme','Older clients preserve brand');
  assert.equal((await save(seller,{...input,brand:''},old.id)).brand,'','Sellers can clear an incorrect brand');
  await assert.rejects(save(seller,{...input,brand:'x'.repeat(61)},old.id));
  await assert.rejects(save(other,{...input,brand:'Other'},old.id),'Pending seller rejected');
  await db.query("update public.lk_profiles set verification_status='approved' where auth_id=$1",[other]);
  await assert.rejects(save(other,{...input,brand:'Other'},old.id),'Other seller rejected');
  await assert.rejects(save(buyer,{...input,brand:'Other'},old.id),'Buyer cannot change brands');
  await as(seller,'select public.lk_save_draft($1,$2::jsonb)',['new',JSON.stringify({brand:'Draft Brand'})]);
  assert.equal((await as(seller,'select data from public.lk_drafts')).rows[0].data.brand,'Draft Brand');
  assert.equal((await as(buyer,'select public.lk_product_fields_status() as result')).rows[0].result.brand,true);
  await db.exec('set role anon');try{await assert.rejects(db.query('select public.lk_product_fields_status()'));}finally{await db.exec('reset role');}
  console.log('PASS: brand save/edit/clear, legacy compatibility, draft persistence, length validation, repeatable migration and seller ownership/approval.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
