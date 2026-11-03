'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const demoSecrets = [
  {name:'DATABASE_URL',type:'URL',value:'postgres://demo:example@localhost:5432/app'},
  {name:'FEATURE_FLAG',type:'JSON',value:'{"new_dashboard":true}'},
  {name:'LOGGING',type:'Boolean',value:'true'},
  {name:'MAX_CONNECTIONS',type:'Number',value:'100'},
  {name:'STRIPE_TEST_KEY',type:'String',value:'demo_placeholder_not_a_real_key'}
];
let revealAll = false;
let toastTimeout;
function toast(message){ $('#toast').textContent=message; $('#toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),3500); }
function renderSecrets(){
  const query=$('#secret-search').value.trim().toLowerCase();
  const filtered=demoSecrets.filter(secret=>secret.name.toLowerCase().includes(query));
  $('#secret-count').textContent=`(${filtered.length})`;
  const table=$('#secret-table'); table.replaceChildren();
  if(!filtered.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='No secrets found. Try another search.';table.append(empty);return;}
  filtered.forEach(secret=>{
    const row=document.createElement('div');row.className='secret-row';
    const icon=document.createElement('span');icon.className='row-icon';icon.textContent='•••';icon.setAttribute('aria-hidden','true');
    const name=document.createElement('code');name.textContent=secret.name;name.title=secret.name;
    const type=document.createElement('span');type.className='secret-type';type.textContent=secret.type;
    const value=document.createElement('button');value.className=`secret-value${revealAll?'':' masked'}`;value.textContent=revealAll?secret.value:'••••••••••••';value.setAttribute('aria-label',`${revealAll?'Hide':'Reveal'} ${secret.name} demo value`);value.setAttribute('aria-pressed',String(revealAll));
    value.addEventListener('click',()=>{const revealed=value.getAttribute('aria-pressed')!=='true';value.textContent=revealed?secret.value:'••••••••••••';value.classList.toggle('masked',!revealed);value.setAttribute('aria-pressed',String(revealed));value.setAttribute('aria-label',`${revealed?'Hide':'Reveal'} ${secret.name} demo value`);});
    const more=document.createElement('span');more.className='row-menu';more.textContent='···';more.setAttribute('aria-hidden','true');
    row.append(icon,name,type,value,more);table.append(row);
  });
}
$('#secret-search').addEventListener('input',renderSecrets);
$('#reveal-all').addEventListener('click',()=>{revealAll=!revealAll;$('#reveal-all').setAttribute('aria-pressed',String(revealAll));$('#reveal-all').setAttribute('aria-label',`${revealAll?'Hide':'Reveal'} demo values`);renderSecrets();});
$('#environment').addEventListener('change',event=>{toast(`Switched to ${event.target.value}. This workspace uses sample data.`);});
const info={
  solutions:['One place for your workflow','Organize sample configuration into development, staging, and production environments. Explore the workspace below to see how a single source of configuration can simplify a team’s workflow.'],
  resources:['A quick way to get oriented','Try searching for DATABASE_URL, switch environments, or reveal a sample value. Use “Take a Tour” for a three-step walkthrough. This is an interactive design concept, with no live infrastructure connected.'],
  pricing:['Free to explore','This Scorpion concept is a free, interactive preview. There are no paid plans, subscriptions, or payment details to enter. Explore the sample workspace and see the design in action.'],
  signin:['You’re already in the demo','No account is needed to explore this concept. Authentication and a live secrets service are not connected. All values shown are illustrative and any changes reset when you refresh.'],
  integrations:['Your tools, working together','The Integrations tab illustrates a workspace designed around GitHub, Vercel, Docker, and AWS. These example connections are visual previews; no external accounts are connected.'],
  access:['Access with a little more clarity','The Access tab shows sample workspace roles. A real implementation could give developers access to specific projects and environments. This preview does not grant or change permissions.'],
  compare:['See what changes between environments','Use the environment selector to explore the interface. A production implementation could compare development and production configurations here. This demo uses the same sample values in each environment.'],
  webhooks:['Keep your workflow in sync','Webhooks can notify your applications when configuration changes. This concept shows where that workflow would live; no webhook endpoints are configured or called.'],
  logs:['A clear view of workspace activity','Select the Logs tab for sample activity, including environment synchronization and credential rotation. These entries are illustrative rather than live audit events.'],
  tokens:['A place for service access','Service tokens would allow applications to retrieve configuration. This design concept does not create, store, or display real access tokens.'],
  rotation:['Fresh credentials, less manual work','The preview illustrates a credential rotation schedule. The AWS_USER card is sample data; no credentials or external services are connected, and no rotation takes place.']
};
function openInfo(key){const [title,description]=info[key];$('#info-title').textContent=title;$('#info-content').replaceChildren();const p=document.createElement('p');p.textContent=description;$('#info-content').append(p);$('#info-dialog').showModal();}
$$('[data-info]').forEach(button=>button.addEventListener('click',()=>{closeMenu();openInfo(button.dataset.info);}));
$$('dialog').forEach(dialog=>{dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});});
$$('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
const menuButton=$('.menu-toggle');
function closeMenu(){menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');$('#navigation').classList.remove('open');}
menuButton.addEventListener('click',()=>{const expanded=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(expanded));menuButton.setAttribute('aria-label',`${expanded?'Close':'Open'} navigation`);$('#navigation').classList.toggle('open',expanded);});
$$('nav a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
function selectTab(name,focus=false){$$('[data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(`#panel-${button.dataset.tab}`).hidden=!active;if(active&&focus)button.focus();});}
$$('[data-tab]').forEach((button,index,tabs)=>{button.addEventListener('click',()=>selectTab(button.dataset.tab));button.addEventListener('keydown',event=>{let target=index;if(event.key==='ArrowRight')target=(index+1)%tabs.length;else if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=tabs.length-1;else return;event.preventDefault();selectTab(tabs[target].dataset.tab,true);});});
function explore(){closeMenu();selectTab('secrets');$('#workspace').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});$('#secret-search').focus({preventScroll:true});toast('Welcome to the demo. Search, reveal, or add a sample secret.');}
$$('[data-explore]').forEach(button=>button.addEventListener('click',explore));
$('.global-search').addEventListener('click',explore);
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();explore();}});
const tour=[
  {title:'Your secrets. One home.',description:'Bring environment variables into a single workspace. In the preview, search for a variable and click its hidden value to reveal the sample data.',example:'backend / dev\n\nDATABASE_URL       ••••••••••\nFEATURE_FLAG       ••••••••••'},
  {title:'Every environment, in order.',description:'Use the environment selector to move between development, staging, and production. This demo keeps the same sample values so you can explore safely.',example:'⑂ dev\n⑂ staging\n⑂ production'},
  {title:'A calmer way to work.',description:'Explore integrations, team roles, and activity using the workspace tabs. You can also add a made-up secret; it stays in memory until you refresh.',example:'1. Search a secret\n2. Reveal a demo value\n3. Try adding your own example'}
];
let tourIndex=0;
function renderTour(){const step=tour[tourIndex];$('#tour-step-number').textContent=`0${tourIndex+1} / 03`;$('#tour-title').textContent=step.title;$('#tour-description').textContent=step.description;$('#tour-example').textContent=step.example;$('#tour-back').disabled=tourIndex===0;$('#tour-next').textContent=tourIndex===2?'Explore workspace →':'Next →';$$('.tour-progress i').forEach((segment,index)=>segment.classList.toggle('current',index<=tourIndex));}
$$('[data-tour]').forEach(button=>button.addEventListener('click',()=>{closeMenu();tourIndex=0;renderTour();$('#tour-dialog').showModal();}));
$('#tour-next').addEventListener('click',()=>{if(tourIndex===2){$('#tour-dialog').close();explore();}else{tourIndex++;renderTour();}});
$('#tour-back').addEventListener('click',()=>{if(tourIndex>0){tourIndex--;renderTour();}});
function openSecretForm(){$('#secret-form').reset();$('#new-secret-name').setCustomValidity('');$('#secret-dialog').showModal();}
$('#add-secret').addEventListener('click',openSecretForm);$('#add-secret-bottom').addEventListener('click',openSecretForm);
$('#new-secret-name').addEventListener('input',()=>$('#new-secret-name').setCustomValidity(''));
$('#secret-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#new-secret-name').value.toUpperCase();if(demoSecrets.some(secret=>secret.name===name)){$('#new-secret-name').setCustomValidity('That name already exists. Choose a different demo name.');$('#new-secret-name').reportValidity();return;}demoSecrets.push({name,type:'String',value:$('#new-secret-value').value});$('#secret-search').value='';renderSecrets();$('#secret-dialog').close();toast(`${name} added to this demo session.`);});
renderSecrets();
