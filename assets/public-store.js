'use strict';
(() => {
 const id=new URLSearchParams(location.search).get('id');const store=StoreDemo.db.store(id);const container=document.getElementById('public-store');
 if(!store){const title=document.createElement('h1');title.textContent='Store not found';container.append(title);document.getElementById('store-empty').hidden=false;return;}
 const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='MEET THE SELLER / DEMO STOREFRONT';const title=document.createElement('h1');title.textContent=store.profile.name;const tagline=document.createElement('p');tagline.className='store-tagline';tagline.textContent=store.profile.tagline;const description=document.createElement('p');description.textContent=store.profile.description;container.className='public-store-banner';container.append(eyebrow,title,tagline,description);document.title=store.profile.name+' | LK Tech Store';
 const list=store.products.filter(p=>p.status==='active');document.getElementById('store-products').replaceChildren(...list.map(p=>createCard(p)));document.getElementById('store-empty').hidden=list.length!==0;updateArrows(document.getElementById('store-products'));
})();
