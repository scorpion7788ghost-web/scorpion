window.customerReady=(async()=>{
await Store.ready;
if(Store.accessReady&&!(await Store.accessReady))return;
await window.StoreMoney?.ready;
reloadProducts();
"use strict";
function stockLimit(product){return Math.max(0,Math.min(99,Number.isInteger(product?.stock)?product.stock:0));}
function sanitizeCart(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const valid={};
  for(const product of products){const count=value[product.id],limit=stockLimit(product);if(Number.isInteger(count)&&count>0&&limit>0)valid[product.id]=Math.min(count,limit);}
  return valid;
}
function wheelMovement(event,shelf){
  if(event.ctrlKey||event.shiftKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY)||!event.deltaY)return 0;
  const factor=event.deltaMode===1?16:event.deltaMode===2?shelf.clientWidth:1;
  const delta=event.deltaY*factor;
  const max=shelf.scrollWidth-shelf.clientWidth;
  if(max<=1||(delta<0&&shelf.scrollLeft<=1)||(delta>0&&shelf.scrollLeft>=max-1))return 0;
  return delta;
}
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const shelfScrollers=new Map(),shelfButtons=new WeakSet();
const reducedScroll=window.matchMedia('(prefers-reduced-motion: reduce)');
const money=value=>window.StoreMoney?.format(value)||new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const customerId=Store.auth.current('customer')?.id;
const cartKey='lk-guest-cart-v1';
let cart={};
let storageAvailable=true;
let cartBusy=false;
if(customerId)cart=sanitizeCart(Store.getCart());else try{cart=sanitizeCart(JSON.parse(localStorage.getItem(cartKey)||'{}'));}catch{cart={};}
let selectedCategory='All';
let toastTimer;
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
async function saveCart(){
 try{if(customerId)cart=sanitizeCart(await Store.saveCart(cart));else localStorage.setItem(cartKey,JSON.stringify(cart));storageAvailable=true;updateCartCount();return true;}
 catch(error){storageAvailable=false;if(customerId)cart=sanitizeCart(Store.getCart());updateCartCount();toast(error.message||'The cart could not be saved.');return false;}
}
function cartCount(){return Object.values(cart).reduce((total,count)=>total+count,0);}
function updateCartCount(){$('#cart-count').textContent=cartCount();$('#cart-count').setAttribute('aria-label',`${cartCount()} items in cart`);window.dispatchEvent(new CustomEvent('lk-cart-change'));}
function createCard(product,isNew=false){
  const li=document.createElement('li');li.className='product-card';
  const button=document.createElement('a');button.href=`product.html?id=${encodeURIComponent(product.id)}`;button.className='product-open';button.setAttribute('aria-label',`View ${product.name}, ${money(product.price)}`);
  const art=document.createElement('div');art.className='product-art';art.style.setProperty('--card-color',product.color);
  const image=document.createElement('img');image.src=productImage(product);image.alt=product.isCustom?product.name:`Illustration of ${product.name}`;if(product.isCustom&&product.image)image.className='custom-photo';image.width=400;image.height=380;image.loading='lazy';image.decoding='async';
  const tag=document.createElement('span');tag.className='card-tag';tag.textContent=isNew?'JUST ADDED':product.category.toUpperCase();
  const arrow=document.createElement('span');arrow.className='card-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');art.append(image,tag,arrow);
  const meta=document.createElement('div');meta.className='product-meta';const category=document.createElement('span');category.className='product-category';category.textContent=product.category;const sellerLabel=document.createElement('span');sellerLabel.className='seller-label';sellerLabel.textContent=Store.db.store(product.sellerId)?.profile.name||'Seller product';meta.append(category,sellerLabel);
  const titleLine=element('div','product-title-line');titleLine.append(element('h3','',product.name));
  const summary=element('p','product-summary',product.summary);
  button.append(art,meta,titleLine,summary);
  const facts=element('dl','card-facts');
  for(const [label,value] of [['Brand',productBrand(product)||'Not specified'],['Availability',stockLimit(product)>0?'In stock':'Out of stock']]){
    const fact=element('div');fact.append(element('dt','',label),element('dd','',value));facts.append(fact);
  }
  const actions=element('div','card-actions');
  const price=element('strong','product-price',money(product.price));
  const view=element('a','card-view','View product');view.href=button.href;view.setAttribute('aria-label',`View ${product.name}`);
  const add=element('button','card-add','Add to cart');add.type='button';add.disabled=stockLimit(product)===0;
  add.setAttribute('aria-label',`Add ${product.name} to cart`);if(add.disabled)add.textContent='Out of stock';
  add.addEventListener('click',async()=>{
    if(cartBusy||!stockLimit(product))return;
    const before=cart[product.id]||0;
    if(before>=stockLimit(product)){toast('The available stock is already in your cart.');return;}
    cartBusy=true;add.disabled=true;add.textContent='Adding…';
    try{cart[product.id]=before+1;if(await saveCart())toast(`${product.name} added to your cart.`);}
    finally{cartBusy=false;add.disabled=stockLimit(product)===0;add.textContent=add.disabled?'Out of stock':'Add to cart';}
  });
  actions.append(price,view,add);li.append(button,facts,actions);window.Shop?.decorateCard(li,product,isNew);return li;
}

