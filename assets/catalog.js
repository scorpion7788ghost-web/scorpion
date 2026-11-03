"use strict";
const products=[];
const productStorageKey='lk-demo-catalog';
function reloadProducts(){products.splice(0,products.length,...StoreDemo.db.catalog());}
function findProducts(query,category){const term=query.trim().toLowerCase();return products.filter(product=>(category==='All'||product.category===category)&&`${product.name} ${product.category} ${product.summary}`.toLowerCase().includes(term));}
function productImage(product){return StoreDemo.safeImage(product.image);}
reloadProducts();
