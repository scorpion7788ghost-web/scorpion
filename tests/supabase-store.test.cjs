/* Protocol tests use an isolated fake transport, never a live Supabase project. */
const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('assets/supabase-store.js','utf8');
function app({role='customer',config={},storage=new Map(),handler}={}){
 const calls=[];
 const context={document:{body:{dataset:{portal:role}}},window:{STORE_CONFIG:{provider:'supabase',supabaseUrl:'https://isolated-check.supabase.co',supabaseKey:'sb_publishable_test',...config}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},TextEncoder,AbortController,URLSearchParams,setTimeout,clearTimeout,atob,Date,TypeError,
  fetch:async(url,options)=>{calls.push({url,options});const {status=200,body={}}=(await handler?.(url,options))||{};return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)};}};
 vm.runInNewContext(source,context);
 return {cloud:context.window.StoreCloud,calls,storage};
}
async function main(){
 const missing=app({config:{supabaseUrl:''}});
 await assert.rejects(missing.cloud.request('/bootstrap'),/setup is incomplete/);assert.equal(missing.calls.length,0);
 const secret=app({config:{supabaseKey:'sb_secret_forbidden'}});
 await assert.rejects(secret.cloud.request('/bootstrap'),/never a Supabase secret/);assert.equal(secret.calls.length,0);
 const serviceKey='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 const legacySecret=app({config:{supabaseKey:serviceKey}});
 await assert.rejects(legacySecret.cloud.request('/bootstrap'),/never a service_role/);assert.equal(legacySecret.calls.length,0);
 const publicApp=app({handler:url=>({body:[]})});
 const empty=await publicApp.cloud.request('/bootstrap');assert.equal(empty.user,null);assert.equal(empty.products.length,0);assert.equal(publicApp.calls.length,0,'Anonymous bootstrap must not fetch store data');
 assert(publicApp.calls.every(c=>c.url.startsWith('https://isolated-check.supabase.co/')));
 const writes=[];const storage=new Map();
 function server(url,options){
  if(url.endsWith('/auth/v1/settings'))return {body:{mailer_autoconfirm:true,external:{email:true},disable_signup:false}};
  if(url.endsWith('/rpc/lk_registration_status'))return {body:{version:1,enabled:true}};
  if(url.endsWith('/rpc/lk_access_status'))return {body:{isAdmin:false,isOwner:false,portalAccessVersion:1}};
  if(url.endsWith('/rpc/lk_console_categories'))return {body:['Tech','Home','Accessories','Lifestyle']};
  if(url.includes('/auth/v1/signup'))return {body:{access_token:'seller-access',refresh_token:'seller-refresh',expires_in:3600}};
  if(url.includes('/auth/v1/token?grant_type=refresh_token'))return {body:{access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600}};
  if(url.includes('/auth/v1/token?grant_type=password'))return {body:{access_token:'verified-access',refresh_token:'verified-refresh',expires_in:3600}};
  if(url.endsWith('/auth/v1/user'))return {body:{id:'authenticated-id'}};
  if(url.includes('/rest/v1/lk_profiles'))return {body:[{id:'seller_owned',role:'seller',username:'real_seller',name:'Seller',email:'private@example.invalid',verification_status:'approved'}]};
  if(url.includes('/rest/v1/lk_shops'))return {body:[{id:'seller_owned',profile:{id:'seller_owned',name:'Own shop'}}]};
  if(url.includes('/rest/v1/lk_products'))return {body:[]};
  if(url.includes('/rest/v1/lk_drafts'))return {body:[]};
  if(url.includes('/rest/v1/rpc/')){writes.push({url,options});return {body:{id:'product_abc'}};}
  return {body:{}};
 }
 const seller=app({role:'seller',storage,handler:server});
 await assert.rejects(seller.cloud.request('/auth/register','POST',{}),/administrator/);
 await seller.cloud.request('/auth/login','POST',{role:'seller',username:'REAL_SELLER',password:'ValidPassword123!'});
 const login=JSON.parse(seller.calls.find(call=>call.url.includes('grant_type=password')).options.body);assert.equal(login.email,'real_seller@seller.lk-store.invalid');assert(!seller.calls.some(call=>call.url.endsWith('/signup')));
 assert(![...storage.values()].join('').includes('ValidPassword123!'));assert(![...storage.values()].join('').includes('private@example.invalid'));
 const state=await seller.cloud.request('/bootstrap');assert.equal(state.sellerStore.profile.id,'seller_owned');assert.equal(state.products.length,0);
 assert.equal(state.categories[0],'Tech');
 await seller.cloud.request('/seller/products/product_abc','PUT',{name:'Saved'});
 assert.equal(JSON.parse(writes[0].options.body).product_id,'product_abc');assert.equal(writes[0].options.headers.Authorization,'Bearer verified-access');
 await seller.cloud.request('/seller/draft?key=new','DELETE',{});assert.equal(JSON.parse(writes[1].options.body).input,null);
 const customer=app({role:'customer',storage,handler:server});assert.equal((await customer.cloud.request('/bootstrap')).user,null,'Customer portal must not inherit seller session');
 const fresh=app({role:'seller',storage,handler:server});assert.equal((await fresh.cloud.request('/bootstrap')).user.id,'seller_owned','Sign-in session persists across page loads');
 const brandReady=app({role:'seller',storage,handler:()=>({body:{brand:true,version:1}})});
 assert.equal((await brandReady.cloud.request('/catalog/fields')).brand,true);
 assert(brandReady.calls[0].url.endsWith('/rpc/lk_product_fields_status'));
 const brandMissing=app({role:'seller',storage,handler:()=>({status:404,body:{code:'PGRST202',message:'Function not found'}})});
 assert.equal((await brandMissing.cloud.request('/catalog/fields')).brand,false);
 const brandFailure=app({role:'seller',storage,handler:()=>({status:503,body:{message:'Storage unavailable'}})});
 await assert.rejects(brandFailure.cloud.request('/catalog/fields'),/Storage unavailable/);
 const tokenKey=[...storage.keys()].find(k=>k.endsWith(':seller'));const expired=JSON.parse(storage.get(tokenKey));expired.expires_at=0;storage.set(tokenKey,JSON.stringify(expired));
 const renewal=app({role:'seller',storage,handler:server});await renewal.cloud.request('/bootstrap');assert(renewal.calls.some(c=>c.url.includes('grant_type=refresh_token')));
 const refused=app({role:'seller',storage,handler:(url,options)=>url.includes('/rpc/')?{status:403,body:{message:'Ownership denied'}}:server(url,options)});
 await assert.rejects(refused.cloud.request('/seller/products/product_abc/status','PATCH',{status:'active'}),/Ownership denied/);
 const profileFailure=app({role:'seller',storage,handler:(url,options)=>url.includes('/rpc/lk_update_account')?{status:503,body:{message:'Profile temporarily unavailable'}}:server(url,options)});
 await assert.rejects(profileFailure.cloud.request('/me','PATCH',{name:'Updated',email:'',currentPassword:'ValidPassword123!',password:'ChangedPassword123!'}),/Your password changed, but your profile details could not be saved/);
 const failed=app({handler:()=>{throw new TypeError('network')}});await assert.rejects(failed.cloud.request('/auth/login','POST',{role:'customer',username:'user',password:'unused'}),/Cannot reach online storage/);
 const buyerStorage=new Map([['lk-auth-v2:https://isolated-check.supabase.co:customer',JSON.stringify({access_token:'buyer-access',refresh_token:'buyer-refresh',expires_at:Date.now()/1000+3600})]]);
 const consoleApp=app({storage:buyerStorage});await consoleApp.cloud.request('/admin/console','POST',{section:'products',filters:{page:2}});await consoleApp.cloud.request('/admin/command','POST',{action:'ticket-status',input:{id:'test',status:'resolved'}});await consoleApp.cloud.request('/notifications');
 assert.deepEqual(consoleApp.calls.map(c=>c.url.split('/').at(-1)),['lk_admin_console','lk_admin_command','lk_notifications']);assert(consoleApp.calls.every(c=>c.options.headers.Authorization==='Bearer buyer-access'));assert.equal(JSON.parse(consoleApp.calls[0].options.body).filters.page,2);
 const inactive=app({role:'seller',storage:new Map(storage),handler:(url,options)=>url.includes('/lk_profiles')?{body:[{account_active:false}]}:server(url,options)});await assert.rejects(inactive.cloud.request('/bootstrap'),/account is inactive/);
 const beforeUpgrade=app({role:'seller',storage:new Map(storage),handler:(url,options)=>url.endsWith('/rpc/lk_console_categories')?{status:404,body:{code:'PGRST202'}}:server(url,options)});assert.equal((await beforeUpgrade.cloud.request('/bootstrap')).sellerStore.profile.id,'seller_owned','Missing new categories migration must not break existing sellers');
 const adminPreflight=app({storage:buyerStorage,handler:()=>{throw new TypeError('Failed to fetch');}});
 await assert.rejects(adminPreflight.cloud.request('/admin/users'),error=>error.code==='ADMIN_SERVICE_UNAVAILABLE'&&error.message.includes('function endpoint')&&!error.message.includes('internet connection'),'A failed admin preflight must identify the admin service, not blame the internet connection');
 assert.equal(adminPreflight.calls[0].url,'https://isolated-check.supabase.co/functions/v1/store-admin','The default function remains compatible with existing deployments');
 const missingAdmin=app({storage:buyerStorage,handler:()=>({status:404,body:{code:'NOT_FOUND',message:'Requested function was not found'}})});
 await assert.rejects(missingAdmin.cloud.request('/admin/users'),error=>error.code==='ADMIN_SERVICE_UNAVAILABLE'&&error.message.includes('endpoint was not found'));
 const renamedAdmin=app({config:{supabaseAdminFunction:'custom-admin-endpoint'},storage:buyerStorage});
 await renamedAdmin.cloud.request('/admin/users?role=seller&page=2&search=shop');
 await renamedAdmin.cloud.request('/admin/users','POST',{role:'seller',username:'shop'});
 await renamedAdmin.cloud.request('/admin/users','DELETE',{authId:'account-id',username:'shop'});
 assert.equal(renamedAdmin.calls[0].url,'https://isolated-check.supabase.co/functions/v1/custom-admin-endpoint?role=seller&page=2&search=shop');
 assert.deepEqual(renamedAdmin.calls.map(call=>call.options.method),['GET','POST','DELETE']);
 assert(renamedAdmin.calls.every(call=>call.url.startsWith('https://isolated-check.supabase.co/functions/v1/custom-admin-endpoint')&&call.options.headers.Authorization==='Bearer buyer-access'));
 assert.equal(JSON.parse(renamedAdmin.calls[1].options.body).username,'shop');
 assert.equal(JSON.parse(renamedAdmin.calls[2].options.body).authId,'account-id');
 for(const slug of ['https://other-project.supabase.co/functions/v1/admin','../auth/v1/user','admin?redirect=1','admin/other','',42]){
  const invalidAdmin=app({config:{supabaseAdminFunction:slug},storage:buyerStorage});
  await assert.rejects(invalidAdmin.cloud.request('/admin/users'),/function slug/);
  assert.equal(invalidAdmin.calls.length,0,'An invalid endpoint must be rejected before sending a session');
 }
 const renamedFailure=app({config:{supabaseAdminFunction:'custom-admin-endpoint'},storage:buyerStorage,handler:()=>{throw new TypeError('Failed to fetch');}});
 await assert.rejects(renamedFailure.cloud.request('/admin/users?page=2'),error=>error.code==='ADMIN_SERVICE_UNAVAILABLE');
 const missingAccount=app({storage:buyerStorage,handler:()=>({status:404,body:{error:'That account no longer exists.'}})});
 await assert.rejects(missingAccount.cloud.request('/admin/users','DELETE',{authId:'missing'}),error=>error.status===404&&error.message==='That account no longer exists.'&&error.code!=='ADMIN_SERVICE_UNAVAILABLE','An account deleted elsewhere must not be reported as a missing deployment');
 const stockChanged=app({storage:buyerStorage,handler:(url,options)=>{
  if(url.includes('/lk_profiles'))return {body:[{id:'customer_owned',role:'customer',username:'buyer',name:'Buyer',email:''}]};
  if(url.includes('/lk_products'))return {body:[{data:{id:'product_live',stock:2}},{data:{id:'product_empty',stock:0}}]};
  if(url.includes('/lk_carts'))return {body:[{items:{product_live:8,product_empty:1,product_removed:3}}]};
  if(url.includes('/lk_shops'))return {body:[]};
  return server(url,options);
 }});
 const buyerState=await stockChanged.cloud.request('/bootstrap');assert.equal(buyerState.cart.product_live,2);assert.equal(Object.keys(buyerState.cart).length,1,'Stored carts follow current stock and active listings');
 const needsConfirm=app({handler:url=>url.endsWith('/rpc/lk_registration_status')?{body:{version:1,enabled:true}}:{body:{mailer_autoconfirm:false,external:{email:true}}}});
 await assert.rejects(needsConfirm.cloud.request('/auth/register','POST',{role:'customer',name:'Name',username:'new_buyer',password:'ValidPassword123!'}),/turn off Confirm email/);
 assert(!needsConfirm.calls.some(call=>call.url.endsWith('/signup')),'Incorrect Auth configuration must be rejected before creating records');
 const buyerSignup=app({handler:(url,options)=>url.includes('/lk_profiles')?{body:[{id:'buyer_new',role:'customer',username:'new_buyer',name:'Buyer',verification_status:'approved'}]}:server(url,options)});
 await buyerSignup.cloud.request('/auth/register','POST',{role:'customer',name:'Buyer',username:'new_buyer',password:'ValidPassword123!'});
 assert.equal(JSON.parse(buyerSignup.calls.find(call=>call.url.endsWith('/signup')).options.body).email,'new_buyer@customer.lk-store.invalid');
 const migrationMissing=app({handler:()=>({status:404,body:{code:'PGRST202'}})});
 await assert.rejects(migrationMissing.cloud.request('/auth/register','POST',{role:'customer',name:'Buyer',username:'new_buyer',password:'ValidPassword123!'}),/worker-verification.sql/);
 assert(!migrationMissing.calls.some(call=>call.url.endsWith('/signup')),'Do not submit accounts before the verification database rules exist');
 const pending=app({role:'seller',handler:(url,options)=>url.includes('/lk_profiles')?{body:[{id:'pending',role:'seller',username:'new_seller',name:'New seller',verification_status:'pending'}]}:server(url,options)});
 await pending.cloud.request('/auth/register','POST',{role:'seller',name:'New seller',username:'new_seller',password:'ValidPassword123!',verification_status:'approved',roleOverride:'worker'});
 const signup=JSON.parse(pending.calls.find(c=>c.url.endsWith('/signup')).options.body);
 assert.equal(signup.data.role,'seller');assert.equal(signup.data.verification_status,undefined);assert.equal(signup.app_metadata,undefined);
 const pendingState=await pending.cloud.request('/bootstrap');assert.equal(pendingState.user.verificationStatus,'pending');assert.equal(pendingState.products.length,0);assert.equal(pendingState.sellerStore,null);
 assert(!pending.calls.some(c=>/\/lk_(shops|products|drafts|carts)/.test(c.url)),'Pending seller bootstrap never fetches protected store data');
 assert.equal((await pending.cloud.request('/verification/status')).user.verificationStatus,'pending');
 const workerApp=app({role:'worker',handler:(url,options)=>url.includes('/lk_profiles')?{body:[{id:'worker_owned',role:'worker',username:'staff',name:'Staff',verification_status:'approved'}]}:server(url,options)});
 await assert.rejects(workerApp.cloud.request('/auth/register','POST',{role:'worker',name:'Staff'}),/Only an administrator/);assert.equal(workerApp.calls.length,0);
 await workerApp.cloud.request('/auth/login','POST',{role:'worker',username:'staff',password:'ValidPassword123!'});
 assert.equal(JSON.parse(workerApp.calls[0].options.body).email,'staff@worker.lk-store.invalid');
 assert.equal((await workerApp.cloud.request('/bootstrap')).products.length,0);assert(!workerApp.calls.some(c=>/\/lk_(shops|products|drafts|carts)/.test(c.url)));
 await workerApp.cloud.request('/staff/sellers?page=2&search=shop');assert.equal(JSON.parse(workerApp.calls.at(-1).options.body).page_number,2);
 await workerApp.cloud.request('/staff/approve-seller','POST',{authId:'seller-id'});assert.equal(JSON.parse(workerApp.calls.at(-1).options.body).target_auth_id,'seller-id');
 assert.equal((await app({storage:workerApp.storage,role:'customer'}).cloud.request('/bootstrap')).user,null,'Worker sessions do not grant customer access');
 assert.equal(app({config:{provider:'php'}}).cloud,undefined,'Local PHP path stays available');
 // Admin membership is always fetched from the backend, never from saved metadata.
 for(const nativeRole of ['customer','seller','worker']){
  const sharedStorage=new Map();let membership=true,version=1;
  const profile={id:nativeRole+'_admin',role:nativeRole,username:'staff_admin',name:'Admin',verification_status:'approved'};
  function staffServer(url,options){
   if(url.includes('grant_type=password'))return JSON.parse(options.body).email==='staff_admin@'+nativeRole+'.lk-store.invalid'
    ?{body:{access_token:'admin-token',refresh_token:'admin-refresh',expires_in:3600}}
    :{status:400,body:{error_code:'invalid_credentials'}};
   if(url.endsWith('/rpc/lk_access_status'))return {body:{isAdmin:membership,isOwner:nativeRole==='customer',portalAccessVersion:version}};
   if(url.includes('/lk_profiles'))return {body:[profile]};
   if(url.endsWith('/rpc/lk_open_seller_shop'))return {body:{id:profile.id,name:'Staff shop'}};
   if(url.includes('/lk_shops'))return {body:[{id:profile.id,profile:{id:profile.id,name:'Staff shop'}}]};
   if(url.includes('/lk_carts'))return {body:[{items:{}}]};
   return server(url,options);
  }
  const sellerLogin=app({role:'seller',storage:sharedStorage,handler:staffServer});
  const result=await sellerLogin.cloud.request('/auth/login','POST',{role:'seller',username:'staff_admin',password:'ExistingPassword123!'});
  assert.equal(result.user.role,nativeRole,'Portal switching never changes the account base role');assert.equal(result.user.isAdmin,true);
  assert.equal((await sellerLogin.cloud.request('/bootstrap')).sellerStore.profile.id,profile.id);
  assert.equal(sharedStorage.size,1);assert([...sharedStorage.keys()][0].endsWith(':staff'),'One shared admin session avoids duplicate refresh tokens');
  const buyerLogin=app({role:'customer',storage:sharedStorage,handler:staffServer});
  assert.equal((await buyerLogin.cloud.request('/bootstrap')).user.id,profile.id,'Buyer portal inherits verified admin identity');
  assert(!buyerLogin.calls.some(c=>c.url.includes('grant_type=password')),'Switching portal does not require another password');
  assert.equal((await buyerLogin.cloud.request('/admin/status')).isAdmin,true);
  version=0;await assert.rejects(sellerLogin.cloud.request('/bootstrap'),/admin-portals.sql/);version=1;
  await sellerLogin.cloud.request('/me','PATCH',{name:'Updated',email:'',password:'ChangedPassword123!',currentPassword:'ExistingPassword123!'});
  const passwordCall=sellerLogin.calls.filter(c=>c.url.includes('grant_type=password')).at(-1);assert.equal(JSON.parse(passwordCall.options.body).email,'staff_admin@'+nativeRole+'.lk-store.invalid','Password verification uses the original account type');
  membership=false;
  const revoked=app({role:nativeRole==='seller'?'customer':'seller',storage:sharedStorage,handler:staffServer});
  await assert.rejects(revoked.cloud.request('/bootstrap'),/correct customer or seller/,'Revoked Admin cannot retain cross-portal access');
  membership=true;await sellerLogin.cloud.request('/auth/login','POST',{role:'seller',username:'staff_admin',password:'ExistingPassword123!'});
  await sellerLogin.cloud.request('/auth/logout','POST');assert.equal(sharedStorage.size,0);
  assert.equal((await buyerLogin.cloud.request('/bootstrap')).user,null,'Already open Buyer tabs stop using a cleared shared session');
  assert.equal((await app({role:'customer',storage:sharedStorage,handler:staffServer}).cloud.request('/bootstrap')).user,null);
  membership=false;
  const denied=app({role:nativeRole==='seller'?'customer':'seller',handler:staffServer});
  await assert.rejects(denied.cloud.request('/auth/login','POST',{role:nativeRole==='seller'?'customer':'seller',username:'staff_admin',password:'ExistingPassword123!'}),/incorrect/);
  assert.equal(denied.storage.size,0,'Cross-portal ordinary account login never persists a session');
 }
 console.log('PASS: Admin/Owner native credentials across Buyer/Seller/Admin, shared sessions, server-verified privileges, revocation, cross-portal logout, original-role password checks, and migration readiness.');
 console.log('PASS: public buyer/seller signup, admin-only Worker signup, registration readiness guards, pending seller isolation, Worker routing, configuration and secret-key guards, username login, password-free sessions, separate role sessions, renewal, product/draft RPC routing, and server denials.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
