/* Price conversion and recommendations: no network or production data. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function currency({cache=null,response=null,fail=false,blocked=false}={}){
 const storage=new Map(cache?[['lk-usd-lkr-v1',JSON.stringify(cache)]]:[]),calls=[];
 const context={window:{},document:{addEventListener(){}},localStorage:{getItem:key=>{if(blocked)throw Error();return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error();storage.set(key,value);}},Intl,Date,AbortController,setTimeout,clearTimeout,
  fetch:async(url,options)=>{calls.push({url,options});if(fail)throw TypeError('offline');return {ok:true,json:async()=>response};}};
 vm.runInNewContext(fs.readFileSync('assets/currency.js','utf8'),context);await context.window.StoreMoney.ready;
 return {money:context.window.StoreMoney,calls,storage};
}
async function main(){
 const recent={rate:300,updated:Date.now()-60000};
 let app=await currency({cache:recent});assert.equal(app.calls.length,0);assert.match(app.money.format(10),/LKR.*3,000\.00/);assert.equal(app.money.rate,300);
 app=await currency({response:{result:'success',base_code:'USD',time_last_update_unix:Math.floor(Date.now()/1000),rates:{LKR:310}}});assert.equal(app.money.rate,310);assert.match(app.money.note,/Approximate/);assert.equal(app.calls[0].options.credentials,'omit');assert(app.storage.has('lk-usd-lkr-v1'));
 app=await currency({fail:true});assert.equal(app.money.code,'USD');assert.match(app.money.format(10),/USD.*10\.00/);assert.match(app.money.note,/unavailable/);
 for(const invalid of [-5,0,Infinity,'300']){app=await currency({response:{result:'success',base_code:'USD',time_last_update_unix:Date.now()/1000,rates:{LKR:invalid}}});assert.equal(app.money.code,'USD');}
 app=await currency({cache:{rate:300,updated:Date.now()-3*86400000},fail:true});assert.equal(app.money.code,'USD','Expired rates must not silently misprice products');
 app=await currency({blocked:true,response:{result:'success',base_code:'USD',time_last_update_unix:Date.now()/1000,rates:{LKR:310}}});assert.equal(app.money.rate,310,'Storage-blocked browsers still convert');
 const storage=new Map(),user={id:'buyer_a'},context={window:{addEventListener(){}},document:{},Store:{auth:{current:()=>user}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
 vm.runInNewContext(fs.readFileSync('assets/shop.js','utf8'),context);
 const shop=context.window.Shop,items=[{id:'laptop',name:'Pro Laptop',category:'Tech',price:100},{id:'audio',name:'Studio Headphones',category:'Audio',price:80},{id:'speaker',name:'Speaker',category:'Audio',price:20}];context.window.products=items;
 assert(shop.matchesCollection(items[0],'Laptops'));assert(!shop.matchesCollection(items[0],'Mobiles'));
 for(const [category,name,collection] of [[' laptop ','Gaming Laptop','Laptops'],['mobile','Phone','Mobiles'],['pc-gaming','Desktop','PC & Gaming'],['accessory','Phone case','Accessories'],['monitor','Gaming Monitor','Monitors'],['computer-components','RAM','Components'],['smart-watches','Watch','Smartwatch'],['audio','Headphones','Audio']]){
  const product={category,name};assert(shop.matchesCollection(product,collection));assert(shop.matchesCollection(product,'All'));
  for(const other of shop.collections.filter(c=>!['All',collection].includes(c)))assert(!shop.matchesCollection(product,other),`${category} must not leak into ${other}`);
 }
 for(const [name,expected] of [['Wireless Headphones','Audio'],['Gaming Laptop','Laptops'],['Phone Case','Accessories'],['Laptop Stand','Accessories'],['Gaming Monitor','Monitors'],['Graphics GPU','Components'],['Smart Watch','Smartwatch'],['Gaming Keyboard','PC & Gaming'],['Smartphone','Mobiles']]){
  for(const category of shop.collections.filter(c=>c!=='All'))assert.equal(shop.matchesCollection({name,category:'Tech'},category),category===expected,name+' / '+category);
 }
 assert(shop.matchesCollection({name:'Camera',category:' Cameras '},'cameras'));
 assert(!shop.matchesCollection({name:'Laptop camera',category:'Cameras'},'Laptops'),'Explicit custom categories override keyword guesses');
 assert.equal(shop.offer(items[0]),null,'Never invent an original price');assert.equal(shop.offer({...items[0],originalPrice:125}).percent,20);assert.equal(shop.offer({...items[0],originalPrice:90}),null);
 shop.recordView(items[1]);assert.equal(shop.recommend(items)[0].id,'audio');assert.equal(items[0].id,'laptop','Do not mutate catalog order');
 user.id='buyer_b';assert.equal(shop.recommend(items)[0].id,'laptop','History must not leak between accounts on a shared browser');
 storage.set('lk-buyer-views-v1:buyer_b','invalid json');assert.equal(shop.recommend(items).length,3);
 const audioProducts=Array.from({length:5},(_,i)=>({id:'sound_'+i,category:'Audio',name:'Speaker '+i,price:20,stock:5}));context.window.products=[...items,...audioProducts];
 assert.equal(shop.changeComparison(audioProducts[0]),'');
 assert.equal(shop.changeComparison(audioProducts[1]),'');
 assert.match(shop.changeComparison(items[0]),/same category/);
 assert.equal(shop.changeComparison(audioProducts[2]),'');assert.equal(shop.changeComparison(audioProducts[3]),'');
 assert.match(shop.changeComparison(audioProducts[4]),/four products/);assert.equal(shop.comparisonItems().length,4);
 assert.equal(shop.changeComparison(audioProducts[0]),'');assert.equal(shop.comparisonItems().length,3);
 user.id='different_buyer';assert.equal(shop.comparisonItems().length,0,'Comparison must be isolated per account');
 storage.set('lk-buyer-compare-v1:different_buyer','["sound_1","sound_1",123,"missing"]');assert.equal(shop.comparisonItems().length,1,'Invalid, duplicate and unavailable IDs excluded');
 storage.set('lk-buyer-compare-v1:different_buyer','{broken');assert.equal(shop.comparisonItems().length,0);
 context.localStorage.setItem=()=>{throw Error('blocked');};assert.match(shop.changeComparison(audioProducts[0]),/unavailable/);
 console.log('PASS: comparison category checks, four-item limit, removal, account isolation, malformed storage and unavailable product handling.');
 console.log('PASS: validated LKR conversion, cache/failure/expiry/blocked-storage behavior, real discounts, collection inference and account-isolated recommendations.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
