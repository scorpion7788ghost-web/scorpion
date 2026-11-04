const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function main(){
 const nodes=new Map(),requests=[];
 class Element{constructor(){this.handlers={};this.children=[];this.dataset={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.classList={toggle(){},remove(){}};}append(...a){this.children.push(...a);}prepend(...a){this.children.unshift(...a);}replaceChildren(...a){this.children=a;}setAttribute(){}addEventListener(k,v){this.handlers[k]=v;}querySelectorAll(){return [];}showModal(){this.open=true;}close(){this.open=false;}reset(){}focus(){}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const tabs=['all','worker','customer','seller','admin'].map(role=>{const b=new Element();b.dataset.role=role;return b;});
 const user={id:'customer_self',name:'Scorpion'};
 const other={id:'customer_other',auth_id:'other-id',username:'other',name:'Another Admin',role:'customer',isAdmin:true,email:'old@example.test',created_at:'2026-11-04T00:00:00Z'};
 const context={Date,URLSearchParams,document:{body:{dataset:{portal:'customer'}},getElementById:get,createElement:()=>new Element(),querySelectorAll:selector=>selector==='[data-role]'?tabs:[]},Store:{accessReady:Promise.resolve(true),auth:{current:()=>user},request:async(path,method,data)=>{requests.push({path,method,data});if(path.startsWith('/admin/directory?'))return {users:[{...other,id:user.id,username:'scorpion'},other],total:2};if(path==='/admin/account')return {ok:true};throw Error('Unexpected API call');}}};
 await vm.runInNewContext(fs.readFileSync('assets/admin.js','utf8'),context);
 const ownActions=get('user-rows').children[0].children[4],otherActions=get('user-rows').children[1].children[4];assert.equal(ownActions.children[0].disabled,true);assert.equal(otherActions.children[0].disabled,false);assert.equal(otherActions.children[1].disabled,true,'Admin deletion remains protected');
 otherActions.children[0].handlers.click();assert.equal(get('edit-dialog').open,true);assert.equal(get('edit-access').value,'admin');assert.equal(get('edit-base-role').textContent,'Buyer');
 get('edit-name').value='Edited';get('edit-access').value='standard';get('edit-confirm').checked=true;
 await get('edit-user-form').handlers.submit({preventDefault(){},currentTarget:get('edit-user-form')});
 const update=requests.find(r=>r.path==='/admin/account');assert.equal(update.method,'PATCH');assert.equal(update.data.isAdmin,false);assert.equal(update.data.authId,'other-id');assert.equal(update.data.name,'Edited');assert.equal(get('edit-dialog').open,false);
 tabs[4].handlers.click();for(let i=0;i<6;i++)await Promise.resolve();assert.match(requests.at(-1).path,/role=admin/);assert.equal(get('directory-heading').textContent,'Admins');assert.equal(get('admin-inbox').hidden,true);
 console.log('PASS: Admin side-panel filter, editing another Admin, explicit access change, protected self-edit/deletion, and save completion.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
