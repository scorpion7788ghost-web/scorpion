/* Server API client. Account credentials and records are never stored in the browser. */
(() => {
 'use strict';
 const state={user:null,stores:[],products:[],sellerStore:null,cart:{},orders:[],csrf:'',portal:document.body?.dataset.portal==='seller'?'seller':'customer'};
 const base=window.STORE_CONFIG?.apiBase||'/api';
 let failure='';
 async function request(path,method='GET',data){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);
  try{
   const headers={Accept:'application/json'};const options={method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers};
   if(method!=='GET'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=state.csrf;options.body=JSON.stringify(data||{});}
   const response=await fetch(base+path,options);const type=response.headers.get('content-type')||'';
   if(!type.includes('application/json'))throw new Error('The account storage server is not connected. Open the website using the PHP server, or configure PHP hosting.');
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Your request could not be saved.');if(result.csrf)state.csrf=result.csrf;return result;
  }catch(error){if(error.name==='AbortError')throw new Error('The storage server took too long to respond. Please try again.');if(error instanceof TypeError)throw new Error('Cannot reach the account storage server. Please check your connection.');throw error;}
  finally{clearTimeout(timeout);}
 }
 function banner(message){let node=document.getElementById('storage-service-status');if(!node){node=document.createElement('div');node.id='storage-service-status';node.setAttribute('role','alert');node.style.cssText='padding:16px 22px;background:#382032;color:#ffd5df;font:13px/1.7 Arial,sans-serif;position:relative;z-index:50;';document.body.prepend(node);}node.textContent=message;node.hidden=!message;}
 async function refresh(){try{const next=await request('/bootstrap');Object.assign(state,next);document.querySelectorAll('[data-customer-link]').forEach(link=>{if(next.customerUrl)link.href=next.customerUrl;});failure='';banner('');return state;}catch(error){failure=error.message;banner(failure);throw error;}}
 const auth={
  current:role=>state.user?.role===role?state.user:null,
  async signIn(role,username,password){await request('/auth/login','POST',{role,username,password});await refresh();return auth.current(role);},
  async register(role,input){await request('/auth/register','POST',{...input,role});await refresh();return auth.current(role);},
  async signOut(){await request('/auth/logout','POST',{});await refresh();},
  async updateAccount(role,input){if(!auth.current(role))throw new Error('Please sign in again.');await request('/me','PATCH',input);await refresh();return auth.current(role);}
 };
 const clone=value=>JSON.parse(JSON.stringify(value));
 const db={
  store:id=>state.stores.find(s=>s.profile.id===id)||(state.sellerStore?.profile.id===id?state.sellerStore:null),
  allStores:()=>clone(state.stores),catalog:()=>clone(state.products),
  requireSeller(id){if(!auth.current('seller')||state.user.id!==id||!state.sellerStore)throw new Error('Please sign in to your own seller account.');return clone(state.sellerStore);},
  async updateStore(id,input){db.requireSeller(id);await request('/seller/store','PATCH',{...input,storeId:id});await refresh();return db.requireSeller(id);},
  async saveProduct(id,input,productId){db.requireSeller(id);const result=await request('/seller/products'+(productId?'/'+encodeURIComponent(productId):''),productId?'PUT':'POST',{...input,storeId:id});await refresh();return result.product;},
  async setProductStatus(id,productId,status){db.requireSeller(id);await request('/seller/products/'+encodeURIComponent(productId)+'/status','PATCH',{status});await refresh();},
  async setOrderStatus(){throw new Error('Order processing is not enabled. No orders have been created.');},
  async exportStore(id){db.requireSeller(id);return request('/seller/export');},
  async saveDraft(id,key,data){db.requireSeller(id);await request('/seller/draft?key='+encodeURIComponent(key),'PUT',data);await refresh();},
  async removeDraft(id,key){db.requireSeller(id);await request('/seller/draft?key='+encodeURIComponent(key),'DELETE',{});await refresh();},
  getDraft(id,key){return db.requireSeller(id).drafts?.[key]||null;}
 };
 function safeImage(value){return typeof value==='string'&&((value.length<=900000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))||value==='assets/products/placeholder.svg')?value:'assets/products/placeholder.svg';}
 window.Store={auth,db,safeImage,request,refresh,state,get error(){return failure;},getCart:()=>clone(state.cart||{}),async saveCart(items){const result=await request('/cart','PUT',{items});state.cart=result.items;return clone(result.items);},getOrders:()=>clone(state.orders)};
 window.Store.ready=refresh().catch(()=>null);
})();
