"use strict";
function sanitizeCart(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const valid={};
  for(const product of products){const count=value[product.id];if(Number.isInteger(count)&&count>0)valid[product.id]=Math.min(count,99);}
  return valid;
}
function wheelMovement(event,shelf){
  if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!event.deltaY)return 0;
  const factor=event.deltaMode===1?16:event.deltaMode===2?shelf.clientWidth:1;
  const delta=event.deltaY*factor;
  const max=shelf.scrollWidth-shelf.clientWidth;
  if(max<=1||(delta<0&&shelf.scrollLeft<=1)||(delta>0&&shelf.scrollLeft>=max-1))return 0;
  return delta;
}
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const customerId=StoreDemo.auth.current('customer')?.id;
const cartKey=customerId?'lk-demo-cart:'+customerId:'sl-tech-store-cart-v1';
let cart={};
let storageAvailable=true;
try{cart=sanitizeCart(JSON.parse(localStorage.getItem(cartKey)||'{}'));}catch{cart={};}
try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{storageAvailable=false;}
let selectedCategory='All';
let toastTimer;
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function saveCart(){try{localStorage.setItem(cartKey,JSON.stringify(cart));storageAvailable=true;}catch{storageAvailable=false;}updateCartCount();}
function cartCount(){return Object.values(cart).reduce((total,count)=>total+count,0);}
function updateCartCount(){$('#cart-count').textContent=cartCount();$('#cart-count').setAttribute('aria-label',`${cartCount()} items in cart`);}
function createCard(product,isNew=false){
  const li=document.createElement('li');li.className='product-card';
  const button=document.createElement('a');button.href=`product.html?id=${encodeURIComponent(product.id)}`;button.className='product-open';button.setAttribute('aria-label',`View ${product.name}, ${money(product.price)}`);
  const art=document.createElement('div');art.className='product-art';art.style.setProperty('--card-color',product.color);
  const image=document.createElement('img');image.src=productImage(product);image.alt=product.isCustom?product.name:`Illustration of ${product.name}`;if(product.isCustom&&product.image)image.className='custom-photo';image.width=400;image.height=380;image.loading='lazy';image.decoding='async';
  const tag=document.createElement('span');tag.className='card-tag';tag.textContent=isNew?'JUST ADDED':product.category.toUpperCase();
  const arrow=document.createElement('span');arrow.className='card-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');art.append(image,tag,arrow);
  const meta=document.createElement('div');meta.className='product-meta';const category=document.createElement('span');category.className='product-category';category.textContent=product.category;const sample=document.createElement('span');sample.className='sample-label';sample.textContent=StoreDemo.db.store(product.sellerId)?.profile.name||'Demo product';meta.append(category,sample);
  const titleLine=document.createElement('div');titleLine.className='product-title-line';const title=document.createElement('h3');title.textContent=product.name;const price=document.createElement('span');price.className='product-price';price.textContent=money(product.price);titleLine.append(title,price);
  const summary=document.createElement('p');summary.className='product-summary';summary.textContent=product.summary;button.append(art,meta,titleLine,summary);li.append(button);return li;
}

