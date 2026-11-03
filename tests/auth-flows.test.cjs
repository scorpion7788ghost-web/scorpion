const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function authPage({role='customer',register=false,user=null,admin=false,worker=true,next='',nextUser={role,verificationStatus:'approved'}}={}){
 const nodes=new Map(),calls=[],redirects=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,disabled:false,textContent:'',type:'password',handlers:{},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;}});return nodes.get(id);};
 for(const id of ['auth-form','auth-username','auth-password','auth-confirm','auth-name','auth-email','auth-submit','auth-error','toggle-password'])get(id);
 let current=user;
 const context={document:{body:{dataset:{portal:role,authMode:register?'register':'login',adminLogin:String(admin)}},getElementById:get},URLSearchParams,location:{search:next?'?next='+encodeURIComponent(next):'',replace:url=>redirects.push(url)},Store:{ready:Promise.resolve(),auth:{current:()=>current,async signIn(...args){calls.push(['login',...args]);current=nextUser;},async register(...args){calls.push(['register',...args]);current=nextUser;}},request:async()=>({isAdmin:admin,isWorker:worker})}};
 await vm.runInNewContext(fs.readFileSync('assets/auth.js','utf8'),context);
 return {get,calls,redirects,submit:()=>get('auth-form').handlers.submit({preventDefault(){}})};
}
async function waitingPage({status='pending'}={}){
 const nodes=new Map(),timers=new Map(),redirects=[],events={};let timerId=0,calls=0,resolveRequest=null;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,hidden:true,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(id);};
 const document={hidden:false,getElementById:get,addEventListener:(name,fn)=>{events[name]=fn;}};
 const context={document,location:{replace:url=>redirects.push(url)},window:{addEventListener:(name,fn)=>{events[name]=fn;}},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),Store:{accessReady:Promise.resolve(true),auth:{current:()=>({username:'pending_seller'}),signOut:async()=>{}},request:async()=>{calls++;if(status==='delayed')return new Promise(resolve=>{resolveRequest=resolve;});if(status==='error')throw new Error('Temporary outage');return {user:status==='deleted'?null:{verificationStatus:status}};}}};
 await vm.runInNewContext(fs.readFileSync('seller-site/assets/verification.js','utf8'),context);
 return {get,timers,redirects,events,document,get calls(){return calls;},resolve:value=>resolveRequest(value)};
}
async function main(){
 let page=await authPage({register:true});page.get('auth-password').value='SecretPassword123';page.get('auth-confirm').value='different';await page.submit();assert.equal(page.calls.length,0);assert.match(page.get('auth-error').textContent,/do not match/);
 page.get('auth-confirm').value='SecretPassword123';page.get('auth-name').value='Buyer';page.get('auth-username').value='buyer';await page.submit();assert.equal(page.calls[0][0],'register');assert.equal(page.redirects[0],'index.html');assert.equal(page.get('auth-password').value,'');
 page=await authPage({role:'seller',register:true,nextUser:{role:'seller',verificationStatus:'pending'}});page.get('auth-password').value=page.get('auth-confirm').value='SecretPassword123';await page.submit();assert.equal(page.redirects[0],'verification-pending.html');
 page=await authPage({role:'seller',nextUser:{role:'seller',verificationStatus:'pending'},next:'products.html'});await page.submit();assert.equal(page.redirects[0],'verification-pending.html');
 page=await authPage({role:'seller',user:{role:'seller',verificationStatus:'pending'}});assert.equal(page.redirects[0],'verification-pending.html');
 page=await authPage({role:'seller',user:{role:'seller',verificationStatus:'approved'},next:'https://evil.invalid/'});assert.equal(page.redirects[0],'dashboard.html');
 page=await authPage({role:'worker',user:{role:'worker'}});assert.equal(page.redirects[0],'worker.html');
 page=await authPage({role:'worker',user:{role:'worker'},worker:false});assert.equal(page.redirects.length,0);assert.match(page.get('auth-error').textContent,/Worker access/);
 let waiting=await waitingPage();assert.equal([...waiting.timers.values()][0].ms,15000);await waiting.get('verification-refresh').handlers.click();assert.equal(waiting.calls,1);assert.equal(waiting.redirects.length,0);
 waiting.document.hidden=true;waiting.events.visibilitychange();assert.equal(waiting.timers.size,0);
 waiting=await waitingPage({status:'approved'});await waiting.get('verification-refresh').handlers.click();assert.equal(waiting.redirects[0],'dashboard.html');assert.equal(waiting.timers.size,0);
 waiting=await waitingPage({status:'deleted'});await waiting.get('verification-refresh').handlers.click();assert.equal(waiting.redirects[0],'login.html');
 waiting=await waitingPage({status:'error'});await waiting.get('verification-refresh').handlers.click();assert.equal(waiting.get('verification-error').hidden,false);assert.equal(waiting.redirects.length,0);
 waiting=await waitingPage({status:'delayed'});const check=waiting.get('verification-refresh').handlers.click();await waiting.get('verification-signout').handlers.click();waiting.resolve({user:{verificationStatus:'approved'}});await check;assert.deepEqual(waiting.redirects,['login.html'],'A status response must not reopen the dashboard during sign-out');
 console.log('PASS: buyer/seller registration, password confirmation, pending seller login/registration redirects, safe destinations, Worker login, waiting-page polling/approval/deletion/error states, and sign-out race.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
