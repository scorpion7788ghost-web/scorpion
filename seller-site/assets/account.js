'use strict';
(() => {
 const role=document.body.dataset.portal==='seller'?'seller':'customer';
 const user=StoreDemo.auth.current(role);
 if(!user){location.replace('login.html');return;}
 const get=id=>document.getElementById(id);
 get('account-greeting').textContent=user.name.split(' ')[0];get('account-name').value=user.name;get('account-email').value=user.email||'';get('account-identity').textContent='@'+user.username+' / '+(role==='seller'?'Seller account':'Customer account');
 document.querySelectorAll('[data-signout]').forEach(button=>button.addEventListener('click',()=>{StoreDemo.auth.signOut(role);location.assign('login.html');}));
 get('account-form').addEventListener('submit',async event=>{event.preventDefault();const button=get('account-save'),message=get('account-message');message.textContent='';button.disabled=true;try{if(get('account-password').value!==get('account-confirm').value)throw new Error('The new passwords do not match.');const next=await StoreDemo.auth.updateAccount(role,{name:get('account-name').value,email:get('account-email').value,currentPassword:get('account-current').value,password:get('account-password').value});get('account-greeting').textContent=next.name.split(' ')[0];get('account-current').value='';get('account-password').value='';get('account-confirm').value='';message.className='form-success';message.textContent='Your account details have been saved in this browser.';}catch(error){message.className='form-error';message.textContent=error.message;}finally{button.disabled=false;}});
 if(role==='customer'){
 const key='lk-demo-cart:'+user.id;const data=StoreDemo.read(key,{});const count=data&&typeof data==='object'?Object.values(data).filter(n=>Number.isInteger(n)&&n>0).reduce((a,b)=>a+b,0):0;get('account-cart-summary').textContent=count+' item'+(count===1?'':'s')+' in your own customer cart.';
 const orders=DEMO_SEED.orders.filter(o=>o.customerId===user.id);const target=get('customer-orders');if(!orders.length){const p=document.createElement('p');p.textContent='No sample orders for this account.';target.append(p);}orders.forEach(order=>{const row=document.createElement('div');row.className='customer-order';const title=document.createElement('strong');title.textContent=order.id;const detail=document.createElement('p');detail.textContent=order.status+' / $'+order.total.toFixed(2)+' / '+order.date;row.append(title,detail);target.append(row);});
 }
})();
