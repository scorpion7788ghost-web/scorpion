/* Shared profile navigation. Links never grant a role or admin access. */
(() => {
 'use strict';
 const role=['seller','worker'].includes(document.body.dataset.portal)?document.body.dataset.portal:'customer';
 const access=document.body.dataset.access;
 const config=window.STORE_CONFIG||{};
 const buyerBase=config.customerUrl||new URL('./',location.href).href;
 const sellerBase=config.sellerUrl||new URL('seller-site/',buyerBase).href;
 const buyer=page=>new URL(page,buyerBase).href;
 const seller=page=>new URL(page,sellerBase).href;
 const adminPage=page=>buyer(page+(role==='customer'?'':'?portal='+role));
 function destinations(user,isAdmin){
  if(!user)return [];
  if(access==='admin'&&isAdmin)return [['Seller',seller('dashboard.html')],['Worker',adminPage('seller-reviews.html')],['Buyer',buyer('index.html')]];
  if(role==='worker')return [['Buyer',buyer('index.html')],['Seller',seller('dashboard.html')],...(isAdmin?[['Admin Panel',buyer('admin.html?portal=worker')]]:[])];
  if(role==='seller')return [['Buyer Site',buyer('index.html')],...(isAdmin?[['Admin Panel',buyer('admin.html?portal=seller')]]:[])];
  return [['Become a Seller',seller('register.html')],...(isAdmin?[['Admin Panel',buyer('admin.html')]]:[])];
 }
 const host=document.querySelector('[data-profile-host]');if(!host)return;
 host.innerHTML='<button id="profile-toggle" class="profile-toggle" type="button" aria-label="Open profile and theme options" aria-expanded="false" aria-controls="profile-dropdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></svg></button><div id="profile-dropdown" class="profile-dropdown" hidden><div class="profile-identity"><small id="profile-caption">WELCOME</small><strong id="profile-name">Make yourself at home</strong></div><div id="profile-links" class="profile-links"></div><fieldset class="theme-picker"><legend>Appearance</legend><div class="theme-options"></div><p id="theme-feedback" role="status" aria-live="polite"></p></fieldset><button id="profile-signout" type="button" hidden>Logout</button><p id="profile-error" class="profile-error" role="alert" hidden></p></div>';
 const get=id=>document.getElementById(id),trigger=get('profile-toggle'),menu=get('profile-dropdown');
 function close(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
 trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
 document.addEventListener('click',e=>{if(!host.contains(e.target))close();});
 document.addEventListener('focusin',e=>{if(!host.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();close(true);}});
 const choices=host.querySelector('.theme-options');
 for(const [id,label] of StoreTheme.options){
  const button=document.createElement('button');button.type='button';button.dataset.themeChoice=id;
  const swatch=document.createElement('span');swatch.className='theme-swatch '+id;swatch.setAttribute('aria-hidden','true');
  button.append(swatch,document.createTextNode(label));
  button.addEventListener('click',()=>{const saved=StoreTheme.apply(id,true);get('theme-feedback').textContent=saved?label+' selected.':'Theme applied. Browser storage is unavailable, so it may reset when you leave.';});
  choices.append(button);
 }
 function sync(){for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.themeChoice===StoreTheme.current()));}
 window.addEventListener('lk-theme-change',sync);sync();
 function link(label,url){const element=document.createElement('a');element.textContent=label;element.href=url;return element;}
 function mount(user,status={}){
  get('profile-caption').textContent=user?'SIGNED IN AS':'WELCOME';get('profile-name').textContent=user?.name||'Make yourself at home';
  const links=get('profile-links');links.replaceChildren();
  if(user){
   links.append(link('My Account',role==='seller'?seller('account.html'):buyer(role==='worker'?'worker-account.html':'account.html')));
   for(const [label,url] of destinations(user,status.isAdmin===true))links.append(link(label,url));
  }else links.append(link('Sign In',role==='seller'?seller('login.html'):buyer(role==='worker'?'worker-login.html':'login.html')));
  get('profile-signout').hidden=!user;
 }
 get('profile-signout').addEventListener('click',async()=>{
  const button=get('profile-signout');button.disabled=true;get('profile-error').hidden=true;
  try{await Store.auth.signOut();location.replace(role==='worker'?buyer('worker-login.html'):role==='seller'?seller('login.html'):buyer(access==='admin'?'admin-login.html':'login.html'));}
  catch(error){button.disabled=false;get('profile-error').textContent=error.message;get('profile-error').hidden=false;}
 });
 window.StoreProfile={mount};mount(null);
})();
