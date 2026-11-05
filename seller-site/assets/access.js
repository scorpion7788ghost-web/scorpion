/* Shared sign-in gate and account navigation. Database rules enforce data access. */
(() => {
 'use strict';
 const access=document.body.dataset.access||'customer';
 const role=['seller','worker'].includes(document.body.dataset.portal)?document.body.dataset.portal:'customer';
 const publicPage=access==='public';
 const loginPage=role==='worker'?'worker-login.html':role==='seller'&&access==='admin'?new URL('login.html',window.STORE_CONFIG.sellerUrl).href:access==='admin'?'admin-login.html':'login.html';
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
 Store.accessReady=(async()=>{
  await Store.ready;if(publicPage){window.StoreProfile?.mount(Store.auth.current(role));return true;}
  if(Store.error){fail(Store.error);return false;}
  const user=Store.auth.current(role);
  if(!user){location.replace(loginUrl());return false;}
  if(role==='seller'&&access!=='admin'){
   if(user.verificationStatus!=='approved'&&access!=='seller-pending'){location.replace('verification-pending.html');return false;}
   if(user.verificationStatus==='approved'&&access==='seller-pending'){location.replace('dashboard.html');return false;}
  }
  if(access==='worker'){
   try{const status=await Store.request('/staff/status');if(!status.isWorker){fail('This account does not have Worker access.');return false;}}
   catch(error){fail(error.message);return false;}
  }
  let adminStatus={isAdmin:false};
  if(access==='admin'){
   try{const result=await Store.request('/admin/status');adminStatus=result;if(!result.isAdmin){fail('This account does not have admin access.');return false;}}
   catch(error){fail(error.message);return false;}
  }
  document.body.classList.remove('auth-pending');
  window.StoreProfile?.mount(user,user.isAdmin?{isAdmin:true,isOwner:user.isOwner}:adminStatus);
  if(access!=='admin'&&window.StoreCloud?.enabled)Store.request('/admin/status').then(status=>window.StoreProfile?.mount(user,status)).catch(()=>{});
  return true;
 })();
 window.addEventListener('pageshow',event=>{if(event.persisted&&!publicPage)location.reload();});
 window.addEventListener('storage',event=>{if(!publicPage&&(event.key===null||(event.key?.startsWith('lk-auth-v2:')&&(event.key.endsWith(':'+role)||event.key.endsWith(':staff')))))location.reload();});
})();
