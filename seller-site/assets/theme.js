/* Apply before styles paint. Both GitHub Pages sites share this origin/key. */
(() => {
 'use strict';
 const key='lk-store-theme-v1';
 const options=[['plum-dark','Plum Dark'],['ocean-dark','Ocean Dark'],['black-dark','Black Primary'],['white-light','White Primary']];
 function valid(value){return options.some(([id])=>id===value);}
 function apply(value,persist=false){
  const replacement=value==='plum-light'?'plum-dark':value==='ocean-light'?'ocean-dark':null;
  const theme=replacement||(valid(value)?value:'plum-dark');
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme.endsWith('light')?'light':'dark';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=theme==='black-dark'?'#080808':theme==='white-light'?'#ffffff':theme==='ocean-dark'?'#101b27':'#18151e';
  let saved=true;
  if(persist||replacement)try{localStorage.setItem(key,theme);}catch{saved=false;}
  window.dispatchEvent(new CustomEvent('lk-theme-change',{detail:{theme,saved}}));
  return saved;
 }
 let saved;try{saved=localStorage.getItem(key);}catch{}
 window.StoreTheme={options,apply,current:()=>document.documentElement.dataset.theme};
 apply(saved);
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.newValue);});
})();
