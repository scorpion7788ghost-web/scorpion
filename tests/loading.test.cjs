const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function page(){
 const timers=new Map(),events={},nodes=new Map();let clock=0;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.hidden=false;this.open=false;this.style={};this.handlers={};this.children=[];}
  setAttribute(key,value){this[key]=value;}addEventListener(key,fn){this.handlers[key]=fn;}
  append(node){this.children.push(node);if(node.id)nodes.set(node.id,node);}prepend(node){this.append(node);}
  showModal(){this.open=true;this.modalCalls=(this.modalCalls||0)+1;}close(){this.open=false;}focus(){this.focused=true;}
 }
 const body=new Element('body');body.dataset={portal:'customer'};
 const document={body,readyState:'interactive',createElement:tag=>new Element(tag),getElementById:id=>nodes.get(id),querySelectorAll:()=>[]};
 const context={document,setTimeout:(fn,ms)=>{timers.set(++clock,{fn,ms});return clock;},clearTimeout:id=>timers.delete(id),AbortController,URLSearchParams};
 context.window=context;context.addEventListener=(key,fn)=>{events[key]=fn;};
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/loading.js','utf8'),context);
 return {context,events,timers,nodes,show(){const entry=[...timers].find(([,value])=>value.ms===900);assert(entry,'900ms loading threshold');timers.delete(entry[0]);entry[1].fn();}};
}
async function main(){
 let p=page();assert(!p.events.load,'Images and fonts must not control the loading overlay');p.events.DOMContentLoaded();await flush();assert.equal(p.timers.size,0);assert(!p.nodes.has('store-loading'),'Fast pages never create a loading overlay');
 p=page();const gate=deferred();p.context.Store={accessReady:gate.promise};p.events.DOMContentLoaded();p.show();
 let overlay=p.nodes.get('store-loading');assert(overlay.open);assert.equal(overlay.tagName,'DIALOG','Native modal can appear above an existing account dialog');assert(overlay.innerHTML.includes('Please wait a minute'));assert(overlay.innerHTML.includes('LK Tech Store'));assert.equal(overlay['aria-describedby'],'loading-message');
 let cancelled=false;overlay.handlers.cancel({preventDefault(){cancelled=true;}});assert(cancelled);
 gate.resolve();await flush();assert(!overlay.open);assert(overlay.hidden);
 const first=p.context.StoreLoading.begin(),second=p.context.StoreLoading.begin();p.show();first();first();assert(overlay.open,'Concurrent requests keep the loader open; duplicate completion is harmless');second();assert(!overlay.open);
 const quick=p.context.StoreLoading.begin();quick();assert.equal(p.timers.size,0);
 p=page();const boot=deferred(),save=deferred();
 p.context.StoreCloud={enabled:true,request:async path=>{if(path==='/bootstrap')return boot.promise;if(path==='/cart')return save.promise;return {user:null};}};
 vm.runInContext(fs.readFileSync('assets/store-api.js','utf8'),p.context);
 p.context.Store.accessReady=p.context.Store.ready;p.events.DOMContentLoaded();p.show();overlay=p.nodes.get('store-loading');assert(overlay.open);
 boot.resolve({user:null,stores:[],products:[],cart:{}});await p.context.Store.ready;await flush();assert(!overlay.open);
 const failed=p.context.Store.request('/cart','PUT',{items:{}});const caught=assert.rejects(failed,/Save failed/);p.show();assert(overlay.open);save.reject(new Error('Save failed'));await caught;assert(!overlay.open,'Request failures cannot leave a blocking overlay');
 await p.context.Store.request('/verification/status');assert.equal(p.timers.size,0,'Background verification polling stays quiet');
 await p.context.Store.request('/admin/console','POST',{section:'logs'});assert.equal(p.timers.size,0,'Admin background reads use inline loading rather than blocking every page');
 await p.context.Store.request('/chat/messages?target=me');assert.equal(p.timers.size,0,'Background chat refresh stays quiet');
 const finish=p.context.StoreLoading.begin();p.show();p.events.pagehide();assert(!overlay.open);finish();assert.equal(p.timers.size,0);
 console.log('PASS: delayed-only loading, fast-page suppression, concurrent requests, logo/message, native modal layering, error cleanup, background polling exclusion, and navigation cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
