'use strict';
(() => {
  const form = $('#add-product-form');
  const draftKey = 'sl-tech-store-product-draft-v1';
  let uploadedImage = '';
  let uploadedName = '';
  let imageBusy = false;
  let imageSequence = 0;
  let saved = false;
  const fields = {name:$('#new-name'),category:$('#new-category'),price:$('#new-price'),summary:$('#new-summary'),description:$('#new-description')};
  function showError(message){$('#editor-error').textContent=message;$('#editor-error').hidden=!message;}
  function values(){return {name:fields.name.value.trim(),category:fields.category.value,price:fields.price.value,summary:fields.summary.value.trim(),description:fields.description.value.trim(),color:form.querySelector('[name="color"]:checked').value,isNew:$('#new-is-new').checked,image:uploadedImage,imageName:uploadedName};}
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
    $('#custom-product-count').textContent=`${getSavedProducts().length} product${getSavedProducts().length===1?'':'s'} added`;
  }
  function markChanged(){if(saved){saved=false;$('#save-product').disabled=false;$('#save-product').textContent='Add product +';$('#editor-success').hidden=true;}showError('');$('#draft-status').textContent='Unsaved changes';preview();}
  form.addEventListener('input',markChanged);
  form.addEventListener('change',preview);
  function busy(value){imageBusy=value;$('#save-product').disabled=value||saved;$('#save-draft').disabled=value;$('#image-dropzone').classList.toggle('processing',value);}
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
  $('#save-draft').addEventListener('click',()=>{
    if(imageBusy)return;
    try{localStorage.setItem(draftKey,JSON.stringify(values()));$('#draft-status').textContent='Draft saved on this browser. Come back whenever you are ready.';showError('');}
    catch{showError('Your draft could not be saved. Browser storage may be full or unavailable. Try removing the photo or freeing storage.');}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();if(imageBusy||saved)return;showError('');
    const data=values();
    for(const field of Object.values(fields))field.setCustomValidity('');
    for(const key of ['name','summary','description'])if(!data[key]){fields[key].setCustomValidity('Please enter some text, not just spaces.');fields[key].reportValidity();return;}
    const id='local-'+(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`);
    const product=sanitizeProduct({...data,id,price:Number(data.price)});
    if(!product){showError('Check your product details. Enter a category, a price from $0.01 to $999,999.99, and the required text.');return;}
    try{
      const existing=getSavedProducts();
      if(existing.length>=30){showError('This browser preview supports up to 30 added products. A shared catalog will need a backend.');return;}
      localStorage.setItem(productStorageKey,JSON.stringify([product,...existing]));
    }catch{showError('The product could not be saved. Browser storage may be full or unavailable. Your form is still here; try removing the photo or freeing storage.');return;}
    reloadProducts();
    try{localStorage.removeItem(draftKey);}catch{/* Product was saved even if draft cleanup fails. */}
    saved=true;$('#save-product').disabled=true;$('#save-product').textContent='Product added';
    $('#view-created-product').href=`product.html?id=${encodeURIComponent(product.id)}`;
    $('#editor-success').hidden=false;$('#draft-status').textContent='Saved to your browser collection.';preview();
    $('#editor-success').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  });
  Object.values(fields).forEach(field=>field.addEventListener('input',()=>field.setCustomValidity('')));
  $('#add-another').addEventListener('click',()=>{imageSequence++;form.reset();uploadedImage='';uploadedName='';saved=false;busy(false);$('#editor-success').hidden=true;$('#save-product').textContent='Add product +';$('#draft-status').textContent='';$('#image-error').textContent='';showError('');preview();fields.name.focus();});
  try{
    const draft=JSON.parse(localStorage.getItem(draftKey)||'null');
    if(draft&&typeof draft==='object'){
      for(const [name,field] of Object.entries(fields))if(typeof draft[name]==='string')field.value=draft[name].slice(0,name==='description'?2000:name==='summary'?100:name==='name'?80:30);
      if(!productCategories.includes(fields.category.value))fields.category.value='';
      const color=[...form.querySelectorAll('[name="color"]')].find(input=>input.value===draft.color);if(color)color.checked=true;
      $('#new-is-new').checked=draft.isNew!==false;
      if(typeof draft.image==='string'&&draft.image.length<=900000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.image)){uploadedImage=draft.image;uploadedName=typeof draft.imageName==='string'?draft.imageName.slice(0,200):'Draft image';}
      $('#draft-status').textContent='Your saved draft has been restored.';
    }
  }catch{$('#draft-status').textContent='No saved draft could be restored. You can start a new product below.';}
  preview();
})();
