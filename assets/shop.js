/* Buyer presentation and interactions. Accounts and persistent records stay in Supabase. */
(() => {
 'use strict';
 const collections=['All','Laptops','Mobiles','PC & Gaming','Accessories','Monitors','Components','Smartwatch','Audio'];
 const patterns={Laptops:/\b(laptops?|notebooks?|macbooks?|chromebooks?)\b/i,Mobiles:/\b(mobiles?|phones?|smartphones?|iphone\w*)\b/i,'PC & Gaming':/\b(pc|gaming|consoles?|playstation|xbox|desktops?|controllers?|keyboards?|mice|mouse)\b/i,Accessories:/\b(accessories|accessory|chargers?|cables?|adapters?|hubs?|cases?|stands?)\b/i,Monitors:/\b(monitors?|displays?|screens?)\b/i,Components:/\b(components?|processors?|graphics|gpu|cpu|motherboards?|memory|ram|ssd|power supply)\b/i,Smartwatch:/\b(smartwatches?|smart watches|smart watch|wearables?|watches|watch)\b/i,Audio:/\b(audio|headphones?|earbuds?|speakers?|microphones?|headsets?)\b/i};
 const categoryKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
 const aliases={Laptops:['laptop','notebook','notebooks'],Mobiles:['mobile','phone','phones','smartphone','smartphones'],'PC & Gaming':['pc','gaming','pc gaming','computers','desktop','desktops'],Accessories:['accessory'],Monitors:['monitor'],Components:['component','computer components'],Smartwatch:['smartwatches','smart watch','smart watches'],Audio:[]};
 function collectionFor(category){const key=categoryKey(category);return collections.find(name=>categoryKey(name)===key||(aliases[name]||[]).includes(key));}
 const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
 const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const price=value=>window.StoreMoney?.format(value)||new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
 function matchesCollection(product,name){
  if(!name||categoryKey(name)==='all')return true;
  const requested=collectionFor(name),assigned=collectionFor(product.category);
  if(categoryKey(product.category)===categoryKey(name))return true;
  if(assigned)return assigned===requested;
  // Current records relate products to lk_categories.name, not invented category IDs.
  // Infer only legacy broad Tech records; explicit seller categories take precedence.
  if(!requested||!['','tech','technology','electronics'].includes(categoryKey(product.category)))return false;
  const inferred=['Accessories','Laptops','Monitors','Components','Smartwatch','Audio','Mobiles','PC & Gaming'].find(key=>patterns[key].test(product.name));
  return inferred===requested;
 }
 function offer(product){const current=Number(product.price),original=Number(product.originalPrice??product.compareAtPrice),percent=Math.floor((original-current)/original*100);return Number.isFinite(original)&&Number.isFinite(current)&&current>0&&original>current&&percent>0?{original,percent}:null;}
 function activityKey(){return 'lk-buyer-views-v1:'+Store.auth.current('customer')?.id;}
 function history(){try{const value=JSON.parse(localStorage.getItem(activityKey())||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string').slice(0,40):[];}catch{return [];}}
 function recordView(product){try{localStorage.setItem(activityKey(),JSON.stringify([product.id,...history().filter(id=>id!==product.id)].slice(0,40)));}catch{}}
 function recommend(items){const viewed=history(),catalog=window.products||items,scores=new Map();viewed.forEach((id,index)=>{const p=catalog.find(p=>p.id===id);if(p)scores.set(p.category,(scores.get(p.category)||0)+(40-index));});return [...items].sort((a,b)=>(scores.get(b.category)||0)-(scores.get(a.category)||0));}
 function notify(text){const n=$('#toast');if(!n)return;n.textContent=text;n.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>n.classList.remove('visible'),4000);}
 function missing(error){return error.code==='PGRST202'?'This feature needs the Buyer experience database upgrade. Please contact the store owner.':error.message;}
 let saved=new Set(),wishlistLoaded=false,wishlistPromise=null,wishlistBusy=false;
 function syncWishlist(){all('.wishlist-toggle').forEach(button=>{const active=saved.has(button.dataset.productId);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',(active?'Remove from':'Add to')+' wishlist: '+button.dataset.productName);button.classList.toggle('saved',active);button.disabled=wishlistBusy;});const count=$('#wishlist-count');if(count){count.textContent=saved.size;count.hidden=!saved.size;}}
 function loadWishlist(){if(wishlistPromise)return wishlistPromise;wishlistPromise=Store.request('/wishlist').then(ids=>{saved=new Set(ids);wishlistLoaded=true;syncWishlist();return ids;}).finally(()=>{wishlistPromise=null;});return wishlistPromise;}
 async function toggleWishlist(product){if(wishlistBusy)return;wishlistBusy=true;syncWishlist();try{if(!wishlistLoaded)await loadWishlist();const next=!saved.has(product.id);saved=new Set(await Store.request('/wishlist','PUT',{productId:product.id,saved:next}));notify(next?'Saved to your wishlist.':'Removed from your wishlist.');if(document.body.dataset.page==='wishlist')renderWishlist();}catch(error){notify(missing(error));}finally{wishlistBusy=false;syncWishlist();}}
 function quickView(product){
  let dialog=$('#quick-view');if(!dialog){dialog=node('dialog','','quick-view');dialog.id='quick-view';dialog.setAttribute('aria-labelledby','quick-view-title');document.body.append(dialog);}dialog.replaceChildren();
  const close=node('button','×','quick-close');close.type='button';close.setAttribute('aria-label','Close quick view');close.addEventListener('click',()=>dialog.close());
  const image=node('img');image.src=productImage(product);image.alt=product.name;image.width=500;image.height=500;
  const copy=node('div','','quick-copy'),title=node('h2',product.name);title.id='quick-view-title';const view=node('a','View product →','primary-button');view.href='product.html?id='+encodeURIComponent(product.id);
  const wish=node('button',saved.has(product.id)?'Remove from wishlist':'Save to wishlist','secondary-button');wish.type='button';wish.addEventListener('click',async()=>{wish.disabled=true;await toggleWishlist(product);wish.textContent=saved.has(product.id)?'Remove from wishlist':'Save to wishlist';wish.disabled=false;});
  copy.append(node('p',productBrand(product)||product.category,'eyebrow'),title,node('p',product.description||product.summary,'quick-description'),node('strong',price(product.price),'detail-price'),node('p',product.stock>0?'In stock':'Currently out of stock','stock-note'),view,wish);dialog.append(close,image,copy);recordView(product);dialog.showModal();
 }
 function decorateCard(card,product,isNew){
  const art=card.querySelector('.product-art'),image=art.querySelector('img');
  const ready=()=>art.classList.add('image-loaded');image.addEventListener('load',ready,{once:true});image.addEventListener('error',()=>{ready();image.src='assets/products/placeholder.svg';},{once:true});if(image.complete)ready();
  const wish=node('button','♡','wishlist-toggle');wish.type='button';wish.dataset.productId=product.id;wish.dataset.productName=product.name;wish.setAttribute('aria-pressed',String(saved.has(product.id)));wish.setAttribute('aria-label',(saved.has(product.id)?'Remove from':'Add to')+' wishlist: '+product.name);wish.addEventListener('click',()=>toggleWishlist(product));card.append(wish);
  const quick=node('button','Quick view','card-quick');quick.type='button';quick.setAttribute('aria-label','Quick view '+product.name);quick.addEventListener('click',()=>quickView(product));card.querySelector('.card-actions').append(quick);
  const deal=offer(product);if(deal){const badge=node('span','−'+deal.percent+'%','discount-badge');card.querySelector('.product-art').append(badge);card.querySelector('.product-price').append(node('s',price(deal.original),'original-price'));}
  if(isNew)card.classList.add('is-new');if(saved.has(product.id))wish.classList.add('saved');
 }
 function renderWishlist(){const list=$('#wishlist-products');if(!list)return;const items=(window.products||[]).filter(p=>saved.has(p.id));list.replaceChildren(...items.map(p=>window.createCard(p)));$('#wishlist-empty').hidden=items.length>0;$('#wishlist-status').textContent=items.length+' available saved product'+(items.length===1?'':'s')+(saved.size>items.length?'. Some saved products are no longer available.':'');syncWishlist();}
 function skeleton(tag='div'){const item=node(tag,'','market-skeleton');item.setAttribute('aria-hidden','true');return item;}
 async function wishlistPage(){
  const status=$('#wishlist-status'),list=$('#wishlist-products');status.textContent='Loading your wishlist…';list.setAttribute('aria-busy','true');list.replaceChildren(...Array.from({length:4},()=>skeleton('li')));$('#wishlist-empty').hidden=true;
  try{await loadWishlist();renderWishlist();}
  catch(error){status.textContent=missing(error);const retry=node('button','Try again','secondary-button');retry.type='button';retry.addEventListener('click',wishlistPage);status.append(retry);list.replaceChildren();}
  finally{list.setAttribute('aria-busy','false');}
 }
 async function ordersPage(page=1){const target=$('#buyer-orders');target.setAttribute('aria-busy','true');target.replaceChildren(node('p','Loading your orders…','section-description'));try{const result=await Store.request('/my/orders?page='+page);target.replaceChildren();if(!result.orders.length){target.append(node('h2','Your next upgrade starts here.'),node('p','You have no recorded orders yet.','section-description'));const browse=node('a','Explore products','primary-button');browse.href='search.html';target.append(browse);}for(const order of result.orders){const card=node('article','','buyer-order'),heading=node('div','','order-heading');heading.append(node('h2','Order '+order.id),node('span',order.status,'order-status'));card.append(heading,node('p',new Date(order.created_at).toLocaleDateString()+' · '+order.seller_name,'section-description'));for(const item of order.items)card.append(node('p',(item?.name||'Product')+' × '+(item?.quantity||1),'order-item'));const total=order.currency==='USD'&&order.payment_method!=='cod'?price(order.total_cents/100):new Intl.NumberFormat('en',{style:'currency',currency:order.currency}).format(order.total_cents/100);card.append(node('strong',total,'order-total'),node('p','Payment: '+order.payment_status,'section-description'));if(order.payment_method==='cod'){card.append(node('p','Payment Method: Cash on Delivery','section-description'));const detail=node('a','View order details','text-link');detail.href='order-confirmation.html?id='+encodeURIComponent(order.checkout_id);card.append(detail);}if(order.tracking)card.append(node('p','Tracking: '+order.tracking));target.append(card);}const pager=node('div','','order-pager');for(const [label,next,disabled] of [['Previous',page-1,page<=1],['Next',page+1,page*20>=result.total]]){const button=node('button',label,'secondary-button');button.type='button';button.disabled=disabled;button.addEventListener('click',()=>ordersPage(next));pager.append(button);}target.append(pager);}catch(error){target.replaceChildren(node('p',missing(error),'form-error'));const retry=node('button','Try again','secondary-button');retry.addEventListener('click',()=>ordersPage(page));target.append(retry);}finally{target.setAttribute('aria-busy','false');}}
 function hero(){
  const host=$('#tech-hero');if(!host)return;
  const candidates=(window.products||[]).filter(p=>p.stock>0),featured=[...candidates.filter(p=>p.isNew),...candidates.filter(p=>!p.isNew)].slice(0,4);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let selected=0,timer=null,paused=reduced.matches,hover=false,focused=false,transition=null;
  const image=$('#hero-product-image'),name=$('#hero-product-name'),dots=$('#hero-dots'),link=$('#hero-product-link'),pause=$('#hero-pause'),controls=host.querySelector('.hero-carousel-controls');
  const displayName=p=>p.name.replace(/\s*\(sample\)\s*/gi,' ').trim()||p.name;
  function show(index){
   selected=(index+featured.length)%featured.length;const p=featured[selected];transition?.cancel();
   image.src=productImage(p);image.alt=displayName(p);image.hidden=false;
   if(!reduced.matches)transition=image.animate?.([{opacity:.25,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}],{duration:300,easing:'ease-out'});
   name.textContent=displayName(p);$('#hero-product-price').textContent=price(p.price);link.href='product.html?id='+encodeURIComponent(p.id);link.hidden=false;$('#hero-new-badge').hidden=!p.isNew;
   for(const [i,dot] of [...dots.children].entries())dot.setAttribute('aria-pressed',String(i===selected));
  }
  image.addEventListener('error',()=>{if(image.getAttribute('src')!=='assets/products/placeholder.svg')image.src='assets/products/placeholder.svg';});
  function schedule(){clearTimeout(timer);timer=null;if(featured.length>1&&!paused&&!hover&&!focused&&!document.hidden)timer=setTimeout(()=>{show(selected+1);schedule();},6500);}
  function syncPause(){pause.textContent=paused?'Play slides':'Pause slides';pause.setAttribute('aria-pressed',String(paused));schedule();}
  if(!featured.length){image.hidden=true;name.textContent='Find your next upgrade';$('#hero-product-price').textContent='Explore the collection';link.hidden=true;$('#hero-new-badge').hidden=true;controls.hidden=true;return;}
  dots.replaceChildren();featured.forEach((p,i)=>{const button=node('button');button.type='button';button.setAttribute('aria-label','Show '+displayName(p));button.addEventListener('click',()=>{show(i);schedule();});dots.append(button);});
  show(0);controls.hidden=featured.length<2;pause.hidden=featured.length<2;
  pause.addEventListener('click',()=>{paused=!paused;if(!paused){hover=false;focused=false;}syncPause();});
  // Only the content suspends rotation on hover/focus; controls must not block Play.
  for(const region of [host.querySelector('.hero-copy'),host.querySelector('.hero-visual')]){
   region.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hover=true;schedule();}});
   region.addEventListener('pointerleave',()=>{hover=false;schedule();});
  }
  host.addEventListener('focusin',event=>{focused=!controls.contains(event.target);schedule();});
  host.addEventListener('focusout',event=>{focused=host.contains(event.relatedTarget)&&!controls.contains(event.relatedTarget);schedule();});
  document.addEventListener('visibilitychange',schedule);reduced.addEventListener?.('change',()=>{if(reduced.matches){paused=true;transition?.cancel();}syncPause();});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);transition?.cancel();});window.addEventListener('pageshow',schedule);syncPause();
 }
 window.Shop={collections,collectionFor,categoryKey,matchesCollection,offer,recommend,recordView,decorateCard,quickView};
 window.addEventListener('DOMContentLoaded',async()=>{
  await window.customerReady;if(Store.accessReady&&!(await Store.accessReady))return;
  const menu=$('#mobile-nav-toggle'),nav=$('#market-nav');menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('mobile-open',open);});
  const page=location.pathname.split('/').pop()||'index.html';all('#market-nav>a').forEach(link=>{const target=new URL(link.href,location.href);if(target.pathname.endsWith('/'+page)&&(page!=='search.html'||new URLSearchParams(location.search).get('deals')==='1'))link.setAttribute('aria-current','page');});
  $('#header-notifications')?.addEventListener('click',()=>window.StoreProfile.openNotifications());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){all('.shop-dropdown[open]').forEach(el=>el.removeAttribute('open'));if(menu){menu.setAttribute('aria-expanded','false');nav.classList.remove('mobile-open');}}});
  document.addEventListener('click',event=>all('.shop-dropdown[open]').forEach(el=>{if(!el.contains(event.target))el.removeAttribute('open');}));
  hero();const current=new URLSearchParams(location.search).get('id');if(document.body.dataset.page==='product'){const p=(window.products||[]).find(p=>p.id===current);if(p)recordView(p);}
  if(document.body.dataset.page==='wishlist')await wishlistPage();else loadWishlist().catch(()=>{});
  if(document.body.dataset.page==='orders')await ordersPage();
 });
})();
