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
  print(str(path.relative_to(ROOT))+': PASS')
assert not (ROOT/'add-product.html').exists()
assert not (ROOT/'assets/add-product.js').exists()
assert (ROOT/'assets/demo-core.js').read_bytes()==(ROOT/'seller-site/assets/demo-core.js').read_bytes()
assert (ROOT/'assets/demo-data.js').read_bytes()==(ROOT/'seller-site/assets/demo-data.js').read_bytes()
print('PASS: customer/seller separation, page links, form labels, assets, unique IDs, and matching hardcoded data.')
