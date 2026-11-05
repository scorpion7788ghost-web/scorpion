/* Behavioral checks of the real page scripts with a small DOM test double. */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
class Node {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.events={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.scrollLeft=0;this.clientWidth=100;this.scrollWidth=500;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 after(){}
 setAttribute(name,value){this[name]=String(value);}
 addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
 fire(name,extra={}){return Promise.all((this.events[name]||[]).map(callback=>callback({target:this,preventDefault(){},...extra})));}
 focus(){this.focused=true;}
 click(){return this.fire('click');}
 get validity(){return {badInput:false};}
 scrollIntoView(){this.scrolledIntoView=true;}
 getBoundingClientRect(){return {width:200};}
 scrollBy({left}){this.scrollLeft+=left;}
 querySelector(selector){return selector==='.product-card'?this.children.find(child=>child.className==='product-card')||null:null;}
}
const product={id:'product_abc',name:'Actual script check',summary:'Only in isolated tests',description:'No live records',category:'Tech',price:12.5,stock:3,color:'#eeeeee',sellerId:'seller_test',isCustom:true,image:'assets/products/placeholder.svg'};
function base(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const shelf=node('.product-shelf');
 const frames=new Map();let nextFrame=0,time=0;
 const requestAnimationFrame=callback=>{frames.set(++nextFrame,callback);return nextFrame;};
 const cancelAnimationFrame=id=>frames.delete(id);
 const advance=()=>{time+=1000/60;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
 const settle=()=>{let steps=0;while(frames.size&&steps++<120)advance();assert.equal(frames.size,0,'Scrolling settles without an endless animation');};
 const media={matches:false,addEventListener(){}};
 const document=Object.assign(new Node(),{body:{dataset:{}},activeElement:{tagName:'BODY'},createElement:tag=>new Node(tag),getElementById:id=>node('#'+id),querySelector:node,querySelectorAll:selector=>selector==='.product-shelf'?[shelf]:[]});
 const window=Object.assign(new Node(),{matchMedia:()=>media,location:{search:''}});
 return {nodes,node,shelf,document,window,frames,advance,settle,media,context:{window,document,location:window.location,URLSearchParams,Intl,Number,Promise,requestAnimationFrame,cancelAnimationFrame,setTimeout:()=>1,clearTimeout(){},getComputedStyle:()=>({gap:'20px'})}};
}
async function customer({page='cart',stock=3,cart={product_abc:1},signedIn=false,save}={}){
 const env=base();const items=[{...product,stock}];let persisted={...cart};
 env.document.body.dataset.page=page;env.window.location.search='?id=product_abc';
 Object.assign(env.context,{products:items,reloadProducts(){},productImage:p=>p.image,productBrand:p=>p.brand||'',findProducts:()=>items,localStorage:{getItem:()=>JSON.stringify(persisted),setItem:(key,value)=>{persisted=JSON.parse(value);}},Store:{ready:Promise.resolve(),auth:{current:()=>signedIn?{id:'customer_test'}:null},db:{store:()=>null},getCart:()=>({...persisted}),saveCart:async input=>{if(save)await save(input);persisted={...input};return {...persisted};}}});
 if(page==='home'){
  env.nodes.set('#recommended-products',env.shelf);
  items.push({...product,id:'product_other',price:50,brand:'Acme',category:'Accessories'});
  env.context.Store.db.catalog=()=>items;env.context.Store.safeImage=v=>v;
  vm.runInNewContext(fs.readFileSync('assets/catalog.js','utf8'),env.context);env.context.products=env.window.products;
  const categories=['All','Tech','Accessories'].map(category=>{const button=env.node('[data-category="'+category+'"]');button.dataset.category=category;return button;});
  env.document.querySelectorAll=selector=>selector==='[data-category]'?categories:selector==='.product-shelf'?[env.shelf]:[];
 }
 vm.runInNewContext(fs.readFileSync('assets/site.js','utf8'),env.context);
 await env.window.customerReady;
 return {...env,persisted:()=>persisted};
}
function descendants(node){return node.children.flatMap(child=>typeof child==='object'?[child,...descendants(child)]:[]);}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function editor({saveProduct,saveDraft,brandEnabled=false}={}){
 const env=base();const form=env.node('#add-product-form');const color=new Node('input');color.value='#eeeeee';
 const inputs=['name','category','price','summary','description','sku','stock','status','brand'].map(name=>env.node('#new-'+name));
 for(const input of inputs)input.value='';
 env.node('#new-category').value='Tech';env.node('#new-price').value='12.50';env.node('#new-stock').value='3';env.node('#new-status').value='active';
 const controls=[...inputs,color,env.node('#save-product'),env.node('#save-draft'),env.node('#remove-image')];
 form.querySelector=()=>color;form.querySelectorAll=selector=>selector==='[name="color"]'?[color]:controls;
 env.window.sellerReady=Promise.resolve();
 Object.assign(env.context,{$:env.node,sellerUser:{id:'seller_test'},sellerStore:{products:[]},productCategories:['Tech','Home','Accessories','Lifestyle'],money:n=>'$'+n,refreshSeller(){},Store:{request:async()=>({brand:brandEnabled}),safeImage:v=>v,db:{requireSeller:()=>({products:[]}),getDraft:()=>null,saveProduct:saveProduct||(()=>Promise.resolve({id:'product_abc'})),saveDraft:saveDraft||(()=>Promise.resolve())}}});
 vm.runInNewContext(fs.readFileSync('seller-site/assets/editor.js','utf8'),env.context);
 await new Promise(resolve=>setImmediate(resolve));
 return {...env,form,controls};
}
async function main(){
 const home=await customer({page:'home'});
 assert.equal(home.node('#recommended-products').children.length,2);
 await home.shelf.fire('wheel',{deltaY:100,deltaX:0});home.advance();assert(home.frames.size);
 await home.node('[data-category="Accessories"]').click();assert.equal(home.node('#recommended-products').children.length,1);
 home.settle();assert.equal(home.shelf.scrollLeft,0,'Changing category cancels old scroll motion and starts at the first result');
 await home.node('#reset-search').fire('click');assert.equal(home.node('#recommended-products').children.length,2);
 const cardAdd=env=>descendants(env.node('#recommended-products')).find(n=>n.className==='card-add');
 const cards=await customer({page:'home',signedIn:true,cart:{}});
 const firstCard=cards.node('#recommended-products').children[0];
 assert(!descendants(firstCard.children[0]).some(n=>n.tagName==='BUTTON'),'Product links must not contain nested buttons');
 const cardView=descendants(firstCard).find(n=>n.className==='card-view');assert.equal(cardView.href,'product.html?id=product_abc');
 await cardAdd(cards).click();assert.equal(cards.persisted().product_abc,1);assert.equal(cards.node('#cart-count').textContent,1);
 await cardAdd(cards).click();await cardAdd(cards).click();await cardAdd(cards).click();assert.equal(cards.persisted().product_abc,3,'Card purchases respect available stock');
 const noStock=await customer({page:'home',stock:0,cart:{},signedIn:true});assert(cardAdd(noStock).disabled);await cardAdd(noStock).click();assert.equal(noStock.persisted().product_abc,undefined);
 const cardFailure=await customer({page:'home',signedIn:true,cart:{},save:()=>Promise.reject(new Error('Cart save failed'))});
 await cardAdd(cardFailure).click();assert.equal(cardFailure.node('#cart-count').textContent,0);assert.equal(cardFailure.node('#toast').textContent,'Cart save failed');assert(!cardAdd(cardFailure).disabled);
 const pendingCard=deferred();let cardWrites=0;
 const cardBusy=await customer({page:'home',signedIn:true,cart:{},save:()=>{cardWrites++;return pendingCard.promise;}});
 const firstCardSave=cardAdd(cardBusy).click();await cardAdd(cardBusy).click();
 const anotherAdd=descendants(cardBusy.node('#recommended-products')).filter(n=>n.className==='card-add')[1];await anotherAdd.click();assert.equal(cardWrites,1,'All card buttons share the cart request lock');
 pendingCard.resolve();await firstCardSave;assert.equal(cardBusy.persisted().product_abc,1);assert(!cardAdd(cardBusy).disabled);
 const pendingDetail=deferred();let detailWrites=0;
 const detailBusy=await customer({page:'product',signedIn:true,cart:{},save:()=>{detailWrites++;return pendingDetail.promise;}});
 const detailSave=detailBusy.node('#add-to-cart').click();await detailBusy.node('#add-to-cart').click();assert.equal(detailWrites,1);pendingDetail.resolve();await detailSave;
 let brandSaved;
 const branded=await editor({brandEnabled:true,saveProduct:async(id,input)=>{brandSaved=input.brand;return {id:'product_abc'};}});
 assert(!branded.node('#brand-field').hidden);branded.node('#new-brand').value=' Acme ';await branded.form.fire('submit');assert.equal(brandSaved,'Acme');
 const legacy=await editor();assert(legacy.node('#brand-field').hidden);assert(legacy.node('#new-brand').disabled);
 const capped=await customer({stock:2,cart:{product_abc:20,missing:5}});assert.equal(capped.node('#cart-count').textContent,2);
 const plus=descendants(capped.node('#cart-items')).find(n=>n.dataset.action==='plus');assert(plus.disabled,'Stock limit disables cart increase');
 const unavailable=await customer({stock:0,cart:{product_abc:2}});assert.equal(unavailable.node('#cart-count').textContent,0);assert.equal(unavailable.node('#cart-empty').hidden,false);
 const detail=await customer({page:'product',stock:2});detail.node('#product-quantity').value=99;await detail.node('#product-quantity').fire('change');assert.equal(Number(detail.node('#product-quantity').value),2);assert(detail.node('#quantity-up').disabled);
 await checkScrolling(detail);
 const pendingCart=deferred();let cartWrites=0;
 const cartPage=await customer({signedIn:true,save:()=>{cartWrites++;return pendingCart.promise;}});
 const cartPlus=descendants(cartPage.node('#cart-items')).find(n=>n.dataset.action==='plus');
 const firstCart=cartPlus.fire('click');await cartPlus.fire('click');assert.equal(cartWrites,1);pendingCart.resolve();await firstCart;assert.equal(cartPage.persisted().product_abc,2);
 const pendingProduct=deferred();let productWrites=0;
 const add=await editor({saveProduct:()=>{productWrites++;return pendingProduct.promise;}});
 const first=add.form.fire('submit');await add.form.fire('submit');assert.equal(productWrites,1,'Repeated submit creates only one product request');assert(add.controls.every(node=>node.disabled));
 pendingProduct.resolve({id:'product_abc'});await first;assert(add.node('#save-product').disabled);assert.equal(add.node('#editor-success').hidden,false);assert(!add.node('#new-name').disabled);
 const failed=await editor({saveProduct:()=>Promise.reject(new Error('Storage unavailable'))});await failed.form.fire('submit');assert.equal(failed.node('#editor-error').textContent,'Storage unavailable');assert(!failed.node('#save-product').disabled);assert(!failed.node('#new-name').disabled);
 const pendingDraft=deferred();let draftWrites=0;
 const draft=await editor({saveDraft:()=>{draftWrites++;return pendingDraft.promise;}});const firstDraft=draft.node('#save-draft').fire('click');await draft.node('#save-draft').fire('click');await draft.form.fire('submit');assert.equal(draftWrites,1);pendingDraft.resolve();await firstDraft;assert(!draft.node('#save-draft').disabled);
 console.log('PASS: product card links and cart actions, stock limits, failed-save recovery, shared cart request lock, product quantities, horizontal wheel scrolling, and seller editor saves.');
}
async function checkScrolling(env){
 const {shelf,frames,advance,settle}=env;
 async function wheel(deltaY,extra={}){let prevented=false;await shelf.fire('wheel',{deltaY,deltaX:0,deltaMode:0,preventDefault(){prevented=true;},...extra});return prevented;}
 shelf.scrollLeft=10;assert(await wheel(30));assert.equal(shelf.scrollLeft,10,'Wheel input is animated instead of jumping');
 advance();assert(shelf.scrollLeft>10&&shelf.scrollLeft<40,'Intermediate frame eases toward target');
 assert(await wheel(30));assert.equal(frames.size,1,'Repeated input shares one animation');settle();assert.equal(shelf.scrollLeft,70,'Wheel distances accumulate');
 await wheel(100);advance();const beforeReverse=shelf.scrollLeft;await wheel(-30);advance();assert(shelf.scrollLeft<beforeReverse,'Reversing input reverses immediately');settle();assert.equal(shelf.scrollLeft,beforeReverse-30);
 shelf.scrollLeft=400;assert(!await wheel(30),'Page scrolling is released at the right edge');
 shelf.scrollLeft=0;assert(!await wheel(-30),'Page scrolling is released at the left edge');
 shelf.scrollWidth=100;assert(!await wheel(30),'Non-overflowing shelves leave page scrolling alone');shelf.scrollWidth=500;
 shelf.scrollLeft=100;
 for(const extra of [{deltaX:40},{ctrlKey:true},{shiftKey:true}]){assert(!await wheel(30,extra),'Native horizontal, zoom and shifted scrolling are preserved');assert.equal(frames.size,0);}
 await wheel(100);advance();await shelf.fire('touchstart');const interrupted=shelf.scrollLeft;settle();assert.equal(shelf.scrollLeft,interrupted,'Touch cancels pending wheel motion');
 shelf.scrollLeft=0;await wheel(2,{deltaMode:1});settle();assert.equal(shelf.scrollLeft,32,'Line wheel units are normalized');
 await wheel(1,{deltaMode:2});settle();assert.equal(shelf.scrollLeft,132,'Page wheel units are normalized');
 env.media.matches=true;await wheel(30);assert.equal(shelf.scrollLeft,162);assert.equal(frames.size,0,'Reduced motion uses immediate scrolling');env.media.matches=false;
 const card=new Node();card.className='product-card';shelf.append(card);shelf.scrollLeft=0;
 await shelf.fire('keydown',{key:'ArrowRight'});advance();assert(shelf.scrollLeft>0&&shelf.scrollLeft<220);settle();assert.equal(shelf.scrollLeft,220,'Keys advance by card width plus gap');
 await shelf.fire('keydown',{key:'ArrowLeft',target:card});assert.equal(frames.size,0,'Keys inside cards are left alone');
 const button=new Node('button');button.dataset={scroll:'test-shelf',direction:'-1'};env.nodes.set('#test-shelf',shelf);
 env.document.querySelectorAll=selector=>selector==='.product-shelf'?[shelf]:selector==='[data-scroll]'?[button]:[];
 env.window.initializeShelves();env.window.initializeShelves();assert.equal(shelf.events.wheel.length,1);assert.equal(button.events.click.length,1);
 await button.click();settle();assert.equal(shelf.scrollLeft,0,'Buttons use the same card-sized easing');
 await wheel(100);await env.window.fire('resize');assert.equal(frames.size,0,'Resizing stops pending movement');
 await wheel(100);await env.window.fire('pagehide');assert.equal(frames.size,0,'Navigating away cancels animations');
 console.log('PASS: eased wheel, repeated and reversed input, shelf edges, native gestures, reduced motion, card-sized buttons/keys and animation cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
