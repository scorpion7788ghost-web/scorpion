window.customerReady=(async()=>{
await Store.ready;
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
function updateCartCount(){$('#cart-count').textContent=cartCount();$('#cart-count').setAttribute('aria-label',`${cartCount()} items in cart`);}
function createCard(product,isNew=false){
  const li=document.createElement('li');li.className='product-card';
  const button=document.createElement('a');button.href=`product.html?id=${encodeURIComponent(product.id)}`;button.className='product-open';button.setAttribute('aria-label',`View ${product.name}, ${money(product.price)}`);
  const art=document.createElement('div');art.className='product-art';art.style.setProperty('--card-color',product.color);
  const image=document.createElement('img');image.src=productImage(product);image.alt=product.isCustom?product.name:`Illustration of ${product.name}`;if(product.isCustom&&product.image)image.className='custom-photo';image.width=400;image.height=380;image.loading='lazy';image.decoding='async';
  const tag=document.createElement('span');tag.className='card-tag';tag.textContent=isNew?'JUST ADDED':product.category.toUpperCase();
  const arrow=document.createElement('span');arrow.className='card-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');art.append(image,tag,arrow);
  const meta=document.createElement('div');meta.className='product-meta';const category=document.createElement('span');category.className='product-category';category.textContent=product.category;const sellerLabel=document.createElement('span');sellerLabel.className='seller-label';sellerLabel.textContent=Store.db.store(product.sellerId)?.profile.name||'Seller product';meta.append(category,sellerLabel);
  const titleLine=document.createElement('div');titleLine.className='product-title-line';const title=document.createElement('h3');title.textContent=product.name;const price=document.createElement('span');price.className='product-price';price.textContent=money(product.price);titleLine.append(title,price);
  const summary=document.createElement('p');summary.className='product-summary';summary.textContent=product.summary;button.append(art,meta,titleLine,summary);li.append(button);return li;
}

function renderRecommendations(){
  const query=$('#product-search').value;
  const matches=findProducts(query,selectedCategory);
  const shelf=$('#recommended-products');
  shelf.replaceChildren(...matches.map(product=>createCard(product)));
  shelf.scrollLeft=0;shelf.hidden=matches.length===0;
  $('#empty-state').hidden=matches.length!==0;if(!products.length){$('#empty-state h3').textContent='New products are on the way';$('#empty-state p').textContent='Products will appear here after sellers publish them.';}
  $('#search-status').textContent=query.trim()||selectedCategory!=='All'?`${matches.length} product${matches.length===1?'':'s'} found${selectedCategory!=='All'?` in ${selectedCategory}`:''}`:'';
  updateArrows(shelf);
}
function initializeHome(){
  $('#new-products').replaceChildren(...products.filter(product=>product.isNew).map(product=>createCard(product,true)));
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{selectedCategory=button.dataset.category;$$('[data-category]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});renderRecommendations();}));
  $('#product-search').addEventListener('input',renderRecommendations);
  $('#reset-search').addEventListener('click',()=>{$('#product-search').value='';$('[data-category="All"]').click();$('#product-search').focus();});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('#product-search').focus();}});
  if(!products.some(p=>p.isNew)){const empty=element('p','notice-text','No newly added products yet. New listings will appear here.');$('#new-products').after(empty);}
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
  const seller=Store.db.store(product.sellerId);if(seller){const sellerLink=element('a','text-link','Sold by '+seller.profile.name+' \u2192');sellerLink.href='seller.html?id='+encodeURIComponent(product.sellerId);$('.single-product-copy').append(sellerLink);}
  if(product.stock===0){$('#add-to-cart').disabled=true;$('#add-to-cart').textContent='Out of stock';}
  if(product.isCustom){$('.product-badge').textContent='SELLER COLLECTION';$('.price-caption').textContent='Price in USD';}
  const quantity=$('#product-quantity');
  const quantityMax=Math.max(1,stockLimit(product));quantity.max=String(quantityMax);
  function normalizeQuantity(){const value=Number(quantity.value);quantity.value=Number.isFinite(value)?Math.max(1,Math.min(quantityMax,Math.floor(value))):1;$('#quantity-down').disabled=Number(quantity.value)<=1;$('#quantity-up').disabled=Number(quantity.value)>=quantityMax;return Number(quantity.value);}
  quantity.addEventListener('change',normalizeQuantity);
  $('#quantity-down').addEventListener('click',()=>{quantity.value=normalizeQuantity()-1;normalizeQuantity();});
  $('#quantity-up').addEventListener('click',()=>{quantity.value=normalizeQuantity()+1;normalizeQuantity();});
  normalizeQuantity();
  $('#add-to-cart').addEventListener('click',async()=>{if(product.stock===0)return;const button=$('#add-to-cart');button.disabled=true;try{const count=normalizeQuantity();const before=cart[product.id]||0;cart[product.id]=Math.min(99,product.stock,before+count);if(await saveCart())toast(cart[product.id]===before?'The available stock is already in your cart.':`${cart[product.id]-before} x ${product.name} added to your cart.`);}finally{button.disabled=false;}});
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
