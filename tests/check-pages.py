from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self):super().__init__();self.tags=[]
 def handle_starttag(self,t,a):self.tags.append((t,dict(a)))
for folder in [ROOT,ROOT/'seller-site']:
 for path in folder.glob('*.html'):
  parser=Page();text=path.read_text(encoding='utf-8-sig');parser.feed(text)
  ids=[a['id'] for t,a in parser.tags if 'id' in a]
  assert len(ids)==len(set(ids)),(path,'duplicate IDs')
  for tag,attrs in parser.tags:
   if tag=='label' and attrs.get('for'):assert attrs['for'] in ids,(path,'label target')
   reference=attrs.get('href') if tag in ('a','link') else attrs.get('src') if tag in ('script','img') else None
   if not reference:continue
   url=urlsplit(reference)
   if url.scheme or url.netloc:continue
   if url.path:assert (path.parent/unquote(url.path)).is_file(),(path,reference)
   elif url.fragment:assert url.fragment in ids,(path,reference)
  if folder==ROOT:assert 'href="add-product.html"' not in text
  body=next(a for t,a in parser.tags if t=='body')
  if 'customer-backdrop' in body.get('class',''):
   assert folder==ROOT and body.get('data-access') in ('customer','public') and body.get('data-portal','customer')=='customer' and body.get('data-admin-login')!='true',path
  assert body.get('data-access') in ('customer','seller','seller-pending','worker','admin','public'),path
  if body['data-access']=='public':assert 'assets/site.js' not in text,path
  if body.get('data-portal')=='worker':assert 'data-auth-mode="register"' not in text and 'href="register.html"' not in text,path
  if body['data-access']!='public':assert 'auth-pending' in body.get('class',''),path
  print(str(path.relative_to(ROOT))+': PASS')
assert not (ROOT/'add-product.html').exists()
assert not (ROOT/'assets/add-product.js').exists()
assert (ROOT/'assets/store-api.js').read_bytes()==(ROOT/'seller-site/assets/store-api.js').read_bytes()
for name in ['store-config.js','supabase-store.js','auth.js','access.js','access.css','account.js','verification.css','theme.js','themes.css','profile.js','profile.css','polish.css']:
 assert (ROOT/'assets'/name).read_bytes()==(ROOT/'seller-site/assets'/name).read_bytes(),name
for folder in [ROOT,ROOT/'seller-site']:
 for page in folder.glob('*.html'):
  text=page.read_text(encoding='utf-8-sig')
  assert text.count('data-profile-host')==1,page
  assert text.count('src="assets/theme.js?v=4"')==1,page
  assert text.index('assets/profile.js') < text.index('assets/access.js'),page
  assert 'assets/themes.css' in text and 'assets/profile.css' in text,page
  assert text.index('assets/store-config.js') < text.index('assets/supabase-store.js') < text.index('assets/store-api.js') < text.index('assets/access.js'),page
assert not (ROOT/'assets/demo-data.js').exists()
print('PASS: customer/seller separation, page links, form labels, assets, unique IDs, and matching API clients.')