function renderRecommendations(){
  const filtered=findProducts('',selectedCategory),matches=window.Shop?.recommend(filtered)||filtered,shelf=$('#recommended-products');
  const newest=$('#new-products'),newMatches=filtered.filter(product=>product.isNew);
  shelfScrollers.get(newest)?.stop();newest.replaceChildren(...newMatches.map(product=>createCard(product,true)));newest.scrollLeft=0;
  $('#new-products-empty').hidden=newMatches.length>0;updateArrows(newest);
  shelfScrollers.get(shelf)?.stop();
  shelf.replaceChildren(...matches.map(product=>createCard(product)));
  shelf.scrollLeft=0;shelf.hidden=matches.length===0;
  $('#empty-state').hidden=matches.length!==0;
  $('#empty-state h3').textContent=products.length?'No products in this category':'New products are on the way';
  $('#empty-state p').textContent=products.length?'Choose another category to explore the collection.':'Products will appear here after sellers publish them.';
  $('#search-status').textContent=selectedCategory==='All'?'':`${matches.length} products in ${selectedCategory}`;
  updateArrows(shelf);
  window.dispatchEvent(new CustomEvent('lk-category-change',{detail:{category:selectedCategory}}));
}
function initializeHome(){
  const notice=element('p','notice-text','No newly added products in this category yet.');notice.id='new-products-empty';$('#new-products').after(notice);
  const more=$('#more-categories'),categories=new Map();
  for(const category of [...(Store.state.categories||[]),...products.map(p=>p.category)]){
    if(typeof category!=='string'||!category.trim()||window.Shop?.collectionFor(category))continue;
    const key=window.Shop?.categoryKey(category)||category;if(!categories.has(key))categories.set(key,category.trim());
  }
  if(more){more.replaceChildren(...[...categories.values()].sort((a,b)=>a.localeCompare(b)).map(category=>{const button=element('button','',category);button.type='button';button.dataset.category=category;button.setAttribute('aria-pressed','false');return button;}));if(!more.children.length)more.append(element('span','','No additional categories yet.'));}
  $('.category-section').addEventListener('click',event=>{const button=event.target.closest('button[data-category]');if(!button)return;
    selectedCategory=button.dataset.category;
    $$('[data-category]').forEach(item=>{const active=item.dataset.category===selectedCategory;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    const extra=Boolean(button.closest('#more-categories')),summary=$('.category-more summary');summary?.classList.toggle('active',extra);
    if(summary){summary.querySelector('span').textContent=extra?selectedCategory:'More';summary.setAttribute('aria-label',extra?'More categories, selected '+selectedCategory:'More categories');}
    const dropdown=$('.category-more');if(dropdown)dropdown.open=false;
    if(extra)summary.focus();renderRecommendations();
  });
  $('#reset-search').addEventListener('click',()=>{$('[data-category="All"]').click();});
  renderRecommendations();
}
function initializeProduct(){
  const id=new URLSearchParams(window.location.search).get('id');
  const product=products.find(item=>item.id===id);
  if(!product){$('#product-not-found').hidden=false;$('#breadcrumb-product').textContent='Product not found';document.title='Product not found | LK Tech Store';return;}
  document.title=`${product.name} | LK Tech Store`;
  $('#breadcrumb-product').textContent=product.name;
  $('#product-title').textContent=product.name;
  $('#detail-category').textContent=[product.category,productBrand(product)].filter(Boolean).join(' · ');
  $('#detail-description').textContent=product.description;
  $('#detail-price').textContent=money(product.price);
  const image=element('img');image.src=productImage(product);image.alt=product.isCustom?product.name:`Illustration of ${product.name}`;image.width=400;image.height=380;
  $('#detail-art').style.setProperty('--card-color',product.color);$('#detail-art').replaceChildren(image);
  $('#single-product').hidden=false;
  const seller=Store.db.store(product.sellerId);if(seller){const sellerLink=element('a','text-link','Sold by '+seller.profile.name+' \u2192');sellerLink.href='seller.html?id='+encodeURIComponent(product.sellerId);$('.single-product-copy').append(sellerLink);}
  if(product.stock===0){$('#add-to-cart').disabled=true;$('#add-to-cart').textContent='Out of stock';}
  if(product.isCustom)$('.product-badge').textContent='SELLER COLLECTION';
  $('.price-caption').textContent=window.StoreMoney?.note||'Price in USD';
  const quantity=$('#product-quantity');
  const quantityMax=Math.max(1,stockLimit(product));quantity.max=String(quantityMax);
  function normalizeQuantity(){const value=Number(quantity.value);quantity.value=Number.isFinite(value)?Math.max(1,Math.min(quantityMax,Math.floor(value))):1;$('#quantity-down').disabled=Number(quantity.value)<=1;$('#quantity-up').disabled=Number(quantity.value)>=quantityMax;return Number(quantity.value);}
  quantity.addEventListener('change',normalizeQuantity);
  $('#quantity-down').addEventListener('click',()=>{quantity.value=normalizeQuantity()-1;normalizeQuantity();});
  $('#quantity-up').addEventListener('click',()=>{quantity.value=normalizeQuantity()+1;normalizeQuantity();});
  normalizeQuantity();
  $('#add-to-cart').addEventListener('click',async()=>{if(cartBusy||product.stock===0)return;cartBusy=true;const button=$('#add-to-cart');button.disabled=true;try{const count=normalizeQuantity();const before=cart[product.id]||0;cart[product.id]=Math.min(99,product.stock,before+count);if(await saveCart())toast(cart[product.id]===before?'The available stock is already in your cart.':`${cart[product.id]-before} x ${product.name} added to your cart.`);}finally{cartBusy=false;button.disabled=false;}});
  const related=products.filter(item=>item.id!==id).sort((a,b)=>Number(b.category===product.category)-Number(a.category===product.category));
  $('#related-products').replaceChildren(...related.map(item=>createCard(item)));
  $('#related-section').hidden=false;
}
async function changeCart(id,quantity,focusAction){
  if(cartBusy)return;cartBusy=true;
  const limit=stockLimit(products.find(product=>product.id===id));
  if(quantity<=0||limit===0)delete cart[id];else cart[id]=Math.min(limit,quantity);
  renderCart();
  try{await saveCart();}finally{cartBusy=false;renderCart();}
  const target=$(`[data-cart-id="${id}"][data-action="${focusAction}"]:not(:disabled)` )||$('#cart-items button:not(:disabled)')||$('#cart-empty a');
  target?.focus({preventScroll:true});
}
function renderCart(){
  const items=Object.entries(cart);
  $('#cart-empty').hidden=items.length!==0;$('#cart-layout').hidden=items.length===0;
  $('#cart-storage-notice').hidden=storageAvailable;
  const container=$('#cart-items');container.replaceChildren();
  let total=0;
  items.forEach(([id,quantity])=>{
    const product=products.find(item=>item.id===id);total+=product.price*quantity;
    const row=element('article','cart-product');
    const art=element('a','cart-product-art');art.href=`product.html?id=${id}`;art.style.setProperty('--card-color',product.color);art.setAttribute('aria-label',`View ${product.name}`);
    const image=element('img');image.src=productImage(product);image.alt='';image.width=100;image.height=100;art.append(image);
    const copy=element('div','cart-product-copy');const category=element('p','eyebrow',product.category);const title=element('a','cart-product-title',product.name);title.href=art.href;const price=element('p','cart-unit-price',`${money(product.price)} each`);copy.append(category,title,price);
    const controls=element('div','cart-product-actions');const stepper=element('div','quantity-control');
    const minus=element('button','', '-');minus.setAttribute('aria-label',`Decrease ${product.name} quantity`);minus.dataset.cartId=id;minus.dataset.action='minus';minus.disabled=cartBusy;minus.addEventListener('click',()=>changeCart(id,quantity-1,'minus'));
    const count=element('span','',String(quantity));count.setAttribute('aria-label',`Quantity ${quantity}`);
    const plus=element('button','', '+');plus.setAttribute('aria-label',`Increase ${product.name} quantity`);plus.dataset.cartId=id;plus.dataset.action='plus';plus.disabled=cartBusy||quantity>=stockLimit(product);plus.addEventListener('click',()=>changeCart(id,quantity+1,'plus'));
    stepper.append(minus,count,plus);
    const remove=element('button','remove-item','Remove');remove.setAttribute('aria-label',`Remove ${product.name} from cart`);remove.dataset.cartId=id;remove.dataset.action='remove';remove.disabled=cartBusy;remove.addEventListener('click',async()=>{await changeCart(id,0,'remove');});
    controls.append(stepper,remove);
    const lineTotal=element('strong','cart-line-total',money(product.price*quantity));
    row.append(art,copy,controls,lineTotal);container.append(row);
  });
  $('#cart-item-summary').textContent=`${cartCount()} item${cartCount()===1?'':'s'}`;
  $('#cart-subtotal').textContent=money(total);$('#cart-total').textContent=money(total);
}
function updateArrows(shelf){$$(`[data-scroll="${shelf.id}"]`).forEach(button=>{button.disabled=shelf.hidden||(button.dataset.direction==='-1'?shelf.scrollLeft<=2:shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-2);});}
function initializeShelves(){
  $$('.product-shelf').forEach(shelf=>{
    if(shelfScrollers.has(shelf))return;
    let frame=null,target=shelf.scrollLeft,lastTime=null;
    const limit=()=>Math.max(0,shelf.scrollWidth-shelf.clientWidth);
    const clamp=value=>Math.max(0,Math.min(limit(),value));
    function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;lastTime=null;target=clamp(shelf.scrollLeft);}
    function tick(time){
      const elapsed=lastTime===null?1000/60:Math.min(50,Math.max(0,time-lastTime));lastTime=time;
      target=clamp(target);
      const remaining=target-shelf.scrollLeft;
      if(reducedScroll.matches||Math.abs(remaining)<.5){shelf.scrollLeft=target;stop();updateArrows(shelf);return;}
      shelf.scrollLeft+=remaining*(1-Math.exp(-elapsed/70));
      frame=requestAnimationFrame(tick);
    }
    function move(delta){
      if(!delta||shelf.hidden)return;
      // Repeated input extends the target; reversing direction responds immediately.
      if(frame===null||Math.sign(delta)!==Math.sign(target-shelf.scrollLeft))target=shelf.scrollLeft;
      target=clamp(target+delta);
      if(reducedScroll.matches){shelf.scrollLeft=target;stop();updateArrows(shelf);return;}
      if(frame===null){lastTime=null;frame=requestAnimationFrame(tick);}
    }
    function step(){const card=shelf.querySelector('.product-card');return card?card.getBoundingClientRect().width+(parseFloat(getComputedStyle(shelf).gap)||0):280;}
    shelfScrollers.set(shelf,{move,stop,step});
    shelf.addEventListener('wheel',event=>{
      const delta=wheelMovement(event,shelf);
      if(!delta){stop();return;}
      event.preventDefault();move(delta);
    },{passive:false});
    // Touch swipes, scrollbar drags, and native horizontal trackpad input keep control.
    shelf.addEventListener('pointerdown',stop,{passive:true});
    shelf.addEventListener('touchstart',stop,{passive:true});
    shelf.addEventListener('focusin',stop);
    shelf.addEventListener('scroll',()=>updateArrows(shelf),{passive:true});
    shelf.addEventListener('keydown',event=>{if(event.target!==shelf||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();move((event.key==='ArrowRight'?1:-1)*step());});
    updateArrows(shelf);
  });
  $$('[data-scroll]').forEach(button=>{
    if(shelfButtons.has(button))return;shelfButtons.add(button);
    button.addEventListener('click',()=>{const controller=shelfScrollers.get(document.getElementById(button.dataset.scroll));controller?.move(Number(button.dataset.direction)*controller.step());});
  });
}
function stopShelves(){for(const [shelf,controller] of shelfScrollers){controller.stop();updateArrows(shelf);}}
window.addEventListener('resize',stopShelves);
window.addEventListener('load',()=>$$('.product-shelf').forEach(updateArrows));
window.addEventListener('pagehide',stopShelves);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopShelves();});
reducedScroll.addEventListener?.('change',stopShelves);
window.addEventListener('storage',event=>{if(!customerId&&event.key===cartKey){try{cart=sanitizeCart(JSON.parse(localStorage.getItem(cartKey)||'{}'));}catch{cart={};}updateCartCount();if(page==='cart')renderCart();}});
$('#year').textContent=new Date().getFullYear();
updateCartCount();
const page=document.body.dataset.page;
if(page==='home')initializeHome();
if(page==='product')initializeProduct();
if(page==='cart')renderCart();
initializeShelves();
Object.assign(window,{createCard,updateArrows,initializeShelves});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

})();
