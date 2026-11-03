/* Select an existing session on admin pages; the server still decides access. */
(() => {
 if(document.body.dataset.access!=='admin')return;
 const role=new URLSearchParams(location.search).get('portal');
 if(['worker','seller'].includes(role)){
  document.body.dataset.portal=role;
  for(const link of document.querySelectorAll('[data-admin-route],.brand')){
   const url=new URL(link.href,location.href);
   if(['admin.html','seller-reviews.html'].includes(url.pathname.split('/').pop())){url.searchParams.set('portal',role);link.href=url.href;}
  }
 }
})();
