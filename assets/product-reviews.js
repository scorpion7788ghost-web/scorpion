/* Product-page reviews: the server verifies purchases and owns all authorization. */
window.reviewsReady=(async()=>{
 'use strict';
 await window.customerReady;
 if(Store.accessReady&&!(await Store.accessReady))return;
 const productId=new URLSearchParams(location.search).get('id');
 if(!(window.products||[]).some(product=>product.id===productId))return;
 const $=selector=>document.querySelector(selector),section=$('#product-reviews');
 if(!section)return;
 section.hidden=false;
 const form=$('#review-form'),radios=[...form.querySelectorAll('[name="rating"]')],sort=$('#review-sort');
 let state=null,mine=null,editing=false,editingReview=null,busy=false,loading=false,requestId=0,page=1;
 const node=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
 function message(error){return error.code==='PGRST202'?'Reviews are not available yet. The store owner needs to activate the product reviews database upgrade.':error.message||'Reviews could not be loaded. Please try again.';}
 function error(text){$('#reviews-error').textContent=text;$('#reviews-error').hidden=!text;$('#reviews-retry').hidden=!text;}
 function stars(value){const n=node('span','★★★★★','review-stars');n.style.setProperty('--rating-fill',(value/5*100)+'%');n.setAttribute('role','img');n.setAttribute('aria-label',value+' out of 5 stars');const fill=node('span','★★★★★');fill.setAttribute('aria-hidden','true');n.append(fill);return n;}
 function selection(value){radios.forEach(input=>input.closest('label').classList.toggle('is-filled',Number(input.value)<=value));$('#review-rating-label').textContent=value?value+' out of 5 stars':'Choose your rating';}
 function selected(){return Number(radios.find(input=>input.checked)?.value||0);}
 function lock(){
  form.querySelector('fieldset').disabled=busy;
  for(const id of ['#review-title','#review-body','#review-submit','#review-cancel','#review-edit','#review-delete','#review-delete-confirm','#review-delete-cancel'])$(id).disabled=busy;
  sort.disabled=busy||loading;$('#reviews-previous').disabled=busy||loading||page<=1;$('#reviews-next').disabled=busy||loading||!state||page*state.pageSize>=state.summary.total;
  for(const id of ['#review-submit','#review-edit','#review-delete'])$(id).disabled=busy||loading;
  $('#reviews-retry').disabled=busy||loading;$('#review-submit').textContent=busy?'Saving…':editingReview?'Save changes':'Submit review';
 }
 function startEdit(review){
  editing=true;editingReview=review?{...review}:null;
  form.hidden=false;form.reset();radios.forEach(input=>input.checked=Number(input.value)===(review?.rating||0));
  $('#review-title').value=review?.title||'';$('#review-body').value=review?.body||'';$('#review-character-count').textContent=$('#review-body').value.length+' / 3000';
  $('#review-editor-title').textContent=review?'Edit your review':'Share your experience';$('#review-cancel').hidden=!review;selection(selected());lock();
 }
 function composer(){
  $('#review-composer').hidden=!state;
  $('#review-own').hidden=!mine;$('#review-own-title').textContent=mine?mine.title:'';
  $('#review-eligibility').hidden=Boolean(mine)||Boolean(state?.canReview);$('#review-eligibility').textContent=state?.eligibilityMessage||'';
  if(!mine&&!editing&&state?.canReview)startEdit(null);
  form.hidden=!editing||(!mine&&!state?.canReview);lock();
 }
 function render(){
  const {summary,reviews}=state;
  $('#reviews-average').textContent=summary.total?Number(summary.average).toFixed(1):'—';
  $('#reviews-stars').replaceChildren(stars(summary.average));$('#reviews-total').textContent=summary.total+' review'+(summary.total===1?'':'s');
  const distribution=$('#reviews-distribution');distribution.replaceChildren();
  for(let value=5;value>=1;value--){const count=summary.distribution[String(value)]||0,row=node('div','','review-distribution-row'),bar=node('progress');bar.max=Math.max(1,summary.total);bar.value=count;bar.setAttribute('aria-label',value+' stars: '+count+' reviews');row.append(node('span',value+' ★'),bar,node('span',String(count)));distribution.append(row);}
  const list=$('#reviews-list');list.replaceChildren();
  for(const review of reviews){
   const article=node('article','','product-review'),header=node('div','','review-author'),identity=node('div');
   identity.append(node('strong',review.name||'Customer'));if(review.isMine)identity.append(node('span','Your review','review-mine'));
   const date=node('time',new Date(review.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}));date.dateTime=review.createdAt;
   header.append(identity,date);const details=node('div','','review-meta');details.append(stars(review.rating));
   if(review.verifiedPurchase)details.append(node('span','✓ Verified Purchase','review-verified'));
   if(review.updatedAt!==review.createdAt)details.append(node('span','Edited','review-edited'));
   article.append(header,details,node('h3',review.title),node('p',review.body,'review-body'));list.append(article);
  }
  $('#reviews-empty').hidden=summary.total>0;
  $('#reviews-pagination').hidden=summary.total<=state.pageSize;$('#reviews-page').textContent='Page '+page+' of '+Math.max(1,Math.ceil(summary.total/state.pageSize));
  $('#reviews-summary').hidden=false;$('#reviews-tools').hidden=false;composer();
 }
 async function load(nextPage=page){
  const ticket=++requestId;loading=true;lock();error('');$('#reviews-list').setAttribute('aria-busy','true');$('#reviews-loading').hidden=false;
  try{
   const result=await Store.request('/reviews?'+new URLSearchParams({product:productId,sort:sort.value,page:String(nextPage)}));
   if(ticket!==requestId)return;
   // A deletion in another tab can empty the last page; move to the last valid page.
   const last=Math.max(1,Math.ceil(result.summary.total/result.pageSize));if(nextPage>last)return await load(last);
   state=result;mine=result.mine;page=nextPage;render();
  }catch(failure){if(ticket===requestId)error(message(failure));}
  finally{if(ticket===requestId){loading=false;$('#reviews-loading').hidden=true;$('#reviews-list').setAttribute('aria-busy','false');lock();}}
 }
 radios.forEach(input=>{input.addEventListener('change',()=>selection(selected()));input.closest('label').addEventListener('pointerenter',()=>selection(Number(input.value)));});
 form.querySelector('fieldset').addEventListener('pointerleave',()=>selection(selected()));
 $('#review-body').addEventListener('input',()=>$('#review-character-count').textContent=$('#review-body').value.length+' / 3000');
 $('#review-edit').addEventListener('click',()=>{if(!busy){startEdit(mine);$('#review-title').focus();}});
 $('#review-cancel').addEventListener('click',()=>{editing=false;editingReview=null;composer();});
 sort.addEventListener('change',()=>load(1));$('#reviews-previous').addEventListener('click',()=>load(page-1));$('#reviews-next').addEventListener('click',()=>load(page+1));$('#reviews-retry').addEventListener('click',()=>load());
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||loading||!form.reportValidity())return;
  const title=$('#review-title').value.trim(),body=$('#review-body').value.trim();
  if(!selected()||!title||!body){error('Choose a star rating and enter a review title and description.');return;}
  busy=true;lock();error('');$('#review-feedback').textContent='';
  try{
   mine=await Store.request('/reviews',editingReview?'PATCH':'POST',{productId,id:editingReview?.id,updatedAt:editingReview?.updatedAt,rating:selected(),title,body});
   editing=false;editingReview=null;composer();$('#review-feedback').textContent='Your review has been saved.';await load(1);
  }catch(failure){error(message(failure));}
  finally{busy=false;lock();}
 });
 const dialog=$('#review-delete-dialog');let deleting=null;
 $('#review-delete').addEventListener('click',()=>{if(!busy&&mine){deleting={...mine};$('#review-delete-error').textContent='';dialog.showModal();}});
 $('#review-delete-cancel').addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 $('#review-delete-confirm').addEventListener('click',async()=>{
  if(busy||!deleting)return;busy=true;lock();
  try{await Store.request('/reviews','DELETE',{productId,id:deleting.id,updatedAt:deleting.updatedAt});mine=null;editing=false;editingReview=null;dialog.close();composer();$('#review-feedback').textContent='Your review has been deleted.';await load(1);}
  catch(failure){$('#review-delete-error').textContent=message(failure);}
  finally{busy=false;lock();}
 });
 await load(1);
})();
