/* Apply before styles paint. Both GitHub Pages sites share this origin/key. */
(() => {
 'use strict';
 const key='lk-store-theme-v1';
 const options=[['plum-dark','Plum Dark'],['plum-light','Plum Light'],['ocean-dark','Ocean Dark'],['ocean-light','Ocean Light']];
 function valid(value){return options.some(([id])=>id===value);}
 function apply(value,persist=false){
  const theme=valid(value)?value:'plum-dark';
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme.endsWith('light')?'light':'dark';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=theme==='plum-light'?'#f6f2f9':theme==='ocean-light'?'#f1f7fb':theme==='ocean-dark'?'#101b27':'#18151e';
  let saved=true;
  if(persist)try{localStorage.setItem(key,theme);}catch{saved=false;}
  window.dispatchEvent(new CustomEvent('lk-theme-change',{detail:{theme,saved}}));
  return saved;
 }
 let saved;try{saved=localStorage.getItem(key);}catch{}
 window.StoreTheme={options,apply,current:()=>document.documentElement.dataset.theme};
 apply(saved);
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.newValue);});
})();
