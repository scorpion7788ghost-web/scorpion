const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function account({owner=false,failure=false}={}){
 const nodes=new Map(),controls=[{disabled:false},{disabled:false}],updates=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',handlers:{},querySelectorAll:()=>controls,addEventListener(k,fn){this.handlers[k]=fn;},append(){}});return nodes.get(id);};
 const user={name:'Scorpion',username:'scorpion',role:'customer'};
 const context={window:{StoreCloud:{enabled:true}},document:{body:{dataset:{portal:'customer'}},getElementById:get,querySelectorAll:()=>[],createElement:()=>({})},Store:{ready:Promise.resolve(),accessReady:Promise.resolve(true),auth:{current:()=>user,updateAccount:async(...args)=>{updates.push(args);return user;}},request:async()=>{if(failure)throw Error('Unavailable');return {isAdmin:true,isOwner:owner};},getCart:()=>({}),getOrders:()=>[]}};
 await vm.runInNewContext(fs.readFileSync('assets/account.js','utf8'),context);
 await get('account-form').handlers.submit({preventDefault(){}});
 return {get,controls,updates};
}
async function main(){
 const locked=await account({owner:true});assert(locked.controls.every(c=>c.disabled));assert.equal(locked.updates.length,0);assert.match(locked.get('account-identity').textContent,/Owner account/);assert.match(locked.get('account-message').textContent,/cannot be edited/);
 const normal=await account();assert(normal.controls.every(c=>!c.disabled));assert.equal(normal.updates.length,1);
 const failed=await account({failure:true});assert(failed.controls.every(c=>c.disabled));assert.equal(failed.updates.length,0);
 console.log('PASS: Owner account read-only form, programmatic submit guard, normal account edits, and fail-closed permission errors.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
