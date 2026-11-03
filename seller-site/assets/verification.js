'use strict';
(async()=>{
 if(!(await Store.accessReady))return;
 const get=id=>document.getElementById(id);get('waiting-username').textContent='@'+Store.auth.current('seller').username;
 let timer=null,busy=false,leaving=false;
 function schedule(){clearTimeout(timer);if(!leaving&&!document.hidden)timer=setTimeout(check,15000);}
 async function check(){
  if(busy||leaving)return;busy=true;get('verification-refresh').disabled=true;get('verification-error').hidden=true;
  try{
   const {user}=await Store.request('/verification/status');
   if(leaving)return;
   if(!user){leaving=true;location.replace('login.html');return;}
   if(user.verificationStatus==='approved'){leaving=true;location.replace('dashboard.html');return;}
   get('verification-status').textContent='Your account is still awaiting approval. This page checks automatically.';
  }catch(error){get('verification-error').textContent=error.message;get('verification-error').hidden=false;}
  finally{busy=false;get('verification-refresh').disabled=false;schedule();}
 }
 get('verification-refresh').addEventListener('click',check);
 get('verification-signout').addEventListener('click',async()=>{
  if(leaving)return;leaving=true;clearTimeout(timer);get('verification-signout').disabled=true;
  try{await Store.auth.signOut();location.replace('login.html');}
  catch(error){leaving=false;get('verification-signout').disabled=false;get('verification-error').textContent=error.message;get('verification-error').hidden=false;schedule();}
 });
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)check();});
 window.addEventListener('pagehide',()=>{leaving=true;clearTimeout(timer);});schedule();
})();
