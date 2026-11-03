'use strict';
(async () => {
  await window.sellerReady;
  if(!sellerUser)return;
  const form = $('#add-product-form');
  const editingId=new URLSearchParams(location.search).get('id');
  const editingProduct=editingId?sellerStore.products.find(p=>p.id===editingId):null;
  if(editingId&&!editingProduct){form.replaceChildren(el('p','form-error','That product does not belong to your store, or it no longer exists.'));$('.preview-column').hidden=true;return;}
  const draftKey=editingId||'new';
  let uploadedImage = '';
  let uploadedName = '';
  let imageBusy = false;
  let imageSequence = 0;
  let saved = false;
  let requestBusy = false;
  let lockedControls = [];
  const fields = {name:$('#new-name'),category:$('#new-category'),price:$('#new-price'),summary:$('#new-summary'),description:$('#new-description'),sku:$('#new-sku'),stock:$('#new-stock'),status:$('#new-status')};
  function showError(message){$('#editor-error').textContent=message;$('#editor-error').hidden=!message;}
  function values(){return {name:fields.name.value.trim(),category:fields.category.value,price:fields.price.value,summary:fields.summary.value.trim(),description:fields.description.value.trim(),color:form.querySelector('[name="color"]:checked').value,isNew:$('#new-is-new').checked,image:uploadedImage,imageName:uploadedName,sku:fields.sku.value.trim(),stock:fields.stock.value,status:fields.status.value};}
  function preview(){
    const data=values();
    $('#preview-name').textContent=data.name||'Your next good find';
    $('#preview-category').textContent=data.category||'YOUR CATEGORY';
    const price=Number(data.price);
    $('#preview-price').textContent=money(Number.isFinite(price)&&price>0?price:0);
    $('#preview-summary').textContent=data.summary||'A short description goes right here.';
    $('#preview-art').style.setProperty('--card-color',data.color);
    $('#preview-image').src=uploadedImage||'assets/products/placeholder.svg';
    $('#preview-image').classList.toggle('uploaded-photo',Boolean(uploadedImage));
    $('#preview-badge').textContent=data.isNew?'JUST ADDED':data.category.toUpperCase()||'YOUR PRODUCT';
    $('#name-count').textContent=`${fields.name.value.length} / 80`;
    $('#summary-count').textContent=`${fields.summary.value.length} / 100`;
    $('#description-count').textContent=`${fields.description.value.length} / 2000`;
    $('#uploaded-image-info').hidden=!uploadedImage;
    $('#uploaded-image-name').textContent=uploadedName||'Product image';
    $('#custom-product-count').textContent=`${Store.db.requireSeller(sellerUser.id).products.length} product${Store.db.requireSeller(sellerUser.id).products.length===1?'':'s'} added`;
  }
  function markChanged(){if(saved){saved=false;$('#save-product').disabled=false;$('#save-product').textContent=editingId?'Save changes':'Add product +';$('#editor-success').hidden=true;}showError('');$('#draft-status').textContent='Unsaved changes';preview();}
  form.addEventListener('input',markChanged);
  form.addEventListener('change',preview);
  function busy(value){imageBusy=value;$('#save-product').disabled=value||saved||requestBusy;$('#save-draft').disabled=value||requestBusy;$('#image-dropzone').classList.toggle('processing',value);}
  function lockEditor(value){
    requestBusy=value;
    if(value){lockedControls=[...form.querySelectorAll('input,select,textarea,button')].map(node=>[node,node.disabled]);lockedControls.forEach(([node])=>{node.disabled=true;});}
    else{lockedControls.forEach(([node,disabled])=>{node.disabled=disabled;});lockedControls=[];}
    busy(imageBusy);
  }
  async function loadImage(file){
    if(!file)return;
    $('#image-error').textContent='';
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){$('#image-error').textContent='Choose a JPG, PNG or WebP image.';return;}
    if(file.size>5*1024*1024){$('#image-error').textContent='That photo is too large. Choose an image under 5 MB.';return;}
    const sequence=++imageSequence;
    busy(true);
    let objectUrl;
    try{
      objectUrl=URL.createObjectURL(file);
      const image=new Image();image.src=objectUrl;await image.decode();
      if(sequence!==imageSequence)return;
      if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error('Choose a smaller image, up to 40 megapixels.');
      const scale=Math.min(1,1000/image.naturalWidth,1000/image.naturalHeight);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('Your browser could not prepare this image. Try another browser.');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let encoded=canvas.toDataURL('image/webp',0.8);
      if(encoded.length>900000)encoded=canvas.toDataURL('image/jpeg',0.65);
      if(encoded.length>900000)throw new Error('This photo needs more storage than the preview allows. Try a smaller image.');
      uploadedImage=encoded;uploadedName=file.name;markChanged();$('#draft-status').textContent='Image ready. Save your draft or add the product.';
    }catch(error){if(sequence===imageSequence)$('#image-error').textContent=error.message||'We could not open that image. Try another file.';}
    finally{if(objectUrl)URL.revokeObjectURL(objectUrl);if(sequence===imageSequence)busy(false);$('#new-image').value='';}
  }
  $('#new-image').addEventListener('change',event=>loadImage(event.target.files[0]));
  const zone=$('#image-dropzone');
  ['dragenter','dragover'].forEach(type=>zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('drag-active');}));
  zone.addEventListener('dragleave',event=>{if(!zone.contains(event.relatedTarget))zone.classList.remove('drag-active');});
  zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('drag-active');if(event.dataTransfer.files.length>1){$('#image-error').textContent='Please choose one product image at a time.';return;}loadImage(event.dataTransfer.files[0]);});
  $('#remove-image').addEventListener('click',()=>{imageSequence++;uploadedImage='';uploadedName='';$('#new-image').value='';$('#image-error').textContent='';busy(false);markChanged();});
  $('#save-draft').addEventListener('click',async()=>{
    if(imageBusy||requestBusy)return;const input=values();lockEditor(true);
    try{await Store.db.saveDraft(sellerUser.id,draftKey,input);$('#draft-status').textContent='Draft saved to your seller account. Come back whenever you are ready.';showError('');}
    catch(error){showError(error.message);}
    finally{lockEditor(false);}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(imageBusy||saved||requestBusy)return;showError('');const input=values();lockEditor(true);
    try{
      const product=await Store.db.saveProduct(sellerUser.id,input,editingId||undefined);
      refreshSeller();
      saved=true;$('#save-product').disabled=true;$('#save-product').textContent=editingId?'Changes saved':'Product added';
      $('#view-created-product').href='shop.html?id='+encodeURIComponent(sellerUser.id)+'&product='+encodeURIComponent(product.id);
      $('#view-created-product').textContent='Preview seller page';
      $('#editor-success').hidden=false;$('#draft-status').textContent='Saved to your seller account and visible in the customer store when active.';preview();
      $('#editor-success').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    }catch(error){showError(error.message);}
    finally{lockEditor(false);}
  });
  Object.values(fields).forEach(field=>field.addEventListener('input',()=>field.setCustomValidity('')));
  $('#add-another').addEventListener('click',()=>{if(editingId){location.assign('add-product.html');return;}imageSequence++;form.reset();uploadedImage='';uploadedName='';saved=false;busy(false);$('#editor-success').hidden=true;$('#save-product').textContent=editingId?'Save changes':'Add product +';$('#draft-status').textContent='';$('#image-error').textContent='';showError('');preview();fields.name.focus();});
  try{
    const draft=editingProduct?{...editingProduct,price:String(editingProduct.price),stock:String(editingProduct.stock)}:Store.db.getDraft(sellerUser.id,draftKey);
    if(draft&&typeof draft==='object'){
      for(const [name,field] of Object.entries(fields))if(typeof draft[name]==='string')field.value=draft[name].slice(0,name==='description'?2000:name==='summary'?100:name==='name'?80:name==='sku'?40:30);
      if(!productCategories.includes(fields.category.value))fields.category.value='';
      const color=[...form.querySelectorAll('[name="color"]')].find(input=>input.value===draft.color);if(color)color.checked=true;
      $('#new-is-new').checked=draft.isNew!==false;
      if(typeof draft.image==='string'&&Store.safeImage(draft.image)===draft.image){uploadedImage=draft.image;uploadedName=typeof draft.imageName==='string'?draft.imageName.slice(0,200):'Draft image';}
      $('#draft-status').textContent=editingProduct?'Editing a product from your store.':'Your saved draft has been restored.';
    }
  }catch{$('#draft-status').textContent='No saved draft could be restored. You can start a new product below.';}
  if(editingProduct){$('#editor-page-title').textContent='Edit Product';$('#save-product').textContent='Save changes';}
  preview();
})();
