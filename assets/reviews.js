'use strict';
(async()=>{
 if(!(await Store.accessReady))return;
 const get=id=>document.getElementById(id),worker=document.body.dataset.portal==='worker';
 const user=Store.auth.current(worker?'worker':'customer');get('reviewer-name').textContent=user.name;
 let page=1,search='',sequence=0,target=null,approving=false;
 function message(id,text){get(id).textContent=text;get(id).hidden=!text;}
 function node(tag,cls,text){const item=document.createElement(tag);item.className=cls||'';item.textContent=text||'';return item;}
 function render(users){
  get('review-rows').replaceChildren(...users.map(person=>{
   const row=node('tr'),identity=node('td'),copy=node('div','user-copy');copy.append(node('strong','',person.name),node('small','','@'+person.username));identity.append(copy);
   const actions=node('td'),button=node('button','review-button','Review seller');button.type='button';button.setAttribute('aria-label','Review seller '+person.username);
   button.addEventListener('click',()=>{target=person;message('approval-error','');get('approval-name').textContent=person.name;get('approval-username').textContent='@'+person.username;get('approval-email').textContent=person.email||'No contact email provided';get('approval-dialog').showModal();});actions.append(button);
   const date=new Date(person.created_at);row.append(identity,node('td','user-email',person.email||'Not provided'),node('td','user-date',Number.isNaN(date.getTime())?'—':date.toLocaleDateString()),actions);return row;
  }));get('review-empty').hidden=users.length>0;
 }
 async function load(){
  const current=++sequence;message('review-error','');get('review-status').textContent='Loading pending sellers…';get('review-refresh').disabled=true;get('review-previous').disabled=true;get('review-next').disabled=true;
  try{
   const result=await Store.request('/staff/sellers?'+new URLSearchParams({page,search}));if(current!==sequence)return;
   if(page>1&&!result.users.length){page--;return load();}render(result.users);
   get('review-total').textContent=String(result.total);get('review-status').textContent=result.total?((page-1)*25+1)+'–'+Math.min(page*25,result.total)+' of '+result.total+' pending sellers':'All caught up';
   get('review-previous').disabled=page<=1;get('review-next').disabled=page*25>=result.total;
  }catch(error){if(current!==sequence)return;get('review-rows').replaceChildren();get('review-empty').hidden=true;get('review-total').textContent='—';get('review-status').textContent='Pending sellers could not be loaded.';message('review-error',error.message);}
  finally{if(current===sequence)get('review-refresh').disabled=false;}
 }
 get('review-search-form').addEventListener('submit',event=>{event.preventDefault();search=get('review-search').value.trim();page=1;load();});
 get('review-refresh').addEventListener('click',load);get('review-previous').addEventListener('click',()=>{page--;load();});get('review-next').addEventListener('click',()=>{page++;load();});
 get('review-signout').addEventListener('click',async()=>{try{await Store.auth.signOut();location.replace(worker?'worker-login.html':'admin-login.html');}catch(error){message('review-error',error.message);}});
 get('approval-cancel').addEventListener('click',()=>get('approval-dialog').close());
 get('approval-dialog').addEventListener('cancel',event=>{if(approving)event.preventDefault();});
 get('approval-form').addEventListener('submit',async event=>{
  event.preventDefault();if(approving||!target)return;approving=true;message('approval-error','');get('approve-seller').disabled=true;get('approval-cancel').disabled=true;
  try{const result=await Store.request('/staff/approve-seller','POST',{authId:target.auth_id});get('approval-dialog').close();message('review-success','Approved @'+result.username+'. They can now access their seller workspace.');target=null;await load();}
  catch(error){message('approval-error',error.message);}
  finally{approving=false;get('approve-seller').disabled=false;get('approval-cancel').disabled=false;}
 });
 await load();
})();
