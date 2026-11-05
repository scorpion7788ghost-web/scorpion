const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attrs={};this.value='';this.hidden=false;this.validity={badInput:false};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this.attrs[key]=String(value);}
 removeAttribute(key){delete this.attrs[key];}
 addEventListener(key,callback){(this.events[key]??=[]).push(callback);}
 async fire(key,extra={}){const event={target:this,preventDefault(){this.prevented=true;},...extra};for(const callback of this.events[key]||[])await callback(event);return event;}
 contains(target){return this===target||this.children.some(child=>child.contains?.(target));}
 focus(){this.focused=true;}
 scrollIntoView(){this.scrolled=true;}
}
const data=[
 {id:'product_a',name:'Acme Headphones',brand:'Acme',category:'Tech',price:49.99,summary:'Wireless sound',image:'photo'},
 {id:'product_b',name:'Acme Keyboard',brand:'Acme',category:'Tech',price:79.99,summary:'Quiet keys',image:'photo'},
 {id:'product_c',name:'USB Cable',category:'Accessories',price:9.99,summary:'Desk cable',image:'photo'}
];
async function app(page='home',search=''){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const doc=new Node();Object.assign(doc,{body:{dataset:{page}},activeElement:{tagName:'BODY'},querySelector:get,createElement:tag=>new Node(tag)});
 get('#suggestions-panel').hidden=true;get('#header-search-form').append(get('#header-product-search'),get('#suggestions-panel'));
 let visited='',replaced='';
 const win={customerReady:Promise.resolve(),location:{search,assign:url=>{visited=url;}},history:{replaceState:(a,b,url)=>{replaced=url;}},createCard:product=>{const card=new Node('li');card.product=product;return card;}};
 const context={window:win,document:doc,Store:{safeImage:v=>v},URLSearchParams,Intl};vm.createContext(context);
 vm.runInContext(fs.readFileSync('assets/catalog.js','utf8'),context);context.products=win.products;context.products.push(...data);
 vm.runInContext(fs.readFileSync('assets/search.js','utf8'),context);await win.searchReady;
 return {get,doc,win,visited:()=>visited,replaced:()=>replaced};
}
async function main(){
 const home=await app(),input=home.get('#header-product-search');input.value='Acme';await input.fire('input');
 assert.equal(home.get('#search-suggestions').children.length,2);assert.equal(input.attrs['aria-expanded'],'true');
 assert.equal(home.get('#search-suggestions').children[0].href,'search.html?q=Acme+Headphones&product=product_a');
 assert.equal(home.get('#all-search-results').href,'search.html?q=Acme');
 await input.fire('keydown',{key:'ArrowDown'});assert.equal(input.attrs['aria-activedescendant'],'suggestion-0');
 await input.fire('keydown',{key:'Enter'});assert.equal(home.visited(),'search.html?q=Acme+Headphones&product=product_a');
 await input.fire('keydown',{key:'Escape'});assert(home.get('#suggestions-panel').hidden);assert(!input.attrs['aria-activedescendant']);
 input.value='nothing';await input.fire('input');assert.equal(home.get('#search-suggestions').children.length,0);assert.match(home.get('#suggestion-status').textContent,/No matching/);
 await home.get('#header-search-form').fire('submit');assert.equal(home.visited(),'search.html?q=nothing');
 input.value='';await input.fire('input');assert(home.get('#suggestions-panel').hidden);
 input.value='Acme';await input.fire('input');await home.doc.fire('pointerdown',{target:new Node()});assert(home.get('#suggestions-panel').hidden);
 await input.fire('focus');await input.fire('keydown',{key:'ArrowUp'});assert.equal(input.attrs['aria-activedescendant'],'suggestion-1');
 const results=await app('search','?q=Acme&category=Tech&brand=brand%3Aacme&min=40&max=50');
 assert.equal(results.get('#result-products').children.length,1);assert.equal(results.get('#result-products').children[0].product.id,'product_a');
 assert.equal(results.get('#header-product-search').value,'Acme');
 results.get('#price-min').value='100';await results.get('#price-min').fire('input');assert(!results.get('#filter-error').hidden);assert(results.get('#results-empty').hidden);
 await results.get('#clear-filters').fire('click');assert.equal(results.get('#result-products').children.length,2);assert.equal(results.replaced(),'search.html?q=Acme');
 results.get('#filter-category').value='Accessories';await results.get('#filter-category').fire('change');assert(!results.get('#results-empty').hidden);assert(results.replaced().includes('category=Accessories'));
 const selected=await app('search','?q=Acme+Headphones&product=product_a');assert.equal(selected.get('#result-products').children.length,1);
 const missing=await app('search','?product=removed');assert(!missing.get('#results-empty').hidden);
 const all=await app('search');assert.equal(all.get('#result-products').children.length,3);
 all.get('#filter-brand').value='missing:';await all.get('#filter-brand').fire('change');assert.equal(all.get('#result-products').children.length,1);
 const restored=await app('search','?brand=missing%3A');assert.equal(restored.get('#result-products').children[0].product.id,'product_c');
 const unsafe=await app('search','?q=%3Cimg%20src%3Dx%3E');assert.equal(unsafe.get('#results-title').textContent,'Results for “<img src=x>”');assert.equal(unsafe.get('#results-title').children.length,0);
 console.log('PASS: suggestions, keyboard selection/dismissal, separate search navigation, exact product selection, combined URL filters, refresh restoration, reset, empty/invalid states, and text-safe query rendering.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
