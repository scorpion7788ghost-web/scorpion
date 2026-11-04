/* Shared hosted records through Supabase Auth + Postgres RLS; no account fixtures. */
(() => {
 'use strict';
 const config=window.STORE_CONFIG||{};
 if(config.provider!=='supabase')return;
 const role=['seller','worker'].includes(document.body?.dataset.portal)?document.body.dataset.portal:'customer';
 const url=(config.supabaseUrl||'').replace(/\/$/,'');
 const key=config.supabaseKey||'';
 const adminFunction=config.supabaseAdminFunction??'store-admin';
 const adminPath='/functions/v1/'+adminFunction;
 const storageKey='lk-auth-v2:'+url+':'+role;
 let session=null,refreshing=null;
 try{session=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
 function configured(){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key)throw new Error('Online storage setup is incomplete. Connect the Supabase project using the Project URL and publishable key.');
  if(key.startsWith('sb_secret_'))throw new Error('Use a public publishable key, never a Supabase secret key.');
  if(key.startsWith('eyJ')){
   try{if(JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')throw new Error('private-key');}
   catch{throw new Error('Use the publishable key or legacy anon key, never a service_role key.');}
  }
 }
 function remember(next){session=next;try{if(next)localStorage.setItem(storageKey,JSON.stringify(next));else localStorage.removeItem(storageKey);}catch{throw new Error('Allow browser storage to keep your sign-in session. Your online records are stored in Supabase.');}}
 function checkStorage(){try{localStorage.setItem(storageKey+':check','1');localStorage.removeItem(storageKey+':check');}catch{throw new Error('Allow browser storage before signing in. Account records are saved online.');}}
 async function wire(path,{method='GET',body,token}={}){
  configured();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const headers={apikey:key,Accept:'application/json'};
   if(token)headers.Authorization='Bearer '+token;
   if(body!==undefined)headers['Content-Type']='application/json';
   const response=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
   const raw=await response.text();let result={};try{result=raw?JSON.parse(raw):{};}catch{throw new Error('The hosted storage service returned an invalid response.');}
   if(!response.ok){
    let message=result.msg||result.message||result.error_description||result.error||'The hosted request could not be completed.';
    if(result.code==='42P01'||result.code==='PGRST202'||result.code==='PGRST205')message='Run the Supabase schema setup before using the store.';
    if(['/rest/v1/rpc/lk_directory','/rest/v1/rpc/lk_admin_update_account','/rest/v1/rpc/lk_chat_messages','/rest/v1/rpc/lk_chat_send','/rest/v1/rpc/lk_chat_inbox'].includes(path)&&result.code==='PGRST202')message='The new community tools need activation. The store owner must run community-tools.sql in Supabase.';
    if(path==='/rest/v1/rpc/lk_access_status'&&result.code==='PGRST202')message='Owner protection needs activation. Run owner-access.sql in Supabase.';
    if(path==='/rest/v1/rpc/lk_is_admin'&&result.code==='PGRST202')message='Administrator setup is incomplete. Apply the admin-access.sql upgrade in Supabase.';
    if(['/rest/v1/rpc/lk_registration_status','/rest/v1/rpc/lk_staff_status','/rest/v1/rpc/lk_seller_reviews','/rest/v1/rpc/lk_approve_seller'].includes(path)&&result.code==='PGRST202')message='Registration and seller verification are not ready yet. The store owner needs to apply worker-verification.sql in Supabase.';
    if(response.status===429)message='Too many requests. Please wait and try again.';
    if(path.startsWith('/auth/')&&response.status===400&&result.error_code==='invalid_credentials')message='Username or password is incorrect for this account type.';
    const error=new Error(message);error.status=response.status;error.code=result.code;throw error;
   }
   return result;
  }catch(error){
   if(error.name==='AbortError')throw new Error('Online storage took too long to respond. Please try again.');
   if(error instanceof TypeError){
    if(path===adminPath||path.startsWith(adminPath+'?')){const unavailable=new Error('Cannot reach the admin service. Check that the configured function endpoint is deployed in Supabase and allows requests from this website.');unavailable.code='ADMIN_SERVICE_UNAVAILABLE';throw unavailable;}
    throw new Error('Cannot reach online storage. Check your internet connection.');
   }
   throw error;
  }
  finally{clearTimeout(timer);}
 }
 function keepAuth(result){
  if(!result.access_token||!result.refresh_token)throw new Error('Disable Confirm email in Supabase Authentication for username sign-in, then try again. No store profile is shown until sign-in succeeds.');
  remember({access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Math.floor(Date.now()/1000)+(result.expires_in||3600)});
 }
 async function access(){
  if(!session)return null;
  if(session.expires_at>Date.now()/1000+60)return session.access_token;
  if(!refreshing)refreshing=(async()=>{try{const next=await wire('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});keepAuth(next);return session.access_token;}catch(error){if(error.status===400||error.status===401)remember(null);throw error;}finally{refreshing=null;}})();
  return refreshing;
 }
 async function rows(table,query=''){return wire('/rest/v1/'+table+'?'+query,{token:await access()});}
 async function rpc(name,args){const token=await access();if(!token)throw new Error('Please sign in.');return wire('/rest/v1/rpc/'+name,{method:'POST',body:args,token});}
 function loginEmail(username){const value=String(username||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,30}$/.test(value))throw new Error('Use 3–30 letters, numbers, or underscores for your username.');return value+'@'+role+'.lk-store.invalid';}
 function validatePassword(password){if(typeof password!=='string'||new TextEncoder().encode(password).length<12||new TextEncoder().encode(password).length>72)throw new Error('Use a password between 12 and 72 bytes.');}
 async function identity(){
  const token=await access();if(!token)return null;
  try{await wire('/auth/v1/user',{token});}catch(error){if(error.status===401||error.status===403){remember(null);return null;}throw error;}
  const mine=await rows('lk_profiles','select=*');
  const profile=mine[0];if(!profile)throw new Error('This account has no store profile. Run the Supabase schema setup before registering accounts.');
  if(profile.role!==role){remember(null);throw new Error('Sign in through the correct customer or seller website.');}
  if(profile.role==='seller'&&!['pending','approved'].includes(profile.verification_status))throw new Error('Seller verification setup is incomplete. The store owner needs to apply worker-verification.sql in Supabase.');
  return {id:profile.id,role:profile.role,username:profile.username,name:profile.name,email:profile.email,verificationStatus:profile.verification_status,createdAt:profile.created_at,updatedAt:profile.updated_at};
 }
 async function bootstrap(){
  configured();
  const user=await identity();
  if(!user||user.role==='worker'||(user.role==='seller'&&user.verificationStatus!=='approved'))return {portal:role,user,stores:[],products:[],sellerStore:null,cart:{},orders:[],csrf:'',customerUrl:config.customerUrl,sellerUrl:config.sellerUrl};
  const [shops,publicProducts]=await Promise.all([rows('lk_shops','select=id,profile'),rows('lk_products','select=data&status=eq.active&order=created_at.desc')]);
  const products=publicProducts.map(row=>row.data);
  const stores=shops.map(row=>({profile:row.profile,products:products.filter(p=>p.sellerId===row.id)}));
  let sellerStore=null,cart={};
  if(user?.role==='seller'){
   const [owned,drafts]=await Promise.all([rows('lk_products','select=data&seller_id=eq.'+encodeURIComponent(user.id)+'&order=created_at.desc'),rows('lk_drafts','select=draft_key,data')]);
   const shop=shops.find(s=>s.id===user.id);if(!shop)throw new Error('Your seller store record is missing.');
   sellerStore={profile:shop.profile,products:owned.map(row=>row.data),orders:[],drafts:Object.fromEntries(drafts.map(row=>[row.draft_key,row.data]))};
  }
  if(user?.role==='customer'){
   const saved=await rows('lk_carts','select=items');
   const available=new Map(products.map(product=>[product.id,product]));
   for(const [id,quantity] of Object.entries(saved[0]?.items||{})){
    const product=available.get(id);
    if(product&&Number.isInteger(quantity)&&quantity>0&&product.stock>0)cart[id]=Math.min(99,quantity,product.stock);
   }
  }
  return {portal:role,user,stores,products,sellerStore,cart,orders:[],csrf:'',customerUrl:config.customerUrl,sellerUrl:config.sellerUrl};
 }
 async function request(path,method='GET',data={}){
  configured();
  if(path==='/bootstrap'&&method==='GET')return bootstrap();
  if(path==='/admin/status'||path==='/admin/permissions')return (await access())?rpc('lk_access_status',{}):{isAdmin:false,isOwner:false};
  if(path==='/staff/status')return (await access())?rpc('lk_staff_status',{}):{isAdmin:false,isWorker:false};
  if((path.startsWith('/staff/directory?')||path.startsWith('/admin/directory?'))&&method==='GET'){const p=new URLSearchParams(path.split('?')[1]);return rpc('lk_directory',{page_number:Number(p.get('page')||1),role_filter:p.get('role')||'all',username_search:p.get('search')||''});}
  if(path==='/admin/account'&&method==='PATCH')return rpc('lk_admin_update_account',{target_auth_id:data.authId,display_name:data.name,contact_email:data.email,admin_access:data.isAdmin});
  if(path.startsWith('/chat/messages?')&&method==='GET'){const p=new URLSearchParams(path.split('?')[1]);return rpc('lk_chat_messages',{target_id:p.get('target')||null,before_id:p.get('before')||null});}
  if(path==='/chat/send'&&method==='POST')return rpc('lk_chat_send',{message_body:data.message,client_request_id:data.clientId,target_id:data.target||null});
  if(path.startsWith('/chat/inbox?')&&method==='GET'){const p=new URLSearchParams(path.split('?')[1]);return rpc('lk_chat_inbox',{page_number:Number(p.get('page')||1)});}
  if(path==='/verification/status')return {user:await identity()};
  if(path.startsWith('/staff/sellers?')&&method==='GET'){const params=new URLSearchParams(path.split('?')[1]);return rpc('lk_seller_reviews',{page_number:Number(params.get('page')||1),username_search:params.get('search')||''});}
  if(path==='/staff/approve-seller'&&method==='POST')return rpc('lk_approve_seller',{target_auth_id:data.authId});
  if(path==='/admin/users'||path.startsWith('/admin/users?')){
   const token=await access();if(!token)throw new Error('Please sign in.');
   if(typeof adminFunction!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(adminFunction)){const invalid=new Error('Set supabaseAdminFunction to the function slug from its endpoint URL.');invalid.code='ADMIN_SERVICE_UNAVAILABLE';throw invalid;}
   try{return await wire(adminPath+(path.includes('?')?'?'+path.split('?')[1]:''),{method,token,body:method==='GET'?undefined:data});}
   catch(error){if(error.status===404&&error.code==='NOT_FOUND'){const missing=new Error('The configured admin function endpoint was not found. Check its URL in the administrator setup.');missing.code='ADMIN_SERVICE_UNAVAILABLE';throw missing;}throw error;}
  }
  if(path==='/auth/register'&&method==='POST'){
   if(role==='worker'||data.role!==role||!['customer','seller'].includes(data.role))throw new Error('Only an administrator can create Worker accounts.');
   checkStorage();const email=loginEmail(data.username);validatePassword(data.password);
   const name=String(data.name||'').trim(),contact=String(data.email||'').trim();
   if(!name||name.length>80)throw new Error('Enter your name, up to 80 characters.');
   if(contact.length>120||(contact&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)))throw new Error('Enter a valid contact email, up to 120 characters.');
   const ready=await wire('/rest/v1/rpc/lk_registration_status',{method:'POST',body:{}});
   if(ready.version!==1||ready.enabled!==true)throw new Error('Account registration is not ready yet. Please contact the store owner.');
   const settings=await wire('/auth/v1/settings');
   if(settings.disable_signup||settings.mailer_autoconfirm!==true||settings.external?.email!==true)throw new Error('Registration is not ready yet. The store owner needs to enable email signups and turn off Confirm email for username accounts.');
   const result=await wire('/auth/v1/signup',{method:'POST',body:{email,password:data.password,data:{role,username:String(data.username).trim().toLowerCase(),name,contact_email:contact}}});
   keepAuth(result);return {user:await identity()};
  }
  if(path==='/auth/login'&&method==='POST'){
   checkStorage();if(data.role!==role)throw new Error('Use the correct account website.');
   const result=await wire('/auth/v1/token?grant_type=password',{method:'POST',body:{email:loginEmail(data.username),password:data.password}});keepAuth(result);return {user:await identity()};
  }
  if(path==='/auth/logout'&&method==='POST'){
   const token=await access();if(token)await wire('/auth/v1/logout?scope=local',{method:'POST',token});remember(null);return {ok:true};
  }
  if(path==='/me'&&method==='PATCH'){
   const user=await identity();if(!user)throw new Error('Please sign in.');
   if(!String(data.name||'').trim()||String(data.name).length>80)throw new Error('Enter your name, up to 80 characters.');
   if(String(data.email||'').length>120||(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)))throw new Error('Enter a valid contact email, up to 120 characters.');
   let passwordChanged=false;
   if(data.password){
    validatePassword(data.password);
    const verified=await wire('/auth/v1/token?grant_type=password',{method:'POST',body:{email:loginEmail(user.username),password:data.currentPassword}});
    keepAuth(verified);
    await wire('/auth/v1/user',{method:'PUT',token:await access(),body:{password:data.password}});
    passwordChanged=true;
   }
   try{await rpc('lk_update_account',{input:{name:data.name,email:data.email||''}});}catch(error){if(passwordChanged)throw new Error('Your password changed, but your profile details could not be saved. '+error.message);throw error;}return {user:await identity()};
  }
  if(path==='/seller/store'&&method==='PATCH')return {store:await rpc('lk_update_shop',{input:data})};
  if(path==='/seller/products'&&method==='POST')return {product:await rpc('lk_save_product',{input:data,product_id:null})};
  const update=path.match(/^\/seller\/products\/(product_[a-f0-9]+)$/);
  if(update&&method==='PUT')return {product:await rpc('lk_save_product',{input:data,product_id:update[1]})};
  const status=path.match(/^\/seller\/products\/(product_[a-f0-9]+)\/status$/);
  if(status&&method==='PATCH'){await rpc('lk_product_status',{product_id:status[1],next_status:data.status});return {ok:true};}
  if(path.startsWith('/seller/draft?')&&['PUT','DELETE'].includes(method)){await rpc('lk_save_draft',{draft_key:new URLSearchParams(path.split('?')[1]).get('key')||'new',input:method==='DELETE'?null:data});return {ok:true};}
  if(path==='/cart'&&method==='PUT')return {items:await rpc('lk_save_cart',{items:data.items})};
  if(path==='/seller/export'&&method==='GET'){const state=await bootstrap();if(!state.sellerStore)throw new Error('Please sign in as a seller.');return {format:'lk-tech-store-export-v1',seller:state.sellerStore.profile,products:state.sellerStore.products};}
  throw new Error('This online storage action is not supported.');
 }
 window.StoreCloud={enabled:true,request};
})();
