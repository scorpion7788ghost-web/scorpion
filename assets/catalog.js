"use strict";
window.products=[];
function reloadProducts(){products.splice(0,products.length,...Store.db.catalog());}
function catalogText(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function productBrand(product){return typeof product.brand==='string'?product.brand.trim().replace(/\s+/g,' '):'';}
function productBrandKey(product){const brand=productBrand(product);return brand?'brand:'+catalogText(brand):'missing:';}
function catalogBrands(){
 const brands=new Map();
 for(const product of products){const key=productBrandKey(product);if(!brands.has(key))brands.set(key,productBrand(product)||'Brand not specified');}
 return [...brands].sort((a,b)=>a[0]==='missing:'?1:b[0]==='missing:'?-1:a[1].localeCompare(b[1]));
}
function catalogPriceRange(minimum='',maximum=''){
 const values=[minimum,maximum].map(value=>String(value).trim());
 if(values.some(value=>value!==''&&(!/^\d+(\.\d{1,2})?$/.test(value)||Number(value)>999999.99)))return {error:'Enter prices from 0 to 999,999.99 with up to two decimal places.'};
 const [min,max]=values.map(value=>value===''?null:Math.round(Number(value)*100));
 if(min!==null&&max!==null&&min>max)return {error:'Minimum price must be less than or equal to maximum price.'};
 return {min,max,error:''};
}
function findProducts(query,category='All',filters={}){
 const terms=catalogText(query).split(/\s+/).filter(Boolean);
 return products.filter(product=>{
  const price=Math.round(Number(product.price)*100);
  const text=catalogText([product.name,product.category,product.summary,product.description,productBrand(product)].join(' '));
  return (category==='All'||product.category===category)&&(!filters.brand||productBrandKey(product)===filters.brand)
   &&(filters.min==null||(Number.isFinite(price)&&price>=filters.min))
   &&(filters.max==null||(Number.isFinite(price)&&price<=filters.max))&&terms.every(term=>text.includes(term));
 });
}
function productImage(product){return Store.safeImage(product.image);}