function renderRecommendations(){
  const query=$('#product-search').value;
  const matches=findProducts(query,selectedCategory);
  const shelf=$('#recommended-products');
  shelf.replaceChildren(...matches.map(product=>createCard(product)));
  shelf.scrollLeft=0;shelf.hidden=matches.length===0;
  $('#empty-state').hidden=matches.length!==0;
  $('#search-status').textContent=query.trim()||selectedCategory!=='All'?`${matches.length} product${matches.length===1?'':'s'} found${selectedCategory!=='All'?` in ${selectedCategory}`:''}`:'';
  updateArrows(shelf);
}
function initializeHome(){
  $('#new-products').replaceChildren(...products.filter(product=>product.isNew).map(product=>createCard(product,true)));
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{selectedCategory=button.dataset.category;$$('[data-category]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});renderRecommendations();}));
  $('#product-search').addEventListener('input',renderRecommendations);
  $('#reset-search').addEventListener('click',()=>{$('#product-search').value='';$('[data-category="All"]').click();$('#product-search').focus();});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('#product-search').focus();}});
  renderRecommendations();
}
function initializeProduct(){
  const id=new URLSearchParams(window.location.search).get('id');
  const product=products.find(item=>item.id===id);
  if(!product){$('#product-not-found').hidden=false;$('#breadcrumb-product').textContent='Product not found';document.title='Product not found | LK Tech Store';return;}
  document.title=`${product.name} | LK Tech Store`;
  $('#breadcrumb-product').textContent=product.name;
  $('#product-title').textContent=product.name;
  $('#detail-category').textContent=product.category;
  $('#detail-description').textContent=product.description;
  $('#detail-price').textContent=money(product.price);
  const image=element('img');image.src=productImage(product);image.alt=product.isCustom?product.name:`Illustration of ${product.name}`;image.width=400;image.height=380;
  $('#detail-art').style.setProperty('--card-color',product.color);$('#detail-art').replaceChildren(image);
  $('#single-product').hidden=false;
  const seller=StoreDemo.db.store(product.sellerId);if(seller){const sellerLink=element('a','text-link','Sold by '+seller.profile.name+' \u2192');sellerLink.href='seller.html?id='+encodeURIComponent(product.sellerId);$('.single-product-copy').append(sellerLink);}
  if(product.stock===0){$('#add-to-cart').disabled=true;$('#add-to-cart').textContent='Out of stock';}
  if(product.isCustom){$('.product-badge').textContent='SELLER COLLECTION';$('.price-caption').textContent='Demo price in USD';}
  const quantity=$('#product-quantity');
  function normalizeQuantity(){const value=Number(quantity.value);quantity.value=Number.isFinite(value)?Math.max(1,Math.min(99,Math.floor(value))):1;$('#quantity-down').disabled=Number(quantity.value)<=1;$('#quantity-up').disabled=Number(quantity.value)>=99;return Number(quantity.value);}
  quantity.addEventListener('change',normalizeQuantity);
  $('#quantity-down').addEventListener('click',()=>{quantity.value=normalizeQuantity()-1;normalizeQuantity();});
  $('#quantity-up').addEventListener('click',()=>{quantity.value=normalizeQuantity()+1;normalizeQuantity();});
  normalizeQuantity();
  $('#add-to-cart').addEventListener('click',()=>{if(product.stock===0)return;const count=normalizeQuantity();const before=cart[product.id]||0;cart[product.id]=Math.min(99,before+count);saveCart();toast(!storageAvailable?'Browser storage is unavailable; this item cannot be saved between pages.':cart[product.id]===before?'The cart limit is 99 per product.':`${cart[product.id]-before} x ${product.name} added to your cart.`);});
  const related=products.filter(item=>item.id!==id).sort((a,b)=>Number(b.category===product.category)-Number(a.category===product.category));
  $('#related-products').replaceChildren(...related.map(item=>createCard(item)));
  $('#related-section').hidden=false;
}
function changeCart(id,quantity,focusAction){
  if(quantity<=0)delete cart[id];else cart[id]=Math.min(99,quantity);
  saveCart();renderCart();
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
    const minus=element('button','', '-');minus.setAttribute('aria-label',`Decrease ${product.name} quantity`);minus.dataset.cartId=id;minus.dataset.action='minus';minus.addEventListener('click',()=>changeCart(id,quantity-1,'minus'));
    const count=element('span','',String(quantity));count.setAttribute('aria-label',`Quantity ${quantity}`);
    const plus=element('button','', '+');plus.setAttribute('aria-label',`Increase ${product.name} quantity`);plus.dataset.cartId=id;plus.dataset.action='plus';plus.disabled=quantity>=99;plus.addEventListener('click',()=>changeCart(id,quantity+1,'plus'));
    stepper.append(minus,count,plus);
    const remove=element('button','remove-item','Remove');remove.setAttribute('aria-label',`Remove ${product.name} from cart`);remove.dataset.cartId=id;remove.dataset.action='remove';remove.addEventListener('click',()=>{changeCart(id,0,'remove');toast(`${product.name} removed from your cart.`);});
    controls.append(stepper,remove);
    const lineTotal=element('strong','cart-line-total',money(product.price*quantity));
    row.append(art,copy,controls,lineTotal);container.append(row);
  });
  $('#cart-item-summary').textContent=`${cartCount()} item${cartCount()===1?'':'s'}`;
  $('#cart-subtotal').textContent=money(total);$('#cart-total').textContent=money(total);
}
function updateArrows(shelf){$$(`[data-scroll="${shelf.id}"]`).forEach(button=>{button.disabled=shelf.hidden||(button.dataset.direction==='-1'?shelf.scrollLeft<=2:shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-2);});}
function initializeShelves(){
  $$('[data-scroll]').forEach(button=>button.addEventListener('click',()=>{const shelf=document.getElementById(button.dataset.scroll);const card=shelf.querySelector('.product-card');const distance=card?card.getBoundingClientRect().width+parseFloat(getComputedStyle(shelf).gap):280;shelf.scrollBy({left:Number(button.dataset.direction)*distance,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}));
  $$('.product-shelf').forEach(shelf=>{
    let wheelTimer;
    shelf.addEventListener('wheel',event=>{
      const delta=wheelMovement(event,shelf);if(!delta)return;
      event.preventDefault();shelf.classList.add('wheel-scrolling');shelf.scrollLeft+=delta;
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>shelf.classList.remove('wheel-scrolling'),160);
    },{passive:false});
    shelf.addEventListener('scroll',()=>updateArrows(shelf),{passive:true});
    shelf.addEventListener('keydown',event=>{if(event.target!==shelf||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();shelf.scrollBy({left:event.key==='ArrowRight'?280:-280,behavior:'auto'});});
    updateArrows(shelf);
  });
  window.addEventListener('resize',()=>$$('.product-shelf').forEach(updateArrows));
  window.addEventListener('load',()=>$$('.product-shelf').forEach(updateArrows));
}
window.addEventListener('storage',event=>{if(event.key?.startsWith('lk-demo-seller:')||event.key===null){reloadProducts();if(document.body.dataset.page==='home'){$('#new-products').replaceChildren(...products.filter(product=>product.isNew).map(product=>createCard(product,true)));renderRecommendations();}if(document.body.dataset.page==='product')window.location.reload();}if(event.key===cartKey||event.key?.startsWith('lk-demo-seller:')||event.key===null){try{cart=sanitizeCart(JSON.parse(localStorage.getItem(cartKey)||'{}'));}catch{cart={};}updateCartCount();if(document.body.dataset.page==='cart')renderCart();}});
$('#year').textContent=new Date().getFullYear();
updateCartCount();
const page=document.body.dataset.page;
if(page==='home')initializeHome();
if(page==='product')initializeProduct();
if(page==='cart')renderCart();
initializeShelves();

window.addEventListener('pageshow',event=>{if(!event.persisted)return;reloadProducts();try{cart=sanitizeCart(JSON.parse(localStorage.getItem(cartKey)||'{}'));}catch{cart={};}updateCartCount();if(page==='home'){$('#new-products').replaceChildren(...products.filter(product=>product.isNew).map(product=>createCard(product,true)));renderRecommendations();}if(page==='cart')renderCart();});
