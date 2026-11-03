/* Shared sign-in gate and account navigation. Database rules enforce data access. */
(() => {
 'use strict';
 const access=document.body.dataset.access||'customer';
 const role=['seller','worker'].includes(document.body.dataset.portal)?document.body.dataset.portal:'customer';
 const publicPage=access==='public';
 const loginPage=access==='admin'?'admin-login.html':role==='worker'?'worker-login.html':'login.html';
 function loginUrl(){return loginPage+'?next='+encodeURIComponent(location.pathname.split('/').pop()+location.search);}
 function fail(message){
  let panel=document.getElementById('access-status');
  if(!panel){panel=document.createElement('section');panel.id='access-status';panel.className='access-status';panel.setAttribute('role','alert');document.body.prepend(panel);}
  const title=document.createElement('h1');title.textContent='Unable to open this page';
  const detail=document.createElement('p');detail.textContent=message;
  const retry=document.createElement('button');retry.textContent='Try again';retry.className='primary-button';retry.addEventListener('click',()=>location.reload());
  const login=document.createElement('a');login.href=loginPage;login.textContent='Go to sign in';
  panel.replaceChildren(title,detail,retry,login);
 }
 function profileMenu(user){
  const trigger=document.getElementById('profile-toggle'),menu=document.getElementById('profile-dropdown');
  if(!trigger||!menu)return;
  const name=document.getElementById('profile-name');if(name)name.textContent=user.name;
  const seller=document.getElementById('become-seller');
  if(seller)seller.href=new URL('register.html',Store.state.sellerUrl||window.STORE_CONFIG.sellerUrl).href;
  function close(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
  trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
  document.addEventListener('click',event=>{if(!trigger.contains(event.target)&&!menu.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden)close(true);});
  document.addEventListener('focusin',event=>{if(!trigger.contains(event.target)&&!menu.contains(event.target))close();});
  document.getElementById('profile-signout')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await Store.auth.signOut();location.replace('login.html');}catch(error){button.disabled=false;const message=document.getElementById('profile-error');message.textContent=error.message;message.hidden=false;}});
  if(window.StoreCloud?.enabled)Store.request('/admin/status').then(result=>{const link=document.getElementById('profile-admin');if(link)link.hidden=!result.isAdmin;}).catch(()=>{});
 }
 Store.accessReady=(async()=>{
  await Store.ready;if(publicPage)return true;
  if(Store.error){fail(Store.error);return false;}
  const user=Store.auth.current(role);
  if(!user){location.replace(loginUrl());return false;}
  if(role==='seller'){
   if(user.verificationStatus!=='approved'&&access!=='seller-pending'){location.replace('verification-pending.html');return false;}
   if(user.verificationStatus==='approved'&&access==='seller-pending'){location.replace('dashboard.html');return false;}
  }
  if(access==='worker'){
   try{const status=await Store.request('/staff/status');if(!status.isWorker){fail('This account does not have Worker access.');return false;}}
   catch(error){fail(error.message);return false;}
  }
  if(access==='admin'){
   try{const result=await Store.request('/admin/status');if(!result.isAdmin){fail('This account does not have administrator access.');return false;}}
   catch(error){fail(error.message);return false;}
  }
  document.body.classList.remove('auth-pending');profileMenu(user);return true;
 })();
 window.addEventListener('pageshow',event=>{if(event.persisted&&!publicPage)location.reload();});
 window.addEventListener('storage',event=>{if(!publicPage&&event.key?.startsWith('lk-auth-v2:')&&event.key.endsWith(':'+role))location.reload();});
})();
