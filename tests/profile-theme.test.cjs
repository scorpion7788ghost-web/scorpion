/* Exercise the actual shared UI scripts without touching live accounts. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function page({role='customer',access='customer',stored=null,blockedStorage=false}={}){
 const nodes=new Map(),events={},documentEvents={},saved=new Map(),redirects=[];
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.handlers={};this.hidden=false;this.textContent='';}
  append(...items){this.children.push(...items);for(const item of items)if(item.id)nodes.set(item.id,item);}
  replaceChildren(...items){this.children=items;}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  contains(node){return this===node||this.children.some(child=>child.contains?.(node));}
  querySelector(){return choices;}
  set innerHTML(value){for(const id of value.matchAll(/id="([^"]+)"/g))nodes.set(id[1],new Element());nodes.get('profile-dropdown').hidden=true;}
 }
 const host=new Element(),choices=new Element(),meta=new Element();
 const document={body:Object.assign(new Element(),{dataset:{portal:role,access}}),documentElement:{dataset:{},style:{}},querySelector:selector=>selector.includes('theme-color')?meta:host,getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),addEventListener:(name,fn)=>documentEvents[name]=fn};
 let signouts=0;
 const context={document,URL,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},location:{href:'https://example.test/buyer/index.html',replace:url=>redirects.push(url)},localStorage:{getItem:()=>{if(blockedStorage)throw Error();return stored;},setItem:(key,value)=>{if(blockedStorage)throw Error();saved.set(key,value);}},STORE_CONFIG:{customerUrl:'https://example.test/buyer/',sellerUrl:'https://example.test/seller/'},Store:{auth:{signOut:async()=>{signouts++;}}},addEventListener:(name,fn)=>(events[name]??=[]).push(fn),dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event))};
 context.window=context;vm.createContext(context);
 for(const file of ['theme.js','profile.js'])vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),context);
 return {context,nodes,choices,documentEvents,events,saved,redirects,get signouts(){return signouts;},links:()=>nodes.get('profile-links').children.map(item=>[item.textContent,item.href])};
}
async function main(){
 let p=page();assert.equal(p.context.StoreTheme.current(),'plum-dark');assert.equal(p.choices.children.length,4);assert.deepEqual(p.links().map(l=>l[0]),['Sign In']);
 p.choices.children[2].handlers.click();assert.equal(p.context.StoreTheme.current(),'black-dark');assert.equal(p.context.document.documentElement.style.colorScheme,'dark');
 p.choices.children[3].handlers.click();assert.equal(p.context.StoreTheme.current(),'white-light');assert.equal(p.context.document.documentElement.style.colorScheme,'light');
 p.context.StoreProfile.mount({name:'Buyer',email:'scorpion@customer.lk-store.invalid'});
 assert.deepEqual(p.links().map(l=>l[0]),['My Account','My Orders','Wishlist','My Comparisons','Recently Viewed','Become a Seller'],'An email/name match cannot grant administrator UI');
 p.context.StoreProfile.mount({name:'Scorpion'},{isAdmin:true});assert.equal(p.links().at(-1)[0],'Admin Panel');
 p.nodes.get('profile-toggle').handlers.click();assert.equal(p.nodes.get('profile-dropdown').hidden,false);
 p.documentEvents.keydown({key:'Escape',preventDefault(){}});assert.equal(p.nodes.get('profile-dropdown').hidden,true);assert.equal(p.nodes.get('profile-toggle').focused,true);
 p.choices.children[1].handlers.click();assert.equal(p.saved.get('lk-store-theme-v1'),'ocean-dark');assert.equal(p.context.document.documentElement.style.colorScheme,'dark');assert.equal(p.choices.children[1].attributes['aria-pressed'],'true');
 p.events.storage[0]({key:'lk-store-theme-v1',newValue:'plum-light'});assert.equal(p.context.StoreTheme.current(),'plum-dark');assert.equal(p.saved.get('lk-store-theme-v1'),'plum-dark');
 p.events.storage[0]({key:'lk-store-theme-v1',newValue:'<invalid>'});assert.equal(p.context.StoreTheme.current(),'plum-dark');
 for(const [oldTheme,newTheme] of [['plum-light','plum-dark'],['ocean-light','ocean-dark']]){p=page({stored:oldTheme});assert.equal(p.context.StoreTheme.current(),newTheme);assert.equal(p.saved.get('lk-store-theme-v1'),newTheme);assert(!p.context.StoreTheme.options.some(([id])=>id===oldTheme));}
 p=page({stored:'ocean-dark'});assert.equal(p.context.StoreTheme.current(),'ocean-dark');
 p=page({blockedStorage:true});p.choices.children[3].handlers.click();assert.equal(p.context.StoreTheme.current(),'white-light');assert.match(p.nodes.get('theme-feedback').textContent,/storage is unavailable/);
 p=page({role:'worker',access:'worker'});p.context.StoreProfile.mount({name:'Worker'},{isAdmin:false});assert.deepEqual(p.links().map(l=>l[0]),['My Account','Buyer','Seller']);
 p.context.StoreProfile.mount({name:'Worker'},{isAdmin:true});assert.equal(p.links().at(-1)[1],'https://example.test/buyer/admin.html?portal=worker');
 p=page({role:'seller',access:'seller'});p.context.StoreProfile.mount({name:'Seller'});assert.deepEqual(p.links().map(l=>l[0]),['My Account','Buyer Site']);
 p=page({access:'admin'});p.context.StoreProfile.mount({name:'Admin'},{isAdmin:true});assert.deepEqual(p.links().map(l=>l[0]),['My Account','Seller','Worker','Buyer']);assert.equal(p.links()[2][1],'https://example.test/buyer/seller-reviews.html');
 await p.nodes.get('profile-signout').handlers.click();assert.equal(p.signouts,1);assert.equal(p.redirects[0],'https://example.test/buyer/admin-login.html');
 p=page();p.context.StoreCloud={enabled:true};p.context.Store.request=async path=>{assert.equal(path,'/notifications');return [{title:'<script>untrusted</script>',body:'A real announcement',created_at:'2026-11-08T00:00:00Z'}];};
 p.context.StoreProfile.mount({name:'Buyer'});await p.nodes.get('profile-links').children.find(n=>n.textContent==='Notifications').handlers.click();
 assert(p.nodes.get('profile-notifications').open);assert.equal(p.nodes.get('profile-notifications').children[2].children[0].children[0].textContent,'<script>untrusted</script>','Notifications render untrusted content as text');
 p.nodes.get('profile-notifications').children[1].handlers.click();assert(!p.nodes.get('profile-notifications').open);
 p.context.Store.request=async()=>{throw Object.assign(Error('Missing migration'),{code:'PGRST202'});};await p.nodes.get('profile-links').children.find(n=>n.textContent==='Notifications').handlers.click();assert.equal(p.nodes.get('profile-notifications').children[2].textContent,'Notifications are not available yet.');
 console.log('PASS: four persistent themes and retired-theme migration, cross-tab changes, invalid/blocked storage, guest menus, keyboard dismissal, per-role links, server-only admin visibility, and sign-out.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
