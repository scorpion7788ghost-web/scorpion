/* Username sign-in only. Accounts are provisioned by an administrator. */
'use strict';
(async()=>{
 await Store.ready;
 const role=document.body.dataset.portal==='seller'?'seller':'customer';
 const admin=document.body.dataset.adminLogin==='true';
 const get=id=>document.getElementById(id),form=get('auth-form');if(!form)return;
 const allowed=role==='seller'?['dashboard.html','products.html','add-product.html','edit-product.html','orders.html','settings.html','account.html','shop.html']:['index.html','cart.html','product.html','contact.html','about.html','account.html','seller.html'];
 function destination(){
  if(admin)return 'admin.html';
  const next=new URLSearchParams(location.search).get('next')||'';
  const match=next.match(/^([a-z-]+\.html)(\?[^#]*)?$/);
  return match&&allowed.includes(match[1])?next:role==='seller'?'dashboard.html':'index.html';
 }
 async function enter(){
  if(admin){const status=await Store.request('/admin/status');if(!status.isAdmin)throw new Error('This customer account does not have administrator access.');}
  location.replace(destination());
 }
 if(Store.auth.current(role)){try{await enter();return;}catch(error){get('auth-error').textContent=error.message;get('auth-error').hidden=false;}}
 get('toggle-password').addEventListener('click',()=>{const input=get('auth-password'),show=input.type==='password';input.type=show?'text':'password';get('toggle-password').textContent=show?'Hide':'Show';get('toggle-password').setAttribute('aria-label',show?'Hide password':'Show password');});
 let busy=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const button=get('auth-submit');button.disabled=true;button.textContent='Signing in...';get('auth-error').hidden=true;
  try{await Store.auth.signIn(role,get('auth-username').value,get('auth-password').value);await enter();}
  catch(error){get('auth-error').textContent=error.message;get('auth-error').hidden=false;}
  finally{busy=false;button.disabled=false;button.textContent='Sign In';}
 });
})();
