const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/access.js','utf8');
async function gate({access='customer',user=null,error='',admin=false,worker=false,portal}={}){
 const removed=[],redirects=[],events={},nodes=new Map();
 const node=()=>({setAttribute(){},append(){},prepend(){},replaceChildren(){},addEventListener(){},textContent:''});
 const document={body:{dataset:{access,portal:portal||(access.startsWith('seller')?'seller':access==='worker'?'worker':'customer')},classList:{remove:name=>removed.push(name)},prepend(){}},getElementById:id=>nodes.get(id)||null,createElement:node,addEventListener(){}};
 const Store={ready:Promise.resolve(),error,auth:{current:()=>user},request:async()=>({isAdmin:admin,isWorker:worker})};
 const context={Store,document,location:{pathname:'/scorpion/product.html',search:'?id=product_abc',replace:url=>redirects.push(url)},window:{addEventListener:(name,fn)=>{events[name]=fn;}}};
 vm.runInNewContext(source,context);return {allowed:await Store.accessReady,removed,redirects,events};
}
async function main(){
 const anon=await gate();assert.equal(anon.allowed,false);assert.equal(anon.removed.length,0);assert.match(anon.redirects[0],/^login.html\?next=product.html%3Fid%3Dproduct_abc$/);
 assert.equal((await gate({access:'seller'})).allowed,false);
 assert.equal((await gate({access:'public'})).allowed,true);
 const signed=await gate({user:{id:'customer_owned'}});assert.equal(signed.allowed,true);assert.deepEqual(signed.removed,['auth-pending']);
 const outage=await gate({user:{id:'customer_owned'},error:'Service unavailable'});assert.equal(outage.allowed,false);assert.equal(outage.removed.length,0);
 assert.equal((await gate({access:'admin',user:{id:'ordinary'}})).allowed,false);
 assert.equal((await gate({access:'admin',user:{id:'approved'},admin:true})).allowed,true);
 assert.equal((await gate({access:'admin',portal:'worker',user:{role:'worker',isAdmin:true},worker:true})).allowed,false,'Worker role or spoofed user metadata cannot grant administrator access');
 assert.equal((await gate({access:'admin',portal:'worker',user:{role:'worker'},admin:true})).allowed,true,'Only a server-confirmed administrator grant permits Worker access to admin pages');
 const adminAnon=await gate({access:'admin'});assert.match(adminAnon.redirects[0],/^admin-login.html/);
 const waiting=await gate({access:'seller',user:{verificationStatus:'pending'}});assert.equal(waiting.allowed,false);assert.equal(waiting.redirects[0],'verification-pending.html');assert.equal(waiting.removed.length,0);
 assert.equal((await gate({access:'seller-pending',user:{verificationStatus:'pending'}})).allowed,true);
 const verifiedWaiting=await gate({access:'seller-pending',user:{verificationStatus:'approved'}});assert.equal(verifiedWaiting.allowed,false);assert.equal(verifiedWaiting.redirects[0],'dashboard.html');
 assert.equal((await gate({access:'seller',user:{verificationStatus:'approved'}})).allowed,true);
 assert.equal((await gate({access:'seller',user:{}})).allowed,false,'Unknown seller approval states fail closed');
 assert.match((await gate({access:'worker'})).redirects[0],/^worker-login.html/);
 assert.equal((await gate({access:'worker',user:{role:'worker'},worker:true})).allowed,true);
 assert.equal((await gate({access:'worker',user:{role:'worker'},worker:false})).allowed,false);
 console.log('PASS: customer/seller sign-in gates, preserved product destinations, public login pages, fail-closed outages, and administrator gating.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
