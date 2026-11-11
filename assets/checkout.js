/* COD checkout: authoritative quotes and idempotent orders come from Supabase. */
window.checkoutReady=(async()=>{
 'use strict';
 await window.customerReady;
 if(Store.accessReady&&!(await Store.accessReady))return;
 const $=selector=>document.querySelector(selector),form=$('#checkout-form');
 const node=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
 const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',currencyDisplay:'code'}).format(Number(cents)/100);
 const fields=['name','mobile','email','address','city','district','postalCode','instructions'];
 let quote=null,busy=false,uncertain=false,sequence=0;
 function error(failure){const text=typeof failure==='string'?failure:failure?.code==='PGRST202'?'Checkout is not available yet. Please contact the store.':failure?.message||'';$('#checkout-error').textContent=text;$('#checkout-error').hidden=!text;}
 function loading(text){$('#checkout-loading').textContent=text;$('#checkout-loading').hidden=!text;}
 function lock(){if(!form)return;$('#checkout-fields').disabled=busy;$('#checkout-district').disabled=busy||uncertain;$('#checkout-refresh').disabled=busy||uncertain;$('#place-order').disabled=busy||!quote;$('#place-order').textContent=busy?'Processing…':uncertain?'Check order & retry':'Place Order →';form.setAttribute('aria-busy',String(busy));}
 function itemRow(item){
  const row=node('article','','checkout-item'),image=node('img'),copy=node('div');image.src=Store.safeImage(item.image);image.alt=item.name;image.loading='lazy';image.width=72;image.height=72;
  const link=node('a',item.name);link.href='product.html?id='+encodeURIComponent(item.productId);copy.append(link,node('p','Quantity '+item.quantity+' · '+money(item.unit_cents)+' each'));
  if(item.sku)copy.append(node('p','SKU: '+item.sku));
  row.append(image,copy,node('strong',money(item.line_cents)));return row;
 }
 function showQuote(){
  $('#checkout-items').replaceChildren(...quote.items.map(itemRow));
  for(const [id,key] of [['subtotal','subtotal_cents'],['fee','delivery_fee_cents'],['total','total_cents']])$('#checkout-'+id).textContent=money(quote[key]);
  $('#checkout-quote-note').textContent='Delivery to '+quote.district+'. '+(quote.perSeller?'Delivery charged separately for each seller.':'One delivery fee for this checkout.')+' Orders are grouped by seller.';
  $('#checkout-district').value=quote.district;lock();
 }
 function confirm(id){Store.state.cart={};const count=$('#cart-count');if(count){count.textContent='0';count.setAttribute('aria-label','0 items in cart');}location.replace('order-confirmation.html?id='+encodeURIComponent(id));}
 async function resume(id){const result=await Store.request('/checkout/resume?'+new URLSearchParams({id}));if(result.placed){confirm(id);return true;}quote=result.quote;uncertain=false;showQuote();return false;}
 async function refreshQuote(){
  if(busy||uncertain)return;
  const district=$('#checkout-district').value;quote=null;lock();
  if(!district)return;
  const request=++sequence;busy=true;lock();error('');loading('Checking current prices, stock and delivery…');
  try{const next=await Store.request('/checkout/quote','POST',{district});if(request!==sequence)return;quote=next;history.replaceState(null,'','checkout.html?id='+encodeURIComponent(quote.id));showQuote();}
  catch(failure){error(failure);}finally{if(request===sequence){busy=false;loading('');lock();}}
 }
 function deliveryDetails(delivery){const box=node('section','','checkout-panel');box.append(node('h2','Delivery details'));for(const key of ['name','mobile','email','address','city','district','postalCode','instructions'])if(delivery[key])box.append(node('p',delivery[key],key==='name'?'delivery-name':'checkout-note'));return box;}
 async function confirmation(){
  const id=new URLSearchParams(location.search).get('id');$('#checkout-retry').hidden=true;error('');loading('Loading your order confirmation…');
  try{
   if(!id)throw Error('No order reference was provided. Open My Orders to view your purchases.');
   const result=await Store.request('/checkout/details?'+new URLSearchParams({id}));
   $('#confirmation-reference').textContent='Checkout reference: '+result.id+' · '+new Date(result.createdAt).toLocaleString();
   const content=$('#confirmation-content');content.replaceChildren();
   const overview=node('div','','confirmation-overview'),totals=node('section','','checkout-panel');totals.append(node('h2','Order total'));
   for(const [label,value] of [['Payment Method','Cash on Delivery'],['Subtotal',money(result.subtotal_cents)],['Delivery fee',money(result.delivery_fee_cents)],['Total amount',money(result.total_cents)]]){const row=node('div','','summary-row');row.append(node('span',label),node('strong',value));totals.append(row);}
   overview.append(deliveryDetails(result.delivery),totals);content.append(overview);
   for(const order of result.orders){const card=node('section','','checkout-panel confirmation-order');card.append(node('p',order.seller_name,'eyebrow'),node('h2','Order '+order.id),node('p','Order Status: '+order.status.charAt(0).toUpperCase()+order.status.slice(1),'checkout-note'),node('p','Payment Method: Cash on Delivery','checkout-note'),node('p','Payment Status: '+order.payment_status.charAt(0).toUpperCase()+order.payment_status.slice(1),'checkout-note'));card.append(...order.items.map(itemRow));if(order.tracking)card.append(node('p','Tracking: '+order.tracking));card.append(node('strong','Order total: '+money(order.total_cents)));content.append(card);}
   $('#order-confirmation').hidden=false;
  }catch(failure){error(failure);$('#checkout-retry').hidden=false;}finally{loading('');}
 }
 if(!form){$('#checkout-retry').addEventListener('click',confirmation);await confirmation();return;}
 async function initialize(){
  $('#checkout-retry').hidden=true;loading('Preparing your checkout…');error('');busy=true;lock();
  try{
   const rates=await Store.request('/checkout/delivery'),district=$('#checkout-district');district.replaceChildren(node('option','Select your district'));district.firstChild.value='';
   for(const rate of rates){const option=node('option',rate.district);option.value=rate.district;district.append(option);}
   const savedId=new URLSearchParams(location.search).get('id');
   if(savedId){form.hidden=false;if(await resume(savedId))return;}
   else if(!Object.keys(Store.getCart()).length){$('#checkout-empty').hidden=false;form.hidden=true;return;}
   else form.hidden=false;
   if(!rates.length){form.hidden=true;throw Error('Delivery districts and fees have not been configured yet. Please contact the store.');}
   const user=Store.auth.current('customer');if(!$('#checkout-name').value)$('#checkout-name').value=user?.name||'';
   if(!$('#checkout-email').value)$('#checkout-email').value=user?.email||'';
   if(!quote){const previews=Object.entries(Store.getCart()).map(([id,quantity])=>{const p=(window.products||[]).find(p=>p.id===id);return p?{...p,productId:id,quantity,unit_cents:Math.round(p.price*100),line_cents:Math.round(p.price*100)*quantity}:null;}).filter(Boolean);$('#checkout-items').replaceChildren(...previews.map(itemRow));}
  }catch(failure){error(failure);$('#checkout-retry').hidden=false;}
  finally{busy=false;loading('');lock();}
 }
 $('#checkout-retry').addEventListener('click',initialize);$('#checkout-refresh').addEventListener('click',refreshQuote);$('#checkout-district').addEventListener('change',refreshQuote);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!quote)return;
  busy=true;lock();error('');loading('Checking your order…');
  try{
   if(uncertain){if(await resume(quote.id))return;error('No order was created. Review your details and place your order again, or refresh the summary.');return;}
   // Re-enable required controls for native validation; lock them again before sending.
   $('#checkout-fields').disabled=false;
   const delivery=Object.fromEntries(fields.map(key=>[key,$('#checkout-'+key).value.trim()]));
   if(!form.reportValidity())return;
   if(delivery.mobile.replace(/\D/g,'').length<7||delivery.mobile.replace(/\D/g,'').length>15)throw Error('Enter a valid mobile number.');
   if(new Date(quote.expiresAt)<=new Date())throw Error('Your order summary expired. Refresh it before placing your order.');
   lock();uncertain=true;loading('Placing your Cash on Delivery order…');
   await Store.request('/checkout/place','POST',{id:quote.id,delivery});confirm(quote.id);
  }catch(failure){
   if(uncertain){try{if(await resume(quote.id))return;}catch{/* Keep the same request ID locked until the server confirms its outcome. */}}
   error(failure);$('#checkout-error').scrollIntoView({block:'center',behavior:'smooth'});
  }finally{busy=false;loading('');lock();}
 });
 await initialize();
})();
