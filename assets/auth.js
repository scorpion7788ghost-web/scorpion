'use strict';
(async () => {
  await Store.ready;
  const role=document.body.dataset.portal==='seller'?'seller':'customer';
  let registering=false;
  const form=document.getElementById('auth-form');if(!form)return;
  const get=id=>document.getElementById(id);
  const destination=role==='seller'?'dashboard.html':'account.html';
  if(Store.auth.current(role)){location.replace(destination);return;}
  get('switch-auth').addEventListener('click',()=>{registering=!registering;get('register-name-field').hidden=!registering;get('confirm-field').hidden=!registering;get('auth-name').required=registering;get('auth-confirm').required=registering;get('register-email-field').hidden=!registering;get('auth-password').minLength=registering?12:0;get('auth-password').autocomplete=registering?'new-password':'current-password';get('auth-title').textContent=registering?'Start your next chapter.':'Welcome back.';get('auth-subtitle').textContent=registering?'Create your own '+role+' account.':'Sign in to your '+role+' account.';get('auth-submit').textContent=registering?'Create Account +':'Sign In \u2192';get('switch-prompt').textContent=registering?'Already have an account?':'New here?';get('switch-auth').textContent=registering?'Sign In':'Create an account';get('auth-error').hidden=true;});
  get('toggle-password').addEventListener('click',()=>{const input=get('auth-password');const show=input.type==='password';input.type=show?'text':'password';get('toggle-password').textContent=show?'Hide':'Show';get('toggle-password').setAttribute('aria-label',show?'Hide password':'Show password');});
  form.addEventListener('submit',async event=>{event.preventDefault();get('auth-error').hidden=true;const button=get('auth-submit');button.disabled=true;button.textContent='Please wait...';try{if(Store.error)await Store.refresh();if(registering){if(get('auth-password').value!==get('auth-confirm').value)throw new Error('The passwords do not match.');await Store.auth.register(role,{name:get('auth-name').value,username:get('auth-username').value,password:get('auth-password').value,email:get('auth-email')?.value||''});}else await Store.auth.signIn(role,get('auth-username').value,get('auth-password').value);location.assign(destination);}catch(error){get('auth-error').textContent=error.message;get('auth-error').hidden=false;}finally{button.disabled=false;button.textContent=registering?'Create Account +':'Sign In \u2192';}});
})();
