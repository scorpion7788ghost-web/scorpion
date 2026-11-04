/* Private customer support messages. Authentication and isolation live in SQL. */
(async()=>{
 'use strict';if(!(await Store.accessReady))return;
 const get=id=>document.getElementById(id),admin=!!get('admin-inbox');
 let target=null,page=1,threadSequence=0,inboxSequence=0,sending=false,timer=null,older=false,history=new Map(),retry=null;
 function node(tag,text,cls=''){const item=document.createElement(tag);item.textContent=text;item.className=cls;return item;}
 function message(id,text){get(id).textContent=text;get(id).hidden=!text;}
 function visible(){return !document.hidden&&(!admin||!get('admin-inbox').hidden);}
 function render(){
  const log=get('chat-messages'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<70,oldHeight=log.scrollHeight,oldTop=log.scrollTop;
  const rows=[...history.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  log.replaceChildren(...rows.map(item=>{
   const mine=admin?item.author_kind==='admin':item.author_kind==='customer';const bubble=node('article','','chat-message'+(mine?' mine':''));
   const time=node('time',new Date(item.created_at).toLocaleString());time.dateTime=item.created_at;
   bubble.append(node('strong',item.author_kind==='admin'?'Admin':'Customer'),node('p',item.body),time);return bubble;
  }));
  if(!rows.length)log.append(node('p','No messages yet. Send a message to start your conversation.','chat-empty'));
  if(nearBottom)log.scrollTop=log.scrollHeight;else log.scrollTop=oldTop+Math.max(0,log.scrollHeight-oldHeight);
  get('chat-older').hidden=!older;
 }
 async function loadThread(before=null){
  if(admin&&!target)return;
  const sequence=++threadSequence,selected=target;get('chat-refresh').disabled=true;get('chat-older').disabled=true;
  try{
   const params=new URLSearchParams();if(selected)params.set('target',selected);if(before)params.set('before',String(before));
   const result=await Store.request('/chat/messages?'+params);if(sequence!==threadSequence||selected!==target)return;
   // After a long absence, restart at the latest window if it no longer
   // overlaps loaded history; earlier messages remain available by pagination.
   if(!before&&history.size&&result.messages.length&&!result.messages.some(item=>history.has(item.id))){history=new Map();}
   const initial=history.size===0;let changed=initial;
   for(const item of result.messages){if(!history.has(item.id)){history.set(item.id,item);changed=true;}}
   if(initial||before)older=result.hasOlder;
   if(changed)render();message('chat-error','');get('chat-status').textContent='Messages are saved privately. Replies refresh while this page is open.';
  }catch(error){if(sequence===threadSequence)message('chat-error',error.message);}
  finally{if(sequence===threadSequence){get('chat-refresh').disabled=false;get('chat-older').disabled=false;}}
 }
 async function loadInbox(){
  const sequence=++inboxSequence;get('inbox-refresh').disabled=true;
  try{
   const result=await Store.request('/chat/inbox?'+new URLSearchParams({page}));if(sequence!==inboxSequence)return;
   get('inbox-threads').replaceChildren(...result.conversations.map(person=>{
    const button=node('button','','inbox-thread');button.type='button';button.setAttribute('aria-current',String(person.auth_id===target));button.disabled=sending;
    button.append(node('strong',person.name+' · @'+person.username),node('p',person.preview),node('small',(person.author_kind==='admin'?'Admin replied · ':'Customer message · ')+new Date(person.created_at).toLocaleString()));
    button.addEventListener('click',()=>{if(sending)return;target=person.auth_id;threadSequence++;history=new Map();older=false;retry=null;get('chat-message').value='';get('chat-messages').replaceChildren();get('chat-panel').hidden=false;get('chat-unselected').hidden=true;get('chat-title').textContent='Chat with '+person.name;get('chat-description').textContent='Private conversation with @'+person.username;loadThread();loadInbox();});return button;
   }));
   get('inbox-status').textContent=result.total?`${(page-1)*25+1}–${Math.min(page*25,result.total)} of ${result.total} conversations`:'No customer messages yet.';get('inbox-previous').disabled=page===1;get('inbox-next').disabled=page*25>=result.total;message('inbox-error','');
  }catch(error){if(sequence!==inboxSequence)return;message('inbox-error',error.message);get('inbox-previous').disabled=get('inbox-next').disabled=true;}
  finally{if(sequence===inboxSequence)get('inbox-refresh').disabled=false;}
 }
 get('chat-refresh').addEventListener('click',()=>loadThread());
 get('chat-older').addEventListener('click',()=>{const ids=[...history.keys()].map(Number);if(ids.length)loadThread(Math.min(...ids));});
 get('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(sending||(admin&&!target))return;
  const body=get('chat-message').value.trim();if(!body)return;
  sending=true;get('chat-send').disabled=true;get('chat-message').disabled=true;message('chat-error','');
  try{
   if(!retry||retry.body!==body||retry.target!==target)retry={body,target,clientId:crypto.randomUUID()};
   await Store.request('/chat/send','POST',{message:body,target,clientId:retry.clientId});
   retry=null;get('chat-message').value='';get('chat-status').textContent='Message sent.';await loadThread();if(admin)await loadInbox();
  }catch(error){message('chat-error',error.message);}
  finally{sending=false;get('chat-send').disabled=false;get('chat-message').disabled=false;get('chat-message').focus();if(admin)get('inbox-threads').querySelectorAll('button').forEach(button=>{button.disabled=false;});}
 });
 if(admin){
  get('open-inbox').addEventListener('click',()=>{get('accounts-workspace').hidden=true;get('admin-inbox').hidden=false;document.querySelectorAll('[data-role]').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});get('open-inbox').classList.add('active');get('open-inbox').setAttribute('aria-pressed','true');loadInbox();});
  get('inbox-refresh').addEventListener('click',loadInbox);get('inbox-previous').addEventListener('click',()=>{page--;loadInbox();});get('inbox-next').addEventListener('click',()=>{page++;loadInbox();});
 }else await loadThread();
 async function poll(){clearTimeout(timer);if(visible()&&!sending){if(admin)await loadInbox();await loadThread();}if(!document.hidden)timer=setTimeout(poll,15000);}
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)poll();});window.addEventListener('pagehide',()=>clearTimeout(timer));
 timer=setTimeout(poll,15000);
})();
