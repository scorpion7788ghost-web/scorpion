'use strict';
(async () => {
 await Store.ready;
if(Store.accessReady&&!(await Store.accessReady))return;
 const role=['seller','worker'].includes(document.body.dataset.portal)?document.body.dataset.portal:'customer';
 const user=Store.auth.current(role);
 if(!user){location.replace(role==='worker'?'worker-login.html':'login.html');return;}
 const get=id=>document.getElementById(id);
 get('account-greeting').textContent=user.name.split(' ')[0];get('account-name').value=user.name;get('account-email').value=user.email||'';get('account-identity').textContent='@'+user.username+' / '+(role==='worker'?'Worker account':role==='seller'?'Seller account':'Customer account');
 let readOnly=false;
 if(window.StoreCloud?.enabled){
  try{const permissions=await Store.request('/admin/permissions');if(permissions.isOwner){readOnly=true;get('account-identity').textContent='@'+user.username+' / Owner account';get('account-message').textContent='This Owner account is protected. Its details and credentials cannot be edited.';window.StoreProfile?.mount(user,permissions);}}
  catch(error){readOnly=true;get('account-message').textContent=error.message;}
  if(readOnly)get('account-form').querySelectorAll('input,select,button').forEach(control=>{control.disabled=true;});
 }
 if(role!=='seller')document.querySelectorAll('[data-signout]').forEach(button=>button.addEventListener('click',async()=>{try{await Store.auth.signOut(role);location.assign(role==='worker'?'worker-login.html':'login.html');}catch(error){get('account-message').textContent=error.message;}}));
 get('account-form').addEventListener('submit',async event=>{event.preventDefault();if(readOnly)return;const button=get('account-save'),message=get('account-message');message.textContent='';button.disabled=true;try{if(get('account-password').value!==get('account-confirm').value)throw new Error('The new passwords do not match.');const next=await Store.auth.updateAccount(role,{name:get('account-name').value,email:get('account-email').value,currentPassword:get('account-current').value,password:get('account-password').value});get('account-greeting').textContent=next.name.split(' ')[0];get('account-current').value='';get('account-password').value='';get('account-confirm').value='';message.className='form-success';message.textContent='Your account details have been saved.';}catch(error){message.className='form-error';message.textContent=error.message;}finally{button.disabled=false;}});
 if(role==='customer'){
 const data=Store.getCart();const count=Object.values(data).reduce((a,b)=>a+b,0);get('account-cart-summary').textContent=count+' item'+(count===1?'':'s')+' in your customer cart.';
 const orders=Store.getOrders();const target=get('customer-orders');if(!orders.length){const p=document.createElement('p');p.textContent='You have not placed any orders yet.';target.append(p);}

 }
})();
