const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/access.js','utf8');
async function gate({access='customer',user=null,error='',admin=false}={}){
 const removed=[],redirects=[],events={},nodes=new Map();
 const node=()=>({setAttribute(){},append(){},prepend(){},replaceChildren(){},addEventListener(){},textContent:''});
 const document={body:{dataset:{access,portal:access==='seller'?'seller':'customer'},classList:{remove:name=>removed.push(name)},prepend(){}},getElementById:id=>nodes.get(id)||null,createElement:node,addEventListener(){}};
 const Store={ready:Promise.resolve(),error,auth:{current:()=>user},request:async()=>({isAdmin:admin})};
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
 const adminAnon=await gate({access:'admin'});assert.match(adminAnon.redirects[0],/^admin-login.html/);
 console.log('PASS: customer/seller sign-in gates, preserved product destinations, public login pages, fail-closed outages, and administrator gating.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
