'use strict';
(async()=>{
 if(!(await Store.accessReady))return;
 const get=id=>document.getElementById(id),all=selector=>[...document.querySelectorAll(selector)];
 const user=Store.auth.current('customer');get('admin-name').textContent=user.name;get('admin-year').textContent=new Date().getFullYear();
 let page=1,role='all',search='',total=0,sequence=0,creating=false,deleting=false,target=null;
 function message(id,text){get(id).textContent=text;get(id).hidden=!text;}
 function setupHint(show){const note=get('admin-setup-note');if(note)note.hidden=!show;}
 function node(tag,cls,text){const result=document.createElement(tag);result.className=cls||'';result.textContent=text||'';return result;}
 function rows(users){
  get('user-rows').replaceChildren(...users.map(person=>{
   const tr=node('tr'),account=node('td'),identity=node('div','user-identity'),copy=node('div','user-copy');copy.append(node('strong','',person.name),node('small','','@'+person.username));identity.append(node('span','user-avatar',person.name.slice(0,1).toUpperCase()),copy);account.append(identity);
   const access=node('td');access.append(node('span','role-badge '+(person.isAdmin?'admin':person.role),person.isAdmin?'Administrator':person.role==='worker'?'Worker':person.role==='seller'?'Seller':'Customer'));
   if(person.role==='seller'&&person.verification_status==='pending')access.append(node('span','verification-badge','Awaiting verification'));
   const actions=node('td'),button=node('button','delete-user',person.isAdmin?'Protected':'Delete');button.type='button';button.disabled=person.isAdmin;button.setAttribute('aria-label',(person.isAdmin?'Protected account ':'Delete account ')+person.username);button.addEventListener('click',()=>openDelete(person));actions.append(button);
   const joined=new Date(person.created_at);tr.append(account,access,node('td','user-email',person.email||'Not provided'),node('td','user-date',Number.isNaN(joined.getTime())?'—':joined.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})),actions);return tr;
  }));get('users-empty').hidden=users.length!==0;
 }
 async function load(){
  const current=++sequence;message('admin-error','');setupHint(false);get('users-status').textContent='Loading accounts…';get('previous-page').disabled=true;get('next-page').disabled=true;get('refresh-users').disabled=true;
  try{const result=await Store.request('/admin/users?'+new URLSearchParams({page,role,search}));if(current!==sequence)return;total=result.total;if(page>1&&!result.users.length){page--;return load();}rows(result.users);get('users-status').textContent=total?((page-1)*25+1)+'–'+Math.min(page*25,total)+' of '+total+' accounts':'No matching accounts';get('previous-page').disabled=page<=1;get('next-page').disabled=page*25>=total;}
  catch(error){if(current!==sequence)return;message('admin-error',error.message);setupHint(error.code==='ADMIN_SERVICE_UNAVAILABLE');get('users-status').textContent='Accounts could not be loaded.';get('user-rows').replaceChildren();get('users-empty').hidden=true;}
  finally{if(current===sequence)get('refresh-users').disabled=false;}
 }
 all('[data-role]').forEach(button=>button.addEventListener('click',()=>{role=button.dataset.role;page=1;all('[data-role]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});load();}));
 get('user-search-form').addEventListener('submit',event=>{event.preventDefault();search=get('user-search').value.trim();page=1;load();});
 get('refresh-users').addEventListener('click',load);get('previous-page').addEventListener('click',()=>{page--;load();});get('next-page').addEventListener('click',()=>{page++;load();});
 get('admin-signout').addEventListener('click',async()=>{try{await Store.auth.signOut();location.replace('admin-login.html');}catch(error){message('admin-error',error.message);}});
 function lock(form,busy){form.querySelectorAll('input,select,button').forEach(control=>{control.disabled=busy;});}
 all('[data-close]').forEach(button=>button.addEventListener('click',()=>get(button.dataset.close).close()));
 get('create-dialog').addEventListener('cancel',event=>{if(creating)event.preventDefault();});get('delete-dialog').addEventListener('cancel',event=>{if(deleting)event.preventDefault();});
 get('open-create').addEventListener('click',()=>{get('create-user-form').reset();get('new-password').type='password';get('show-new-password').textContent='Show';get('show-new-password').setAttribute('aria-label','Show initial password');message('create-error','');get('create-dialog').showModal();get('new-role').focus();});
 get('create-dialog').addEventListener('close',()=>{get('new-password').value='';});
 get('show-new-password').addEventListener('click',()=>{const show=get('new-password').type==='password';get('new-password').type=show?'text':'password';get('show-new-password').textContent=show?'Hide':'Show';get('show-new-password').setAttribute('aria-label',show?'Hide initial password':'Show initial password');});
 get('create-user-form').addEventListener('submit',async event=>{
  event.preventDefault();if(creating)return;creating=true;message('create-error','');const input={};for(const field of ['role','name','username','email','password'])input[field]=get('new-'+field).value;lock(event.currentTarget,true);
  try{const result=await Store.request('/admin/users','POST',input);get('create-dialog').close();message('admin-success','Created '+result.user.role+' account @'+result.user.username+'.');page=1;await load();}
  catch(error){message('create-error',error.message);}
  finally{creating=false;input.password='';lock(get('create-user-form'),false);}
 });
 function openDelete(person){target=person;get('delete-user-form').reset();message('delete-error','');get('delete-description').textContent='Delete @'+person.username+'? This permanently removes their account'+(person.role==='seller'?', store, products, and drafts.':person.role==='worker'?' and Worker access.':' and saved cart.')+' This cannot be undone.';get('delete-dialog').showModal();get('delete-confirm').focus();}
 get('delete-user-form').addEventListener('submit',async event=>{
  event.preventDefault();if(deleting||!target)return;message('delete-error','');if(get('delete-confirm').value!==target.username){message('delete-error','Enter the exact username: '+target.username);return;}deleting=true;lock(event.currentTarget,true);
  try{await Store.request('/admin/users','DELETE',{authId:target.auth_id,username:target.username});get('delete-dialog').close();message('admin-success','Deleted @'+target.username+'.');target=null;await load();}
  catch(error){message('delete-error',error.message);}
  finally{deleting=false;lock(get('delete-user-form'),false);}
 });
 await load();
})();
