/* Delayed feedback for page initialization and foreground storage operations. */
(() => {
 'use strict';
 let pending=0,timer=null,overlay=null;
 function hide(){
  if(timer!==null){clearTimeout(timer);timer=null;}
  if(!overlay)return;
  if(overlay.open)overlay.close();
  overlay.hidden=true;
 }
 function show(){
  timer=null;if(!pending)return;
  if(!overlay){
   overlay=document.createElement('dialog');overlay.id='store-loading';overlay.className='store-loading';overlay.tabIndex=-1;
   overlay.setAttribute('aria-labelledby','loading-company');overlay.setAttribute('aria-describedby','loading-message');
   overlay.addEventListener('cancel',event=>event.preventDefault());
   overlay.innerHTML='<div class="loading-card"><svg class="loading-logo" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-12 32 32)"><rect x="9" y="9" width="19" height="19" rx="4"/><rect class="loading-logo-accent" x="35" y="9" width="19" height="19" rx="4"/><rect x="9" y="35" width="19" height="19" rx="4"/><rect x="35" y="35" width="19" height="19" rx="4"/></g></svg><strong id="loading-company">LK Tech Store</strong><p id="loading-message" role="status">Please wait a minute</p><span class="loading-progress" aria-hidden="true"></span></div>';
   document.body.append(overlay);
  }
  overlay.hidden=false;overlay.showModal();overlay.focus({preventScroll:true});
 }
 function begin(){
  pending++;
  if(pending===1)timer=setTimeout(show,900);
  let finished=false;
  return ()=>{if(finished)return;finished=true;pending--;if(!pending)hide();};
 }
 window.StoreLoading={begin};
 const finishInitial=begin();
 async function ready(){
  try{await window.Store?.accessReady;await window.customerReady;await window.sellerReady;}
  finally{finishInitial();}
 }
 if(document.readyState==='complete')ready().catch(()=>{});
 // Deferred app scripts are ready at DOMContentLoaded; images and fonts must not
 // keep an otherwise usable page behind the modal until window.load.
 else window.addEventListener('DOMContentLoaded',()=>{ready().catch(()=>{});},{once:true});
 window.addEventListener('pagehide',hide);
})();
