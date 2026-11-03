"use strict";
window.products=[];
function reloadProducts(){products.splice(0,products.length,...Store.db.catalog());}
function findProducts(query,category){const term=query.trim().toLowerCase();return products.filter(product=>(category==='All'||product.category===category)&&`${product.name} ${product.category} ${product.summary}`.toLowerCase().includes(term));}
function productImage(product){return Store.safeImage(product.image);}
