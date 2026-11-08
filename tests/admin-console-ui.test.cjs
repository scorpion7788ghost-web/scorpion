/* Real Admin scripts and HTML with a deterministic DOM/transport double, not live accounts. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.handlers={};this.style={};this.hidden=false;this.disabled=false;this.value='';this._text='';this.className='';this.classList={add:c=>{this.className+=' '+c;},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ');},toggle:(c,on)=>{const present=this.className.split(' ').includes(c);on=on??!present;on?this.classList.add(c):this.classList.remove(c);return on;}};}
 set textContent(s){this._text=String(s);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join(' ');}
 append(...items){for(const n of items){n.parentElement=this;this.children.push(n);if(this.tagName==='SELECT'&&this.children.length===1)this.value=n.value;}}
 prepend(...items){for(const n of items)n.parentElement=this;this.children.unshift(...items);}
 replaceChildren(...items){this._text='';this.children=[];this.append(...items);}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=v;if(k==='class')this.className=v;if(k==='hidden')this.hidden=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
 removeAttribute(k){delete this.attrs[k];}
 getAttribute(k){return this.attrs[k];}
 addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}
 async fire(type,extra={}){for(const fn of this.handlers[type]||[])await fn({target:this,currentTarget:this,preventDefault(){},...extra});}
 click(){return this.fire('click');}focus(){}scrollIntoView(){}reportValidity(){return true;}showModal(){this.open=true;}close(){this.open=false;}reset(){}
 matches(s){if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.className.split(' ').includes(s.slice(1));const m=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(m)return m[2]===undefined?this.attrs[m[1]]!==undefined:this.attrs[m[1]]===m[2];return this.tagName===s.toUpperCase();}
 querySelectorAll(selector){const parts=selector.split(',').map(s=>s.trim());return this.children.flatMap(c=>[c,...c.querySelectorAll('*')]).filter(c=>parts.some(s=>s==='*'||c.matches(s)));}
 querySelector(selector){const chain=selector.split(' ');let root=this;for(const s of chain){root=root.querySelectorAll(s)[0];if(!root)return null;}return root;}
 closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
}
function documentFromHtml(){const root=new Element('document'),stack=[root],voids=new Set(['meta','link','input','img','br','hr']);for(const match of fs.readFileSync('admin.html','utf8').matchAll(/<\/?([\w-]+)\b([^>]*)>/g)){const [,tag,attrs]=match;if(match[0].startsWith('</')){if(voids.has(tag))continue;const pos=stack.findLastIndex(e=>e.tagName===tag.toUpperCase());assert(pos>0,'HTML closing tag must match: '+tag);stack.length=pos;continue;}const e=new Element(tag);for(const a of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))e.setAttribute(a[1],a[2]??'');stack.at(-1).append(e);if(!voids.has(tag))stack.push(e);}root.body=root.querySelector('body');root.getElementById=id=>root.querySelector('#'+id);root.createElement=tag=>new Element(tag);return root;}
async function setup({missing=false,owner=true}={}){
 const doc=documentFromHtml(),requests=[],location={hash:'',href:'https://example.test/admin.html'},window=new Element('window');
 const user={id:'customer_owner',name:'Owner'},person={auth_id:'buyer-id',id:'customer_buyer',role:'customer',username:'buyer',name:'Buyer',email:'',created_at:'2026-11-08T00:00:00Z',account_active:true,isAdmin:false};
 const prod={id:'product_test',name:'Test item',seller:'seller',category:'Tech',price:10,stock:3,status:'active',moderation:'pending',display_status:'pending',summary:'Summary',description:'Description',image:'assets/products/placeholder.svg'};
 const order={id:'ORDER-1',customer_name:'Buyer',seller_name:'Seller',items:[{name:'Test item',quantity:1}],total_cents:1000,refunded_cents:0,status:'processing',payment_status:'unpaid',tracking:'',created_at:'2026-11-08T00:00:00Z'};
 const seller={...person,auth_id:'seller-id',role:'seller',username:'seller',verification_status:'pending',display_status:'pending'};
 const config={settings:{store_name:'LK Tech Store',support_email:'',moderation_required:false},preferences:{show_security_alerts:false,show_pending_sellers:true},categories:[{name:'Tech',active:true}]};
 const context={window,document:doc,Element,location,history:{replaceState(a,b,hash){location.hash=hash;}},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),Date,URLSearchParams,URL,Blob,crypto:{randomUUID:()=> 'test-request'},setTimeout,clearTimeout,Store:{accessReady:Promise.resolve(true),auth:{current:()=>user},safeImage:p=>p,request:async(path,method,data)=>{
  requests.push({path,method,data});if(path==='/admin/permissions')return {isAdmin:true,isOwner:owner};
  if(path.startsWith('/admin/directory?'))return {users:[person],total:1};if(path==='/admin/command')return {ok:true};
  if(path==='/admin/console'){
   if(missing)throw Object.assign(Error('Upgrade needed'),{code:'PGRST202'});
   const section=data.section;if(section==='settings')return config;
   if(['dashboard','analytics'].includes(section))return {metrics:{users:3,sellers:1,customers:2,products:1,orders:1,pending:1,sales:1000,refunds:0,periodOrders:1,activeProducts:1,unresolved:1},series:[{date:'2026-11-08',sales:1000,orders:1,users:3,sellers:1}],recentOrders:[order],recentActivities:[]};
   if(section==='seller-detail')return {profile:seller,history:[],documents:[]};if(section==='product-detail')return {data:prod,moderation:'pending'};if(section==='order-detail')return order;
   const rows={accounts:[person],verifications:[seller],products:[prod],orders:[order],notifications:[{title:'<script>unsafe</script>',body:'Notification',audience:'all'}],support:[{id:'buyer-id',name:'Buyer',username:'buyer',status:'open',preview:'Help'}],logs:[{action:'admin.login',actor_name:'Admin',entity_id:'id',details:{}}]}[section];assert(rows,'Known backend section '+section);return {rows,total:rows.length};
  }throw Error('Unexpected call: '+path);
 }}};
 window.STORE_CONFIG={sellerUrl:'https://example.test/seller/'};window.StoreChat={open:p=>window.openedChat=p};
 vm.runInNewContext(fs.readFileSync('assets/admin.js','utf8'),context);await window.adminReady;
 vm.runInNewContext(fs.readFileSync('assets/admin-console.js','utf8'),context);await window.adminConsoleReady;
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 const get=id=>doc.getElementById(id),navigate=async section=>{await doc.querySelector(`[data-section="${section}"]`).click();await flush();};
 const clickText=async(root,text)=>{const b=root.querySelectorAll('button').find(e=>e.textContent===text);assert(b,'Button exists: '+text);await b.click();await flush();};
 return {doc,window,get,navigate,clickText,flush,requests,context};
}
async function main(){
 const p=await setup();assert.equal(p.doc.querySelectorAll('[data-section]').length,10);
 for(const name of ['dashboard','accounts','verifications','products','orders','analytics','notifications','support','logs','settings']){await p.navigate(name);const visible=p.doc.querySelectorAll('[data-console-panel]').filter(n=>!n.hidden);assert.equal(visible.length,1);assert.equal(visible[0].dataset.consolePanel,name);assert(!visible[0].textContent.includes('Unable to load'),'Section loads: '+name);assert.equal(p.doc.querySelector(`[data-section="${name}"]`).getAttribute('aria-current'),'page');}
 await p.get('sidebar-toggle').click();assert.equal(p.get('sidebar-toggle').getAttribute('aria-expanded'),'false');await p.get('sidebar-toggle').click();assert.equal(p.get('sidebar-toggle').getAttribute('aria-expanded'),'true');
 const submit=async()=>{const form=p.get('console-dialog-body').querySelector('form');assert(form);await form.fire('submit');await p.flush();};
 await p.navigate('products');await p.clickText(p.get('content-products'),'Approve');await submit();assert.equal(p.requests.at(-2).data?.action||p.requests.find(r=>r.data?.action==='product-approve')?.data.action,'product-approve');
 await p.clickText(p.get('content-products'),'Edit');await submit();assert(p.requests.some(r=>r.data?.action==='product-edit'&&r.data.input.id==='product_test'));
 await p.clickText(p.get('content-products'),'Reject');p.get('console-field-reason').value='Not suitable';await submit();assert(p.requests.some(r=>r.data?.action==='product-reject'));
 await p.clickText(p.get('content-products'),'Remove');p.get('console-field-reason').value='Inappropriate';await submit();assert(p.requests.some(r=>r.data?.action==='product-remove'));
 await p.navigate('verifications');await p.clickText(p.get('content-verifications'),'Review & history');await p.clickText(p.get('console-dialog-body'),'Approve seller');await submit();assert(p.requests.some(r=>r.data?.action==='seller-approve'));
 await p.navigate('orders');await p.clickText(p.get('content-orders'),'Details');p.get('console-field-status').value='shipped';await submit();assert(p.requests.some(r=>r.data?.action==='order-status'&&r.data.input.expected==='processing'));
 await p.navigate('notifications');await p.clickText(p.get('content-notifications'),'New announcement');p.get('console-field-title').value='Announcement';p.get('console-field-body').value='Message';await submit();assert(p.requests.some(r=>r.data?.action==='announcement'&&r.data.input.requestId));
 await p.navigate('support');await p.clickText(p.get('support-tickets'),'Read & reply');assert.equal(p.window.openedChat.auth_id,'buyer-id');await p.clickText(p.get('support-tickets'),'Update status');p.get('console-field-status').value='resolved';await submit();assert(p.requests.some(r=>r.data?.action==='ticket-status'));
 await p.navigate('accounts');await p.clickText(p.get('user-rows'),'Details');await p.clickText(p.get('console-dialog-body'),'Deactivate');await submit();assert(p.requests.some(r=>r.data?.action==='account-status'&&!r.data.input.active));
 await p.navigate('settings');await p.clickText(p.get('content-settings'),'Edit configuration');await submit();assert(p.requests.some(r=>r.data?.action==='settings'));await p.clickText(p.get('content-settings'),'Edit preferences');await submit();assert(p.requests.some(r=>r.data?.action==='preferences'));
 const unavailable=await setup({missing:true});assert(!unavailable.get('console-activation').hidden);await unavailable.navigate('accounts');assert(unavailable.get('user-rows').children.length,'Existing account management survives unapplied migration');
 const admin=await setup({owner:false});await admin.navigate('settings');assert(!admin.get('content-settings').querySelectorAll('button').some(b=>b.textContent==='Edit configuration'),'Only Owner gets website configuration edits');
 console.log('PASS: real HTML nesting, all ten menus, active/hidden panels, collapsible navigation, account details/suspension, product edits/moderation/removal, seller approval/history, order details, announcement form, support replies/status, Owner settings/preferences and migration fallback.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
