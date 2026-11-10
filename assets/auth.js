/* Customer/seller registration and separate customer, seller and worker sessions. */
'use strict';
(async()=>{
 await Store.ready;
 const role=['seller','worker'].includes(document.body.dataset.portal)?document.body.dataset.portal:'customer';
 const admin=document.body.dataset.adminLogin==='true';
 const registering=document.body.dataset.authMode==='register';
 const requestedAdmin=/^(admin|seller-reviews)\.html\?portal=(worker|seller)$/.test(new URLSearchParams(location.search).get('next')||'');
 const get=id=>document.getElementById(id),form=get('auth-form');if(!form)return;
 const allowed=role==='worker'?['worker.html','worker-account.html']:role==='seller'?['dashboard.html','products.html','add-product.html','edit-product.html','orders.html','settings.html','account.html','shop.html']:['index.html','search.html','wishlist.html','orders.html','cart.html','product.html','contact.html','about.html','account.html','seller.html'];
 function destination(){
  if(admin)return 'admin.html';
  const next=new URLSearchParams(location.search).get('next')||'';
  if(requestedAdmin)return new URL(next,window.STORE_CONFIG.customerUrl).href;
  const match=next.match(/^([a-z-]+\.html)(\?[^#]*)?$/);
  return match&&allowed.includes(match[1])?next:role==='worker'?'worker.html':role==='seller'?'dashboard.html':'index.html';
 }
 async function enter(){
  if(role==='seller'&&Store.auth.current(role)?.verificationStatus!=='approved'){location.replace('verification-pending.html');return;}
  if(role==='worker'){const status=await Store.request('/staff/status');if(!status.isWorker)throw new Error('This account does not have Worker access.');}
  if(admin||requestedAdmin){const status=await Store.request('/admin/status');if(!status.isAdmin)throw new Error('This account does not have admin access.');}
  location.replace(destination());
 }
 if(Store.auth.current(role)){try{await enter();return;}catch(error){get('auth-error').textContent=error.message;get('auth-error').hidden=false;}}
 get('toggle-password').addEventListener('click',()=>{const input=get('auth-password'),show=input.type==='password';input.type=show?'text':'password';get('toggle-password').textContent=show?'Hide':'Show';get('toggle-password').setAttribute('aria-label',show?'Hide password':'Show password');});
 let busy=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const button=get('auth-submit');button.disabled=true;button.textContent=registering?'Creating account...':'Signing in...';get('auth-error').hidden=true;
  try{
   if(registering){
    if(get('auth-password').value!==get('auth-confirm').value)throw new Error('The passwords do not match.');
    await Store.auth.register(role,{name:get('auth-name').value,email:get('auth-email').value,username:get('auth-username').value,password:get('auth-password').value});
   }else await Store.auth.signIn(role,get('auth-username').value,get('auth-password').value);
   get('auth-password').value='';if(get('auth-confirm'))get('auth-confirm').value='';await enter();
  }
  catch(error){get('auth-error').textContent=error.message;get('auth-error').hidden=false;}
  finally{busy=false;button.disabled=false;button.textContent=registering?'Create account':'Sign In';}
 });
})();
