window.sellerReady=(async()=>{
await Store.ready;
'use strict';
const productCategories=['Tech','Home','Accessories','Lifestyle'];
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const sellerUser=Store.auth.current('seller');
let sellerStore=null;
let toastTimer;
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function statusPill(status){return el('span','status-pill '+status.toLowerCase(),status);}
function imageFor(product){const image=el('img');image.src=Store.safeImage(product.image);image.alt=product.name;image.loading='lazy';return image;}
function refreshSeller(){sellerStore=Store.db.requireSeller(sellerUser.id);return sellerStore;}
function productCell(product){const node=el('div','table-product');const art=el('div','table-product-art');art.style.background=product.color;art.append(imageFor(product));const copy=el('div');copy.append(el('strong','',product.name),el('small','',product.sku||product.category));node.append(art,copy);return node;}
function inventory(){
 refreshSeller();const query=$('#inventory-search').value.trim().toLowerCase(),status=$('#inventory-status').value;
 const products=sellerStore.products.filter(p=>(status==='all'||p.status===status)&&`${p.name} ${p.sku}`.toLowerCase().includes(query));
 $('#inventory-count').textContent=products.length+' products';$('#inventory-empty').hidden=products.length!==0;
 $('#inventory-rows').replaceChildren(...products.map(product=>{
  const row=el('tr');const name=el('td');name.append(productCell(product));const state=el('td');state.append(statusPill(product.status));const stock=el('td',product.stock<5?'low-stock':'',product.stock+' available');const price=el('td','',money(product.price));const actions=el('td','table-actions');const edit=el('a','','Edit');edit.href='edit-product.html?id='+encodeURIComponent(product.id);edit.setAttribute('aria-label','Edit '+product.name);const archive=el('button','',product.status==='archived'?'Restore draft':'Archive');archive.setAttribute('aria-label',(product.status==='archived'?'Restore ':'Archive ')+product.name);archive.addEventListener('click',async()=>{try{await Store.db.setProductStatus(sellerUser.id,product.id,product.status==='archived'?'draft':'archived');inventory();toast('Product status updated in your own store.');}catch(error){toast(error.message);}});actions.append(edit,archive);row.append(name,state,stock,price,actions);return row;
 }));
}
function dashboard(){
 const products=sellerStore.products;$('#dashboard-name').textContent=sellerUser.name.split(' ')[0];
 const metrics=[['Total products',products.length,'Your complete collection'],['Active listings',products.filter(p=>p.status==='active').length,'Ready on your seller page'],['Stock units',products.filter(p=>p.status!=='archived').reduce((sum,p)=>sum+p.stock,0),'Across your available inventory'],['Orders',sellerStore.orders.length,'Orders received by your store']];
 $('#dashboard-stats').replaceChildren(...metrics.map(([label,value,note])=>{const card=el('div','stat-card');card.append(el('span','',label),el('strong','',String(value)),el('small','',note));return card;}));
 $('#recent-products').replaceChildren(...products.slice(0,5).map(p=>{const row=el('div','recent-product');row.append(productCell(p),statusPill(p.status));const link=el('a','',money(p.price)+' \u2197');link.href='edit-product.html?id='+encodeURIComponent(p.id);row.append(link);return row;}));
 if(!products.length)$('#recent-products').append(el('p','seller-empty','Your first product belongs here. Add something new to get started.'));
 $('#dashboard-shop-link').href='shop.html?id='+encodeURIComponent(sellerUser.id);
}
function orders(){
 refreshSeller();$('#orders-empty').hidden=sellerStore.orders.length!==0;
 $('#order-rows').replaceChildren(...sellerStore.orders.map(order=>{const row=el('tr');row.append(el('td','',order.id),el('td','',order.customer),el('td','',sellerStore.products.find(p=>p.id===order.productId)?.name||order.productId),el('td','',money(order.total)));const control=el('td');const select=el('select','order-select');select.setAttribute('aria-label','Status for '+order.id);for(const value of ['Processing','Shipped','Delivered','Cancelled']){const option=el('option','',value);option.value=value;option.selected=value===order.status;select.append(option);}select.addEventListener('change',async()=>{try{await Store.db.setOrderStatus(sellerUser.id,order.id,select.value);toast('Order status saved.');}catch(error){toast(error.message);orders();}});control.append(select);row.append(control);return row;}));
}
function settings(){
 for(const field of ['name','tagline','description','email','phone','location'])$('#store-'+field).value=sellerStore.profile[field]||'';
 const url=new URL('shop.html?id='+encodeURIComponent(sellerUser.id),location.href).href;$('#settings-shop-link').href=url;$('#settings-shop-link').textContent=url;
 $('#copy-shop-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url);toast('Your unique seller page link has been copied.');}catch{toast('Copy the displayed page address from your browser.');}});
 $('#store-settings-form').addEventListener('submit',async event=>{event.preventDefault();const message=$('#settings-message');try{const input={};for(const field of ['name','tagline','description','email','phone','location'])input[field]=$('#store-'+field).value;sellerStore=await Store.db.updateStore(sellerUser.id,input);$('#sidebar-store-name').textContent=sellerStore.profile.name;message.className='form-success';message.textContent='Your store profile has been saved to the server.';}catch(error){message.className='form-error';message.textContent=error.message;}});
}
async function exportStore(){try{const data=await Store.db.exportStore(sellerUser.id);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=el('a');link.href=url;link.download=sellerUser.id+'-catalog.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Exported your store profile and products.');}catch(error){toast(error.message);}}
function publicShop(){
 const id=new URLSearchParams(location.search).get('id');const data=Store.db.store(id);const target=$('#seller-public-profile');
 if(!data){target.append(el('h1','','Store not found'),el('p','','This seller page is not available.'));return;}
 document.title=data.profile.name+' | Seller Site';target.className='public-store-banner';target.append(el('p','eyebrow','A STORE OF ITS OWN / SELLER SITE'),el('h1','',data.profile.name),el('p','store-tagline',data.profile.tagline),el('p','',data.profile.description));
 const contact=[data.profile.email,data.profile.phone,data.profile.location].filter(Boolean);if(contact.length)target.append(el('p','',contact.join(' / ')));
 const list=data.products.filter(p=>p.status==='active');
 const dialog=el('dialog','shop-dialog');dialog.setAttribute('aria-labelledby','shop-dialog-title');const close=el('button','close-dialog','\u00d7');close.setAttribute('aria-label','Close product details');close.addEventListener('click',()=>dialog.close());const body=el('div','shop-detail');dialog.append(close,body);document.body.append(dialog);
 function openProduct(product){body.replaceChildren();const image=imageFor(product);const title=el('h2','',product.name);title.id='shop-dialog-title';body.append(image,el('p','eyebrow',product.category),title,el('p','',product.description),el('strong','',money(product.price)),el('p','notice-text','Checkout is not enabled yet.'));dialog.showModal();}
 $('#seller-public-products').replaceChildren(...list.map(product=>{const button=el('button','shop-product');const art=el('div','product-art');art.style.setProperty('--card-color',product.color);art.append(imageFor(product));button.append(art,el('span','product-category',product.category),el('h2','',product.name),el('strong','',money(product.price)),el('p','',product.summary));button.addEventListener('click',()=>openProduct(product));return button;}));
 if(!list.length)$('#seller-public-products').append(el('p','seller-empty','This seller is preparing a new collection. Come back soon.'));
 const selected=new URLSearchParams(location.search).get('product');const product=list.find(p=>p.id===selected);if(product)openProduct(product);
}
Object.assign(window,{$,$$,money,el,toast,refreshSeller,productCategories,sellerUser});
Object.defineProperty(window,'sellerStore',{configurable:true,get:()=>sellerStore});
(() => {
 const view=document.body.dataset.view;
 if(view==='shop'){publicShop();return;}
 if(!sellerUser){location.replace('login.html');return;}
 refreshSeller();document.body.classList.remove('auth-pending');
 $('#sidebar-store-name').textContent=sellerStore.profile.name;$('#store-avatar').textContent=sellerStore.profile.name.slice(0,1).toUpperCase();$('#seller-username').textContent='@'+sellerUser.username;$('#public-store-link').href='shop.html?id='+encodeURIComponent(sellerUser.id);$('#year').textContent=new Date().getFullYear();
 $$('[data-signout]').forEach(button=>button.addEventListener('click',async()=>{try{await Store.auth.signOut('seller');location.assign('login.html');}catch(error){toast(error.message);}}));
 $('#sidebar-toggle').addEventListener('click',()=>{const active=document.body.classList.toggle('sidebar-open');$('#sidebar-toggle').setAttribute('aria-expanded',String(active));});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('sidebar-open');$('#sidebar-toggle').setAttribute('aria-expanded','false');}});
 if(view==='dashboard')dashboard();
 if(view==='products'){$('#inventory-search').addEventListener('input',inventory);$('#inventory-status').addEventListener('change',inventory);$('#export-store').addEventListener('click',exportStore);inventory();}
 if(view==='orders')orders();
 if(view==='settings')settings();
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
})();

})();
