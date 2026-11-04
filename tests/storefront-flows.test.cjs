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
}
const product={id:'product_abc',name:'Actual script check',summary:'Only in isolated tests',description:'No live records',category:'Tech',price:12.5,stock:3,color:'#eeeeee',sellerId:'seller_test',isCustom:true,image:'assets/products/placeholder.svg'};
function base(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const shelf=node('.product-shelf');
 const document={body:{dataset:{}},activeElement:{tagName:'BODY'},createElement:tag=>new Node(tag),addEventListener(){},querySelector:node,querySelectorAll:selector=>selector==='.product-shelf'?[shelf]:[]};
 const window={addEventListener(){},matchMedia:()=>({matches:false}),location:{search:''}};
 return {nodes,node,shelf,document,window,context:{window,document,location:window.location,URLSearchParams,Intl,Number,Promise,setTimeout:()=>1,clearTimeout(){},getComputedStyle:()=>({gap:'20px'})}};
}
async function customer({page='cart',stock=3,cart={product_abc:1},signedIn=false,save}={}){
 const env=base();const items=[{...product,stock}];let persisted={...cart};
 env.document.body.dataset.page=page;env.window.location.search='?id=product_abc';
 Object.assign(env.context,{products:items,reloadProducts(){},productImage:p=>p.image,productBrand:p=>p.brand||'',findProducts:()=>items,localStorage:{getItem:()=>JSON.stringify(persisted),setItem:(key,value)=>{persisted=JSON.parse(value);}},Store:{ready:Promise.resolve(),auth:{current:()=>signedIn?{id:'customer_test'}:null},db:{store:()=>null},getCart:()=>({...persisted}),saveCart:async input=>{if(save)await save(input);persisted={...input};return {...persisted};}}});
 if(page==='home'){
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
 home.node('#header-product-search').value='Acme';await home.node('#header-product-search').fire('input');
 assert.equal(home.node('#product-search').value,'Acme');assert.equal(home.node('#recommended-products').children.length,1);
 await home.node('#header-search-form').fire('submit');assert(home.node('#search-results').scrolledIntoView);assert(home.node('#recommended-heading').focused);
 home.node('#product-search').value='Actual';await home.node('#product-search').fire('input');assert.equal(home.node('#header-product-search').value,'Actual');
 await home.node('#clear-filters').fire('click');assert.equal(home.node('#header-product-search').value,'');
 home.node('#price-max').value='20';await home.node('#price-max').fire('input');assert.equal(home.node('#recommended-products').children.length,1);
 home.node('#filter-brand').value='brand:acme';await home.node('#filter-brand').fire('change');assert.equal(home.node('#empty-state').hidden,false);
 home.node('#price-min').value='100';await home.node('#price-min').fire('input');assert.equal(home.node('#filter-error').hidden,false);assert.equal(home.node('#empty-state').hidden,true);
 await home.node('#clear-filters').fire('click');assert.equal(home.node('#recommended-products').children.length,2);assert.equal(home.node('#filter-error').hidden,true);assert(home.node('#clear-filters').disabled);
 await home.node('[data-category="Accessories"]').click();assert.equal(home.node('#recommended-products').children.length,1);
 home.node('#product-search').value='no-match';await home.node('#product-search').fire('input');assert.equal(home.node('#empty-state').hidden,false);
 await home.node('#reset-search').fire('click');assert.equal(home.node('#recommended-products').children.length,2);
 let brandSaved;
 const branded=await editor({brandEnabled:true,saveProduct:async(id,input)=>{brandSaved=input.brand;return {id:'product_abc'};}});
 assert(!branded.node('#brand-field').hidden);branded.node('#new-brand').value=' Acme ';await branded.form.fire('submit');assert.equal(brandSaved,'Acme');
 const legacy=await editor();assert(legacy.node('#brand-field').hidden);assert(legacy.node('#new-brand').disabled);
 const capped=await customer({stock:2,cart:{product_abc:20,missing:5}});assert.equal(capped.node('#cart-count').textContent,2);
 const plus=descendants(capped.node('#cart-items')).find(n=>n.dataset.action==='plus');assert(plus.disabled,'Stock limit disables cart increase');
 const unavailable=await customer({stock:0,cart:{product_abc:2}});assert.equal(unavailable.node('#cart-count').textContent,0);assert.equal(unavailable.node('#cart-empty').hidden,false);
 const detail=await customer({page:'product',stock:2});detail.node('#product-quantity').value=99;await detail.node('#product-quantity').fire('change');assert.equal(Number(detail.node('#product-quantity').value),2);assert(detail.node('#quantity-up').disabled);
 let prevented=false;detail.shelf.scrollLeft=10;await detail.shelf.fire('wheel',{deltaY:30,deltaX:0,deltaMode:0,preventDefault(){prevented=true;}});assert(prevented);assert.equal(detail.shelf.scrollLeft,40);
 detail.shelf.scrollLeft=400;prevented=false;await detail.shelf.fire('wheel',{deltaY:30,deltaX:0,deltaMode:0,preventDefault(){prevented=true;}});assert(!prevented,'Page scrolling is released at the shelf edge');
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
 console.log('PASS: stock-aware carts and product quantities, out-of-stock removal, horizontal wheel scrolling and edge release, serialized cart saves, duplicate product/draft prevention, and editor recovery after failed saves.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
