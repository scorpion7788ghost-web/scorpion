const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function page({admin=false,failSend=false}={}){
 class Element{constructor(){this.handlers={};this.children=[];this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.attributes={};this.classList={add(){},remove(){}};this.scrollHeight=100;this.clientHeight=100;this.scrollTop=0;}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}addEventListener(k,v){this.handlers[k]=v;}setAttribute(k,v){this.attributes[k]=v;}querySelectorAll(){return this.children;}focus(){this.focused=true;}}
 const nodes=new Map(),requests=[],timers=new Map(),events={};let nextTimer=0,uuid=0,sends=0;
 const get=id=>{if(id==='admin-inbox'&&!admin)return null;if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const messages=[];
 const doc={hidden:false,getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener:(k,v)=>events[k]=v};
 const context={document:doc,URLSearchParams,Map,Date,crypto:{randomUUID:()=>`request-${++uuid}`},window:{addEventListener:(k,v)=>events[k]=v},setTimeout:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),Store:{accessReady:Promise.resolve(true),request:async(path,method,data)=>{
  requests.push({path,method,data});
  if(path.startsWith('/chat/inbox?'))return {conversations:[{auth_id:'buyer-id',name:'Buyer',username:'buyer',preview:'Hello',author_kind:'customer',created_at:'2026-11-04T00:00:00Z'}],total:1};
  if(path.startsWith('/chat/messages?'))return {messages:[...messages],hasOlder:false};
  if(path==='/chat/send'){sends++;if(failSend&&sends===1)throw Error('Connection lost');messages.push({id:sends,author_kind:admin?'admin':'customer',body:data.message,created_at:'2026-11-04T00:00:00Z'});return {ok:true};}
  throw Error('Unexpected request');
 }}};
 await vm.runInNewContext(fs.readFileSync('assets/chat.js','utf8'),context);
 const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 return {get,requests,events,doc,timers,flush,submit:()=>get('chat-form').handlers.submit({preventDefault(){}})};
}
async function main(){
 let p=await page({failSend:true});p.get('chat-message').value='<img src=x onerror=alert(1)>';
 await p.submit();assert.match(p.get('chat-error').textContent,/Connection lost/);assert(p.get('chat-message').value);assert.equal(p.get('chat-send').disabled,false);
 await p.submit();const sends=p.requests.filter(r=>r.path==='/chat/send');assert.equal(sends[0].data.clientId,sends[1].data.clientId);assert.equal(p.get('chat-message').value,'');
 const bubble=p.get('chat-messages').children[0];assert.equal(bubble.children[1].textContent,'<img src=x onerror=alert(1)>','Untrusted chat content must remain text');
 p.doc.hidden=true;p.events.visibilitychange();assert.equal(p.timers.size,0,'Hidden pages stop polling');
 p=await page({admin:true});assert.equal(p.requests.length,0,'Admin inbox waits until opened');p.get('open-inbox').handlers.click();await p.flush();assert.equal(p.get('admin-inbox').hidden,false);assert.equal(p.get('accounts-workspace').hidden,true);
 p.get('inbox-threads').children[0].handlers.click();await p.flush();assert.equal(p.get('chat-panel').hidden,false);assert.match(p.get('chat-title').textContent,/Buyer/);
 p.get('chat-message').value='Thanks for contacting us';await p.submit();assert.equal(p.requests.find(r=>r.path==='/chat/send').data.target,'buyer-id');
 console.log('PASS: customer/Admin chat selection, safe text rendering, preserved failed drafts, deduplicated retry IDs, private reply destination, and hidden-tab polling.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
