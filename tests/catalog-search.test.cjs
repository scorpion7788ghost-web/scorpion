const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},Store:{safeImage:v=>v}};
vm.createContext(context);vm.runInContext(fs.readFileSync('assets/catalog.js','utf8'),context);
context.products=context.window.products;
context.products.push(
 {id:'a',name:'Wireless mouse',summary:'Silent clicks',description:'Travel accessory',category:'Tech',brand:' Logitech ',price:29.99},
 {id:'b',name:'Keyboard',summary:'Wireless keys',category:'Tech',brand:'LOGITECH',price:59.99},
 {id:'c',name:'USB cable',category:'Accessories',brand:'Anker',price:9.99},
 {id:'d',name:'Headphones',category:'Tech',price:79.99},
 {id:'e',name:'Café speaker',category:'Tech',brand:'  ',price:49.99}
);
const ids=items=>Array.from(items,p=>p.id);
const search=(q='',c='All',f={})=>ids(context.findProducts(q,c,f));
assert.deepEqual(search('wireless logitech','Tech',{min:2999,max:2999,brand:'brand:logitech'}),['a']);
assert.deepEqual(search('wireless','All',{min:3000,max:6000}),['b']);
assert.deepEqual(search('', 'Accessories',{brand:'brand:anker',max:999}),['c']);
assert.deepEqual(search('cafe'),['e']);
assert.deepEqual(search('travel'),['a']);
assert.deepEqual(search('','All',{brand:'missing:'}),['d','e']);
assert.deepEqual(search('mouse','Accessories'),[]);
assert.deepEqual(Array.from(context.catalogBrands(),v=>v[0]),['brand:anker','brand:logitech','missing:']);
assert.equal(context.catalogPriceRange('0','0').min,0);
assert.equal(context.catalogPriceRange('','').max,null);
assert.equal(context.catalogPriceRange('29.99','29.99').max,2999);
for(const range of [['80','20'],['-1',''],['NaN',''],['1.234',''],['','1000000'],['1e3','']])assert(context.catalogPriceRange(...range).error);
assert.equal(context.catalogPriceRange('','50').error,'');
console.log('PASS: combined text/category/brand/price filters, inclusive cents, open price bounds, invalid ranges, brand normalization, and legacy unbranded products.');
