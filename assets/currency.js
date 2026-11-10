/* Display-only USD -> LKR conversion. Stored prices and order currencies stay intact. */
(() => {
 'use strict';
 const key='lk-usd-lkr-v1',day=86400000;
 let quote=null;
 const valid=value=>value&&Number.isFinite(value.rate)&&value.rate>0&&value.rate<1000000&&Number.isFinite(value.updated)&&value.updated<=Date.now()+300000&&Date.now()-value.updated<2*day;
 const money={
  get rate(){return quote?.rate||1;},
  get code(){return quote?'LKR':'USD';},
  get note(){return quote?'Approximate LKR prices converted from USD. Rate dated '+new Date(quote.updated).toLocaleDateString()+'.':'Prices in USD. LKR conversion is temporarily unavailable.';},
  format(value){return (quote?'≈ ':'')+new Intl.NumberFormat('en-LK',{style:'currency',currency:money.code,currencyDisplay:'code'}).format(value*money.rate);}
 };
 window.StoreMoney=money;
 money.ready=(async()=>{
  let cached;try{cached=JSON.parse(localStorage.getItem(key));}catch{}
  if(valid(cached))quote=cached;
  if(quote&&Date.now()-quote.updated<day)return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),1500);
  try{
   const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)return;
   const result=await response.json(),next={rate:result.rates?.LKR,updated:result.time_last_update_unix*1000};
   if(result.result!=='success'||result.base_code!=='USD'||!valid(next))return;
   quote=next;try{localStorage.setItem(key,JSON.stringify(next));}catch{}
  }catch{/* Keep a recent quote or show correctly labeled USD. */}
  finally{clearTimeout(timeout);}
 })();
 document.addEventListener('DOMContentLoaded',async()=>{
  await money.ready;
  document.querySelectorAll('.footer-note').forEach(element=>{
   element.textContent=money.note;
   if(quote){const source=document.createElement('a');source.href='https://www.exchangerate-api.com';source.textContent='Rates by ExchangeRate-API';source.rel='noopener noreferrer';source.target='_blank';element.append(document.createTextNode(' '),source);}
  });
  document.querySelectorAll('[data-price-currency]').forEach(element=>element.textContent=money.code+(quote?' · approximate':''));
 });
})();
