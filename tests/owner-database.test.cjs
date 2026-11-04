/* Real PostgreSQL regression tests in memory; no live account changes. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.LK_PGLITE_MODULE||'../.qa/pglite/package/dist/index.cjs');
async function main(){
 const db=new PGlite();await db.waitReady;
 const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(1),admin=id(2),buyer=id(3),worker=id(4),seller=id(5),peer=id(6);
 async function account(n,role,name){await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id(n),name+'@'+role+'.lk-store.invalid',JSON.stringify({role,username:name,name,contact_email:''}),JSON.stringify({lk_managed:true})]);}
 async function as(who,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','',false)");}}
 async function rpc(who,sql,args=[]){return (await as(who,'select '+sql+' as result',args)).rows[0].result;}
 const update='public.lk_admin_update_account($1,$2,$3,$4)';
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text default 'hash',last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await account(1,'customer','scorpion');
  for(const file of ['admin-access.sql','worker-verification.sql','community-tools.sql'])await db.exec(fs.readFileSync('supabase/'+file,'utf8'));
  await account(2,'customer','admin');await account(3,'customer','buyer');await account(4,'worker','scorpion');await account(5,'seller','seller');await account(6,'customer','peer');
  await rpc(owner,update,[admin,'Admin','',true]);await rpc(owner,update,[peer,'Peer Admin','',true]);
  const upgrade=fs.readFileSync('supabase/owner-access.sql','utf8');await db.exec(upgrade);await db.exec(upgrade);
  assert.equal(await rpc(owner,'public.lk_is_owner()'),true);assert.equal(await rpc(owner,'public.lk_is_admin()'),true);
  assert.equal(await rpc(worker,'public.lk_is_owner()'),false,'Same username in another portal is not Owner');
  const permissions=await rpc(admin,'public.lk_access_status()');assert.equal(permissions.isAdmin,true);assert.equal(permissions.isOwner,false);
  for(const who of [owner,admin,worker,buyer,seller]){
   await assert.rejects(rpc(who,update,[owner,'Altered','changed@example.test',false]));
   await assert.rejects(rpc(who,update,[owner,'Altered','changed@example.test',true]));
  }
  await assert.rejects(rpc(owner,"public.lk_update_account('{\"name\":\"Changed\",\"email\":\"\"}')"));
  for(const who of [admin,worker,buyer,seller])await assert.rejects(rpc(who,update,[buyer,'Buyer','',true]));
  await assert.rejects(rpc(admin,update,[peer,'Changed Admin','',true]));await assert.rejects(rpc(admin,update,[peer,'Demoted','',false]));
  await rpc(admin,update,[buyer,'Ordinary details','buyer@example.test',false]);
  await rpc(owner,update,[buyer,'New Admin','',true]);assert.equal(await rpc(buyer,'public.lk_is_admin()'),true);
  await rpc(owner,update,[buyer,'Buyer again','',false]);assert.equal(await rpc(buyer,'public.lk_is_admin()'),false);
  await rpc(owner,update,[peer,'Edited by Owner','updated@example.test',true]);
  const directory=await rpc(owner,"public.lk_directory(1,'admin','scorpion')");assert.equal(directory.users[0].isOwner,true);
  // Even privileged Auth-service paths cannot edit or cascade-delete the Owner.
  await assert.rejects(db.query('delete from auth.users where id=$1',[owner]));
  await assert.rejects(db.query('delete from public.lk_profiles where auth_id=$1',[owner]));
  await assert.rejects(db.query("update auth.users set encrypted_password='new-hash' where id=$1",[owner]));
  await assert.rejects(db.query("update auth.users set email='other@example.test' where id=$1",[owner]));
  await assert.rejects(db.query("update auth.users set raw_user_meta_data='{\"name\":\"Changed\"}' where id=$1",[owner]));
  await assert.rejects(db.query('delete from public.lk_admins where auth_id=$1',[owner]));
  await db.query('update auth.users set last_sign_in_at=now() where id=$1',[owner]);
  assert((await db.query('select last_sign_in_at from auth.users where id=$1',[owner])).rows[0].last_sign_in_at);
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data||'{\"isOwner\":true,\"role\":\"owner\"}'::jsonb where id=$1",[buyer]);assert.equal(await rpc(buyer,'public.lk_is_owner()'),false);
  await assert.rejects(as(admin,'insert into public.lk_admins(auth_id) values($1)',[buyer]));
  await assert.rejects(db.query('insert into public.lk_admins(auth_id) values($1)',[buyer]),/Only the Owner/);
  await assert.rejects(as(owner,'update lk_private.owner_account set auth_id=$1',[buyer]));
  await db.query('delete from auth.users where id=$1',[seller]);assert.equal((await db.query('select * from public.lk_profiles where auth_id=$1',[seller])).rows.length,0,'Non-Owner deletion still cascades');
  await db.exec('set role anon');try{await assert.rejects(db.query('select public.lk_access_status()'));assert.equal((await db.query('select public.lk_owner_status() as s')).rows[0].s.version,1);}finally{await db.exec('reset role');}
  console.log('PASS: pinned Owner, repeatable migration, exclusive Owner promotions/demotions, regular Admin scope, protected Owner profile/credentials/deletion/membership, spoof rejection, normal sign-in updates, and non-Owner deletion.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
