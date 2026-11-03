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
  if(url.includes('/auth/v1/signup'))return {body:{access_token:'seller-access',refresh_token:'seller-refresh',expires_in:3600}};
  if(url.includes('/auth/v1/token?grant_type=refresh_token'))return {body:{access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600}};
  if(url.includes('/auth/v1/token?grant_type=password'))return {body:{access_token:'verified-access',refresh_token:'verified-refresh',expires_in:3600}};
  if(url.endsWith('/auth/v1/user'))return {body:{id:'authenticated-id'}};
  if(url.includes('/rest/v1/lk_profiles'))return {body:[{id:'seller_owned',role:'seller',username:'real_seller',name:'Seller',email:'private@example.invalid'}]};
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
 await seller.cloud.request('/seller/products/product_abc','PUT',{name:'Saved'});
 assert.equal(JSON.parse(writes[0].options.body).product_id,'product_abc');assert.equal(writes[0].options.headers.Authorization,'Bearer verified-access');
 await seller.cloud.request('/seller/draft?key=new','DELETE',{});assert.equal(JSON.parse(writes[1].options.body).input,null);
 const customer=app({role:'customer',storage,handler:server});assert.equal((await customer.cloud.request('/bootstrap')).user,null,'Customer portal must not inherit seller session');
 const fresh=app({role:'seller',storage,handler:server});assert.equal((await fresh.cloud.request('/bootstrap')).user.id,'seller_owned','Sign-in session persists across page loads');
 const tokenKey=[...storage.keys()].find(k=>k.endsWith(':seller'));const expired=JSON.parse(storage.get(tokenKey));expired.expires_at=0;storage.set(tokenKey,JSON.stringify(expired));
 const renewal=app({role:'seller',storage,handler:server});await renewal.cloud.request('/bootstrap');assert(renewal.calls.some(c=>c.url.includes('grant_type=refresh_token')));
 const refused=app({role:'seller',storage,handler:(url,options)=>url.includes('/rpc/')?{status:403,body:{message:'Ownership denied'}}:server(url,options)});
 await assert.rejects(refused.cloud.request('/seller/products/product_abc/status','PATCH',{status:'active'}),/Ownership denied/);
 const profileFailure=app({role:'seller',storage,handler:(url,options)=>url.includes('/rpc/lk_update_account')?{status:503,body:{message:'Profile temporarily unavailable'}}:server(url,options)});
 await assert.rejects(profileFailure.cloud.request('/me','PATCH',{name:'Updated',email:'',currentPassword:'ValidPassword123!',password:'ChangedPassword123!'}),/Your password changed, but your profile details could not be saved/);
 const failed=app({handler:()=>{throw new TypeError('network')}});await assert.rejects(failed.cloud.request('/auth/login','POST',{role:'customer',username:'user',password:'unused'}),/Cannot reach online storage/);
 const buyerStorage=new Map([['lk-auth-v2:https://isolated-check.supabase.co:customer',JSON.stringify({access_token:'buyer-access',refresh_token:'buyer-refresh',expires_at:Date.now()/1000+3600})]]);
 const adminPreflight=app({storage:buyerStorage,handler:()=>{throw new TypeError('Failed to fetch');}});
 await assert.rejects(adminPreflight.cloud.request('/admin/users'),error=>error.code==='ADMIN_SERVICE_UNAVAILABLE'&&error.message.includes('store-admin')&&!error.message.includes('internet connection'),'A failed admin preflight must identify the admin service, not blame the internet connection');
 const missingAdmin=app({storage:buyerStorage,handler:()=>({status:404,body:{message:'Requested function was not found'}})});
 await assert.rejects(missingAdmin.cloud.request('/admin/users'),error=>error.code==='ADMIN_SERVICE_UNAVAILABLE'&&error.message.includes('not been deployed'));
 const stockChanged=app({storage:buyerStorage,handler:(url,options)=>{
  if(url.includes('/lk_profiles'))return {body:[{id:'customer_owned',role:'customer',username:'buyer',name:'Buyer',email:''}]};
  if(url.includes('/lk_products'))return {body:[{data:{id:'product_live',stock:2}},{data:{id:'product_empty',stock:0}}]};
  if(url.includes('/lk_carts'))return {body:[{items:{product_live:8,product_empty:1,product_removed:3}}]};
  if(url.includes('/lk_shops'))return {body:[]};
  return server(url,options);
 }});
 const buyerState=await stockChanged.cloud.request('/bootstrap');assert.equal(buyerState.cart.product_live,2);assert.equal(Object.keys(buyerState.cart).length,1,'Stored carts follow current stock and active listings');
 const needsConfirm=app({handler:()=>({body:{mailer_autoconfirm:false,external:{email:true}}})});
 await assert.rejects(needsConfirm.cloud.request('/auth/register','POST',{role:'customer',name:'Name',username:'new_buyer',password:'ValidPassword123!'}),/administrator/);
 assert(!needsConfirm.calls.some(call=>call.url.endsWith('/signup')),'Incorrect Auth configuration must be rejected before creating records');
 assert.equal(app({config:{provider:'php'}}).cloud,undefined,'Local PHP path stays available');
 console.log('PASS: cloud configuration and secret-key guards, anonymous data isolation, username login and blocked signup, password-free session storage, separate role sessions, session renewal, product/draft RPC routing, surfaced server denials, and no offline fallback.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
