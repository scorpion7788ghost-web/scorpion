/* Shared header suggestions and the dedicated Buyer search results page. */
window.searchReady=(async()=>{
 'use strict';
 await window.customerReady;
 if(Store.accessReady&&!(await Store.accessReady))return;
 const $=selector=>document.querySelector(selector);
 const form=$('#header-search-form'),input=$('#header-product-search');
 if(!form||!input)return;
 const panel=$('#suggestions-panel'),list=$('#search-suggestions'),status=$('#suggestion-status');
 const params=new URLSearchParams(window.location.search);
 const query=(params.get('q')||'').slice(0,200).trim();
 const isResults=document.body.dataset.page==='search';
 if(isResults)input.value=query;
 let options=[],active=-1;
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
 function node(tag,className,text){const result=document.createElement(tag);if(className)result.className=className;if(text!==undefined)result.textContent=text;return result;}
 function resultUrl(text,productId){const target=new URLSearchParams();if(text.trim())target.set('q',text.trim().slice(0,200));if(productId)target.set('product',productId);return 'search.html'+(target.size?'?'+target.toString():'');}
 function closeSuggestions(){panel.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;options.forEach(option=>option.setAttribute('aria-selected','false'));}
 function highlight(index){
  active=index;options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===active)));
  if(options[active]){input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});}
 }
 function suggest(){
  const term=input.value.trim();active=-1;input.removeAttribute('aria-activedescendant');
  if(!term){list.replaceChildren();options=[];status.textContent='';closeSuggestions();return;}
  const matches=findProducts(term,'All');
  options=matches.slice(0,6).map((product,index)=>{
   const option=node('a','suggestion-option');option.id='suggestion-'+index;option.href=resultUrl(product.name,product.id);
   option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;
   const image=node('img');image.src=productImage(product);image.alt='';image.width=44;image.height=44;
   const copy=node('span','suggestion-copy');copy.append(node('strong','',product.name),node('small','',[product.category,productBrand(product)].filter(Boolean).join(' · ')));
   option.append(image,copy,node('span','suggestion-price',money(product.price)));return option;
  });
  list.replaceChildren(...options);
  status.textContent=options.length?`${options.length} suggested product${options.length===1?'':'s'}`:'No matching suggestions. Try another keyword or view all results.';
  $('#all-search-results').href=resultUrl(term);$('#all-search-results').textContent=`See all results for “${term}”`;
  panel.hidden=false;input.setAttribute('aria-expanded','true');
 }
 input.addEventListener('input',suggest);input.addEventListener('focus',suggest);
 input.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();closeSuggestions();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(panel.hidden)suggest();if(!options.length)return;
   highlight(event.key==='ArrowDown'?(active+1)%options.length:(active<=0?options.length:active)-1);
  }else if(event.key==='Enter'&&!panel.hidden&&active>=0){event.preventDefault();window.location.assign(options[active].href);}
 });
 form.addEventListener('submit',event=>{event.preventDefault();window.location.assign(resultUrl(input.value));});
 document.addEventListener('pointerdown',event=>{if(!form.contains(event.target))closeSuggestions();});
 document.addEventListener('focusin',event=>{if(!form.contains(event.target))closeSuggestions();});
 document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.activeElement.isContentEditable&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();input.focus();}});

 if(!isResults)return;
 const category=$('#filter-category'),brand=$('#filter-brand'),min=$('#price-min'),max=$('#price-max');
 const selectedProduct=params.get('product')||'';
 $('#results-title').textContent=query?`Results for “${query}”`:'All products';
 document.title=query?`Search: ${query} | LK Tech Store`:'Search Products | LK Tech Store';
 $('#results-description').textContent='Refine your results by category, brand, and price.';
 for(const [value,label] of catalogBrands()){const option=node('option','',label);option.value=value;brand.append(option);}
 category.value=['Tech','Home','Accessories','Lifestyle'].includes(params.get('category'))?params.get('category'):'All';
 const requestedBrand=params.get('brand')||'';
 if(requestedBrand&&!catalogBrands().some(([key])=>key===requestedBrand)){const option=node('option','','Brand no longer available');option.value=requestedBrand;brand.append(option);}
 brand.value=requestedBrand;min.value=params.get('min')||'';max.value=params.get('max')||'';
 function render(updateUrl=false){
  const range=catalogPriceRange(min.value,max.value);
  if([min,max].some(field=>field.validity.badInput))range.error='Enter a valid number for the price.';
  [min,max].forEach(field=>field.setAttribute('aria-invalid',String(Boolean(range.error))));
  $('#filter-error').textContent=range.error;$('#filter-error').hidden=!range.error;
  let matches=range.error?[]:findProducts(query,category.value,{...range,brand:brand.value});
  if(selectedProduct)matches=matches.filter(product=>product.id===selectedProduct);
  $('#result-products').replaceChildren(...matches.map(product=>window.createCard(product)));
  $('#result-products').hidden=matches.length===0;
  $('#results-empty').hidden=Boolean(range.error)||matches.length>0;
  $('#search-status').textContent=range.error?'Update the price range to see your results.':`${matches.length} product${matches.length===1?'':'s'} found`;
  $('#clear-filters').disabled=category.value==='All'&&!brand.value&&!min.value&&!max.value&&!range.error;
  if(updateUrl){
   const next=new URLSearchParams();if(query)next.set('q',query);if(selectedProduct)next.set('product',selectedProduct);
   if(category.value!=='All')next.set('category',category.value);if(brand.value)next.set('brand',brand.value);
   if(min.value)next.set('min',min.value);if(max.value)next.set('max',max.value);
   window.history.replaceState(null,'','search.html'+(next.size?'?'+next.toString():''));
  }
 }
 for(const field of [category,brand])field.addEventListener('change',()=>render(true));
 for(const field of [min,max])field.addEventListener('input',()=>render(true));
 function clearFilters(){category.value='All';brand.value='';min.value='';max.value='';render(true);}
 $('#clear-filters').addEventListener('click',clearFilters);$('#reset-result-filters').addEventListener('click',clearFilters);
 render();
})();
