/* Executes the actual Edge Function with isolated HTTP doubles. No live accounts. */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=require('node:module').stripTypeScriptTypes(fs.readFileSync('supabase/functions/store-admin/index.ts','utf8')).replace('export function createHandler','function createHandler');
const root='https://isolated.supabase.co',origin='https://scorpion7788ghost-web.github.io';
const adminId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
function app({admin=true,valid=true,protectedTarget=false}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});let data={},status=200,headers={};
  if(url===root+'/auth/v1/user'){data=valid?{id:adminId,user_metadata:{admin:true}}:{error:'expired'};status=valid?200:401;}
  else if(url.endsWith('/rpc/lk_is_admin'))data=admin;
  else if(url.includes('/lk_admins?'))data=url.includes('auth_id=eq.')?(protectedTarget?[{auth_id:userId}]:[]):[{auth_id:adminId}];
  else if(url.includes('/lk_profiles?')){data=url.includes('auth_id=eq.')?[{username:'member',role:'customer'}]:[{auth_id:userId,id:'customer_test',username:'member',name:'Member',role:'customer',email:'',created_at:'2026-01-01'}];headers['content-range']='0-0/1';}
  else if(url===root+'/auth/v1/admin/users')data={id:userId};
  else if(url===root+'/auth/v1/admin/users/'+userId)data={};
  else throw new Error('Unexpected request '+url);
  return new Response(JSON.stringify(data),{status,headers});
 };
 const context={Response,Request,URL,URLSearchParams,AbortSignal,TextDecoder,TextEncoder,Uint8Array,fetch:fetchImpl};
 vm.runInNewContext(source+'\nglobalThis.make=createHandler;',context);
 return {handler:context.make({env:key=>({SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:'server-secret'})[key],fetchImpl}),calls};
}
function req(method='GET',body,headers={},query=''){
 return new Request(root+'/functions/v1/store-admin'+query,{method,headers:{Origin:origin,Authorization:'Bearer user-session',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
async function main(){
 let test=app();let result=await test.handler(req('OPTIONS'));assert.equal(result.status,204);assert.equal(test.calls.length,0);assert.equal(result.headers.get('access-control-allow-origin'),origin);assert.equal(result.headers.get('x-lk-admin-version'),'2');
 result=await test.handler(req('GET',undefined,{Origin:'https://evil.invalid'}));assert.equal(result.status,403);assert.equal(result.headers.get('access-control-allow-origin'),null);assert.equal(test.calls.length,0);
 result=await test.handler(req('GET',undefined,{Authorization:''}));assert.equal(result.status,401);assert.equal(test.calls.length,0);
 result=await test.handler(req('GET',undefined,{Authorization:'Bearer server-secret'}));assert.equal(result.status,401);
 test=app({valid:false});assert.equal((await test.handler(req())).status,401);assert.equal(test.calls.length,1);
 test=app({admin:false});result=await test.handler(req('POST',{role:'seller'}));assert.equal(result.status,403);assert.equal(test.calls.length,2,'Ordinary users cannot reach private data or Auth admin actions');
 assert(test.calls.every(call=>!call.url.includes('/auth/v1/admin/')),'User metadata cannot confer admin permission');
 test=app();result=await test.handler(req());assert.equal(result.status,200);let payload=await result.json();assert.equal(payload.total,1);assert.equal(payload.users[0].username,'member');assert.equal(payload.users[0].isAdmin,false);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(test.calls[0].options.headers.Authorization,'Bearer user-session');assert.equal(test.calls[1].options.headers.Authorization,'Bearer user-session');assert.equal(test.calls[2].options.headers.Authorization,'Bearer server-secret');
 assert(!JSON.stringify(payload).includes('server-secret'));
 const input={role:'seller',name:'Real input in isolated test',username:'New_Seller',email:'seller@example.invalid',password:'ManagedPassword123!'};
 test=app();result=await test.handler(req('POST',input));assert.equal(result.status,201);payload=await result.json();assert.equal(payload.user.username,'new_seller');assert(!JSON.stringify(payload).includes(input.password));
 const created=JSON.parse(test.calls.find(call=>call.url===root+'/auth/v1/admin/users').options.body);assert.equal(created.app_metadata.lk_managed,true);assert.equal(created.email_confirm,true);assert.equal(created.email,'new_seller@seller.lk-store.invalid');assert.equal(created.user_metadata.contact_email,input.email);
 test=app();assert.equal((await test.handler(req('POST',{...input,role:'worker',verification_status:'approved'}))).status,201);
 const workerCreated=JSON.parse(test.calls.find(call=>call.url===root+'/auth/v1/admin/users').options.body);assert.equal(workerCreated.email,'new_seller@worker.lk-store.invalid');assert.equal(workerCreated.app_metadata.lk_managed,true);assert.equal(workerCreated.user_metadata.verification_status,undefined);
 test=app({admin:false});assert.equal((await test.handler(req('POST',{...input,role:'worker'}))).status,403);assert(!test.calls.some(call=>call.url.includes('/auth/v1/admin/')),'Workers and ordinary users cannot create workers');
 test=app();assert.equal((await test.handler(req('GET',undefined,{},'?role=worker'))).status,200);assert(test.calls.some(call=>call.url.includes('role=eq.worker')));
 test=app();assert.equal((await test.handler(req('POST',{...input,role:'admin'}))).status,422);assert(!test.calls.some(call=>call.url.includes('/auth/v1/admin/')));
 assert.equal((await test.handler(req('POST',{...input,password:'short'}))).status,422);
 assert.equal((await test.handler(req('POST',{...input,username:'bad,name'}))).status,422);
 assert.equal((await test.handler(req('POST',{...input,email:'invalid'}))).status,422);
 assert.equal((await test.handler(req('POST',{...input,name:'x'.repeat(9000)}))).status,413);
 assert.equal((await test.handler(req('GET',undefined,{},'?page=0'))).status,422);
 assert.equal((await test.handler(req('GET',undefined,{},'?search=bad%2Cinput'))).status,422);
 test=app();assert.equal((await test.handler(req('DELETE',{authId:adminId,username:'owner'}))).status,403);assert(!test.calls.some(call=>call.options.method==='DELETE'));
 test=app({protectedTarget:true});assert.equal((await test.handler(req('DELETE',{authId:userId,username:'member'}))).status,403);
 test=app();assert.equal((await test.handler(req('DELETE',{authId:userId,username:'wrong'}))).status,422);assert(!test.calls.some(call=>call.options.method==='DELETE'));
 test=app();assert.equal((await test.handler(req('DELETE',{authId:userId,username:'member'}))).status,200);assert.equal(test.calls.at(-1).url,root+'/auth/v1/admin/users/'+userId);assert.equal(test.calls.at(-1).options.method,'DELETE');
 console.log('PASS: administrator verification, spoofed-role rejection, server-only secrets, account listing/creation/deletion, protected administrators, deletion confirmation, validation, CORS, and request limits.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
