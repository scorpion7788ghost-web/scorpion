/* Read-only seller/worker directory; the database restricts its scope. */
(async()=>{
 'use strict';if(!(await Store.accessReady))return;
 const get=id=>document.getElementById(id);let page=1,role='all',search='',sequence=0;
 function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
 async function load(){
  const current=++sequence;get('directory-error').hidden=true;get('directory-status').textContent='Loading directory…';get('directory-previous').disabled=get('directory-next').disabled=true;
  try{
   const result=await Store.request('/staff/directory?'+new URLSearchParams({page,role,search}));if(current!==sequence)return;
   get('directory-rows').replaceChildren(...result.users.map(person=>{const row=document.createElement('tr');row.append(cell(person.name),cell('@'+person.username),cell(person.role==='seller'?'Seller':'Worker'),cell(person.role==='seller'?(person.verification_status==='approved'?'Verified':'Pending verification'):'Active'));return row;}));
   get('directory-status').textContent=result.total?`${(page-1)*25+1}–${Math.min(page*25,result.total)} of ${result.total} accounts`:'No matching accounts.';get('directory-previous').disabled=page===1;get('directory-next').disabled=page*25>=result.total;
  }catch(error){if(current!==sequence)return;get('directory-rows').replaceChildren();get('directory-error').textContent=error.message;get('directory-error').hidden=false;get('directory-status').textContent='Unable to load the directory.';}
 }
 document.querySelectorAll('[data-directory-role]').forEach(button=>button.addEventListener('click',()=>{role=button.dataset.directoryRole;page=1;document.querySelectorAll('[data-directory-role]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});load();}));
 get('directory-search-form').addEventListener('submit',event=>{event.preventDefault();search=get('directory-search').value.trim();page=1;load();});get('directory-refresh').addEventListener('click',load);get('directory-previous').addEventListener('click',()=>{page--;load();});get('directory-next').addEventListener('click',()=>{page++;load();});
 await load();
})();
