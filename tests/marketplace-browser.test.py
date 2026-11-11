"""Local-only browser QA. In-memory fixtures never reach Supabase or published files."""
import base64, json, os, subprocess, threading, time, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import websocket
from urllib.parse import urlsplit,parse_qs
from datetime import datetime,timezone

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
(ROOT/'.qa').mkdir(exist_ok=True)
products = [dict(id=f'qa_{i}', sellerId='qa_seller', name=name, category=category,
 price=price, stock=5, color='#19141f', isNew=True, isCustom=True,
 summary='Isolated browser test fixture', description='Isolated browser test fixture',
 image='assets/products/placeholder.svg', brand='QA') for i,(name,category,price) in enumerate([
 ('Wireless Headphones','Audio',79),('Mechanical Gaming Keyboard','Tech',59),
 ('Precision Mouse','Accessories',29),('Ultra Laptop','Laptops',799),
 ('Smartphone','Mobiles',499),('Gaming Monitor','Monitors',249)])]
for product in products:product['status']='active'
products[0]['originalPrice'] = 99
saved, cart = set(), {}
fail_save = False
review_rows = {}
review_calls = []
review_allowed = True
review_fail_save = False
checkout_quotes = {}
checkout_orders = {}
checkout_calls = []
checkout_fail_before = False
checkout_lose_response = False

class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,data):
  content=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(content)
 def do_GET(self):
  path=self.path.split('?')[0]
  if path in ['/assets/store-config.js','/seller-site/assets/store-config.js']:
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(b'window.STORE_CONFIG={provider:"php",apiBase:"/api",sellerUrl:location.origin+"/seller-site/",customerUrl:location.origin+"/"};');return
  if path=='/api/bootstrap' and '/seller-site/' in self.headers.get('Referer',''):
   shop=dict(profile=dict(id='qa_seller',name='Isolated QA Store'),products=products,orders=[],drafts={})
   return self.reply(dict(user=dict(id='qa_seller',username='qa_seller',name='QA Seller',role='seller',verificationStatus='approved'),products=products,stores=[shop],sellerStore=shop,cart={},orders=[]))
  if path=='/api/seller/orders':
   return self.reply(dict(orders=[dict(**order,customer_name=receipt['delivery']['name'],currency='USD',delivery=receipt['delivery']) for receipt in checkout_orders.values() for order in receipt['orders']],total=len(checkout_orders)))
  if path=='/api/bootstrap':return self.reply(dict(user=dict(id='qa_buyer',name='Browser QA',role='customer'),products=products,stores=[dict(profile=dict(id='qa_seller',name='Isolated QA Store'))],cart=cart,orders=[]))
  if path=='/api/reviews':
   query=parse_qs(urlsplit(self.path).query);key=query['product'][0];page=int(query.get('page',['1'])[0]);sort=query.get('sort',['newest'])[0]
   rows=[row for row in review_rows.values() if row['productId']==key]
   rows.sort(key=lambda row:(row['rating'] if sort in ['highest','lowest'] else row['createdAt'],row['id']),reverse=sort in ['newest','highest'])
   summary=dict(total=len(rows),average=sum(row['rating'] for row in rows)/len(rows) if rows else 0,distribution={str(i):sum(row['rating']==i for row in rows) for i in range(1,6)})
   return self.reply(dict(summary=summary,reviews=rows[(page-1)*10:page*10],mine=next((row for row in rows if row['isMine']),None),page=page,pageSize=10,canReview=review_allowed,eligibilityMessage='' if review_allowed else 'A paid purchase is required.'))
  if path=='/api/checkout/delivery':return self.reply([dict(district='Local test district',fee_cents=500,per_seller=False,active=True)])
  if path in ['/api/checkout/resume','/api/checkout/details']:
   key=parse_qs(urlsplit(self.path).query)['id'][0]
   return self.reply(dict(placed=key in checkout_orders,quote=checkout_quotes[key]) if path.endswith('resume') else checkout_orders[key])
  if path=='/api/wishlist':return self.reply(list(saved))
  if path=='/api/my/orders':return self.reply(dict(orders=[dict(id='qa_order',items=[dict(name=products[0]['name'],quantity=1)],total_cents=7900,currency='USD',status='processing',payment_status='paid',tracking='',seller_name='QA Store',created_at='2026-11-01T00:00:00Z')],total=1))
  if path=='/api/notifications':return self.reply([dict(title='QA announcement',body='Isolated notification check',created_at='2026-11-01T00:00:00Z')])
  return super().do_GET()
 def do_PUT(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/api/wishlist':
   if fail_save:
    self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"QA save failed"}');return
   (saved.add if body['saved'] else saved.discard)(body['productId']);return self.reply(list(saved))
  if self.path=='/api/cart':cart.clear();cart.update(body['items']);return self.reply(dict(items=cart))
  self.send_error(404)

 def review_write(self,method):
  if self.path!='/api/reviews':return self.send_error(404)
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));review_calls.append(method)
  if review_fail_save:
   self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"Review save temporarily unavailable"}');return
  key=body.get('id') or 'qa_review'
  if method=='DELETE':review_rows.pop(key,None);return self.reply(dict(deleted=True))
  now=datetime.now(timezone.utc).isoformat();row=dict(id=key,productId=body['productId'],rating=body['rating'],title=body['title'],body=body['body'],name='QA Buyer',isMine=True,verifiedPurchase=True,createdAt=review_rows.get(key,{}).get('createdAt',now),updatedAt=now)
  review_rows[key]=row;return self.reply(row)
 def do_POST(self):
  if not self.path.startswith('/api/checkout/'):return self.review_write('POST')
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/api/checkout/quote':
   key='00000000-0000-4000-8000-'+str(len(checkout_quotes)+1).zfill(12)
   lines=[dict(productId=p['id'],name=p['name'],image=p['image'],sku='',quantity=cart[p['id']],unit_cents=round(p['price']*100),line_cents=round(p['price']*100)*cart[p['id']]) for p in products if p['id'] in cart]
   subtotal=sum(i['line_cents'] for i in lines);q=dict(id=key,items=lines,district=body['district'],perSeller=False,currency='USD',subtotal_cents=subtotal,delivery_fee_cents=500,total_cents=subtotal+500,expiresAt='2099-01-01T00:00:00Z')
   checkout_quotes[key]=q;return self.reply(q)
  if self.path=='/api/checkout/place':
   checkout_calls.append(body)
   if checkout_fail_before:
    self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"Temporary failure; please retry"}');return
   key=body['id'];q=checkout_quotes[key]
   if key not in checkout_orders:
    order=dict(id='LK-isolated-'+key,items=q['items'],seller_name='Local QA seller',status='pending',payment_status='unpaid',payment_method='cod',tracking='',total_cents=q['total_cents'])
    checkout_orders[key]=dict(id=key,createdAt='2026-11-11T12:00:00Z',delivery=body['delivery'],currency='USD',subtotal_cents=q['subtotal_cents'],delivery_fee_cents=q['delivery_fee_cents'],total_cents=q['total_cents'],orders=[order])
    cart.clear()
   if checkout_lose_response:
    self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"Response lost after saving"}');return
   return self.reply(checkout_orders[key])
  self.send_error(404)

 def do_PATCH(self):return self.review_write('PATCH')
 def do_DELETE(self):return self.review_write('DELETE')

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
port=server.server_address[1]
profile=ROOT/('.qa/chrome-market-'+str(os.getpid()))
browser=subprocess.Popen([os.environ.get('BROWSER_EXECUTABLE',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+str(profile),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
ws=None
try:
 active=profile/'DevToolsActivePort'
 for _ in range(80):
  if active.exists():break
  time.sleep(.1)
 debug_port=active.read_text().splitlines()[0]
 targets=json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json'))
 ws=websocket.create_connection(next(t['webSocketDebuggerUrl'] for t in targets if t['type']=='page'),timeout=20)
 seq=0;errors=[]
 def call(method,params=None):
  global seq
  seq+=1;request_id=seq;ws.send(json.dumps(dict(id=seq,method=method,params=params or {})))
  while True:
   event=json.loads(ws.recv())
   if event.get('method')=='Runtime.exceptionThrown':errors.append(event['params']['exceptionDetails'])
   if event.get('id')==request_id:
    if 'error' in event:raise RuntimeError(event['error'])
    return event.get('result',{})
 def js(expression):
  result=call('Runtime.evaluate',dict(expression=expression,returnByValue=True,awaitPromise=True))
  if 'exceptionDetails' in result:raise RuntimeError(result['exceptionDetails'])
  return result.get('result',{}).get('value')
 def wait(expression):
  for _ in range(60):
   if js(expression):return
   time.sleep(.1)
  raise AssertionError('Timed out: '+expression)
 def visit(path):
  call('Page.navigate',dict(url=f'http://127.0.0.1:{port}/'+path));wait("document.readyState==='complete' && typeof Store!=='undefined' && !document.body.classList.contains('auth-pending')")
  js('window.customerReady');js('window.searchReady');time.sleep(.2)
 def shot(name):
  result=call('Page.captureScreenshot',dict(format='png',captureBeyondViewport=False));(ROOT/'.qa'/name).write_bytes(base64.b64decode(result['data']))
 call('Page.enable');call('Runtime.enable')
 call('Page.addScriptToEvaluateOnNewDocument',dict(source="localStorage.setItem('lk-usd-lkr-v1',JSON.stringify({rate:300,updated:Date.now()}));"))
 call('Emulation.setDeviceMetricsOverride',dict(width=1440,height=1050,deviceScaleFactor=1,mobile=False))
 visit('index.html');wait("document.querySelectorAll('#recommended-products .product-card').length===6")
 assert js("document.querySelectorAll('#hero-dots button').length") == 4
 assert 'LKR' in js("document.querySelector('.product-price').textContent")
 assert js("document.querySelectorAll('.product-art.image-loaded').length") == 12
 shot('market-desktop.png')
 first_slide=js("document.querySelector('#hero-product-name').textContent");time.sleep(6.7)
 assert js("document.querySelector('#hero-product-name').textContent")!=first_slide
 js("document.querySelector('#hero-pause').click()")
 assert js("document.querySelector('#hero-pause').getAttribute('aria-pressed')")=='true'
 # Exercise every featured slide with real layout measurements, including a long title.
 original_name=js("window.products[0].name")
 js("window.products[0].name='Premium Wireless Studio Headphones with Active Noise Cancellation and Travel Case'")
 for width in [1440,1024,768,640,390,320]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=1100,deviceScaleFactor=1,mobile=width<640))
  call('Emulation.setTouchEmulationEnabled',dict(enabled=width<640))
  for slide in range(4):
   js(f"document.querySelectorAll('#hero-dots button')[{slide}].click()")
   js("Promise.all(document.querySelector('#hero-product-image').getAnimations().map(animation=>animation.finished))")
   layout=js("""(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,center:(r.left+r.right)/2};};
    return {hero:rect('#tech-hero'),image:rect('#hero-product-image'),caption:rect('.hero-product-caption'),price:rect('#hero-product-price'),controls:rect('.hero-carousel-controls')};
   })()""")
   hero,image,caption,price,controls=[layout[key] for key in ['hero','image','caption','price','controls']]
   label=f'hero width={width}, slide={slide}'
   assert caption['top']-image['bottom']>=8,label+': image overlaps caption'
   assert abs(caption['center']-image['center'])<=1,label+': caption is not centered below image'
   assert controls['top']>=caption['bottom']+8,label+': controls overlap caption'
   for name,box in [('image',image),('caption',caption),('price',price),('controls',controls)]:
    assert box['top']>=hero['top'] and box['bottom']<=hero['bottom'] and box['left']>=hero['left'] and box['right']<=hero['right'],label+': '+name+' exceeds hero boundaries'
   if slide==0 and width in [1440,768,390,320]:shot(f'hero-fixed-{width}.png')
 js("window.products[0].name="+json.dumps(original_name)+";document.querySelectorAll('#hero-dots button')[0].click()")
 call('Emulation.setDeviceMetricsOverride',dict(width=1440,height=1050,deviceScaleFactor=1,mobile=False))
 call('Emulation.setTouchEmulationEnabled',dict(enabled=False))
 print('PASS: all four hero slides at six viewport widths, long titles, centered prices, image/caption/control separation and banner containment.')
 js("document.querySelector('#header-product-search').value='head';document.querySelector('#header-product-search').dispatchEvent(new Event('input'))")
 assert js("document.querySelectorAll('.suggestion-option').length") == 1
 js("document.querySelector('#header-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))")
 assert js("document.querySelector('#suggestions-panel').hidden")
 js("document.querySelector('.card-quick').click()")
 assert js("document.querySelector('#quick-view').open")
 js("document.querySelector('.quick-close').click();document.querySelector('.wishlist-toggle').click()")
 wait("document.querySelector('#wishlist-count').textContent==='1'")
 assert saved == {'qa_0'}
 fail_save=True
 js("document.querySelector('.wishlist-toggle').click()")
 wait("document.querySelector('#toast').textContent==='QA save failed'")
 assert js("document.querySelector('.wishlist-toggle').getAttribute('aria-pressed')") == 'true'
 fail_save=False
 js("document.querySelector('.card-add').click()")
 wait("document.querySelector('#cart-count').textContent==='1'")
 assert cart=={'qa_0':1}
 js("document.querySelector('#header-notifications').click()")
 wait("document.querySelector('#profile-notifications')?.textContent.includes('QA announcement')")
 js("document.querySelector('#profile-notifications').close();StoreTheme.apply('white-light')")
 time.sleep(.5);shot('market-light.png');js("StoreTheme.apply('plum-dark')")
 for width in [1024,768,390,320]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=900,deviceScaleFactor=1,mobile=width<640));call('Emulation.setTouchEmulationEnabled',dict(enabled=width<640));time.sleep(.1)
  assert js('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
  if width==390:
   shot('market-mobile.png');js("document.querySelector('#mobile-nav-toggle').click()")
   assert js("getComputedStyle(document.querySelector('#market-nav')).display")=='grid'
   js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))")
   assert js("document.querySelector('#mobile-nav-toggle').getAttribute('aria-expanded')")=='false'
 call('Emulation.setDeviceMetricsOverride',dict(width=1440,height=1050,deviceScaleFactor=1,mobile=False))
 visit('wishlist.html');wait("document.querySelectorAll('#wishlist-products .product-card').length===1")
 visit('orders.html');wait("document.querySelectorAll('.buyer-order').length===1")
 assert js("document.querySelector('.buyer-order').textContent.includes('qa_order')")
 assert 'LKR' in js("document.querySelector('.order-total').textContent")
 visit('search.html?collection=Audio&min=20000&max=25000&currency=LKR');assert js("document.querySelectorAll('#result-products .product-card').length")==1
 visit('search.html?deals=1');assert js("document.querySelectorAll('#result-products .product-card').length")==1
 visit('search.html?min=1&currency=USD');assert not js("document.querySelector('#filter-error').hidden")
 visit('cart.html');assert js("document.querySelector('#cart-count').textContent")=='1'
 visit('product.html?id=qa_0');assert js("document.querySelector('#product-title').textContent")==products[0]['name']
 js('window.reviewsReady')
 assert not js("document.querySelector('#reviews-empty').hidden")
 assert not js("document.querySelector('#review-form').hidden")
 js("document.querySelectorAll('[name=rating]')[4].click();document.querySelector('#review-title').value='<img src=x onerror=alert(1)>';document.querySelector('#review-body').value='A detailed experience with this product.';document.querySelector('#review-form').requestSubmit();document.querySelector('#review-form').requestSubmit()")
 wait("document.querySelector('#reviews-total').textContent==='1 review'")
 assert review_calls.count('POST')==1,'Double submission must be ignored while saving'
 assert js("document.querySelector('#reviews-average').textContent")=='5.0'
 assert js("document.querySelector('.product-review h3').textContent")=='<img src=x onerror=alert(1)>'
 assert js("document.querySelectorAll('.product-review img').length")==0,'Review content must render as text'
 assert js("document.querySelector('.review-verified').textContent").endswith('Verified Purchase')
 visit('product.html?id=qa_0');js('window.reviewsReady')
 assert not js("document.querySelector('#review-own').hidden"),'Saved review persists on reload'
 js("document.querySelector('#review-edit').click();document.querySelectorAll('[name=rating]')[2].click();document.querySelector('#review-title').value='Changed my opinion'")
 review_fail_save=True;js("document.querySelector('#review-form').requestSubmit()")
 wait("document.querySelector('#reviews-error').textContent.includes('temporarily unavailable')")
 assert js("document.querySelector('#review-title').value")=='Changed my opinion','Failed save preserves the draft'
 review_fail_save=False;js("document.querySelector('#review-form').requestSubmit()")
 wait("document.querySelector('#reviews-average').textContent==='3.0'")
 js("document.querySelector('#review-delete').click();document.querySelector('#review-delete-cancel').click()")
 assert len(review_rows)==1,'Cancelling deletion preserves the review'
 js("document.querySelector('#review-delete').click();document.querySelector('#review-delete-confirm').click()")
 wait("document.querySelector('#reviews-total').textContent==='0 reviews'")
 assert not review_rows
 review_allowed=False;visit('product.html?id=qa_0');js('window.reviewsReady')
 assert js("document.querySelector('#review-form').hidden")
 assert 'paid purchase' in js("document.querySelector('#review-eligibility').textContent")
 for i in range(11):review_rows[str(i)]=dict(id=str(i),productId='qa_0',rating=(i%5)+1,title='Isolated review '+str(i),body='A long and honest review. '*15,name='Test purchaser',isMine=False,verifiedPurchase=True,createdAt=f'2026-10-{i+1:02}T00:00:00Z',updatedAt=f'2026-10-{i+1:02}T00:00:00Z')
 review_allowed=True;visit('product.html?id=qa_0');js('window.reviewsReady')
 assert js("document.querySelectorAll('.product-review').length")==10
 js("document.querySelector('#reviews-next').click()")
 wait("document.querySelector('#reviews-page').textContent==='Page 2 of 2'")
 assert js("document.querySelectorAll('.product-review').length")==1
 for mode,expected in [('highest','5 out of 5 stars'),('lowest','1 out of 5 stars')]:
  js("document.querySelector('#review-sort').value="+json.dumps(mode)+";document.querySelector('#review-sort').dispatchEvent(new Event('change'))")
  wait("!document.querySelector('#review-sort').disabled")
  assert js("document.querySelector('.product-review .review-stars').getAttribute('aria-label')")==expected
 for width in [1440,768,390,320]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=1050,deviceScaleFactor=1,mobile=width<640))
  js("document.querySelector('#product-reviews').scrollIntoView({behavior:'instant',block:'start'})");time.sleep(.2)
  assert js('document.documentElement.scrollWidth<=innerWidth'),f'Reviews overflow at {width}'
  if width in [1440,390]:shot(f'reviews-{width}.png')
 print('PASS: review submission/edit/delete, reload persistence, duplicate-click prevention, failed-save draft retention, safe text rendering, purchase eligibility, sorting, pagination and responsive review UI.')
 # COD checkout exercises real page code; all orders remain in this localhost fixture.
 cart.clear();visit('checkout.html');js('window.checkoutReady')
 assert not js("document.querySelector('#checkout-empty').hidden")
 cart.update({'qa_0':2,'qa_1':1});visit('cart.html')
 assert js("document.querySelector('#checkout-link').getAttribute('href')")=='checkout.html'
 visit('checkout.html');js('window.checkoutReady')
 assert js("document.querySelector('#place-order').disabled")
 js("document.querySelector('#checkout-district').value='Local test district';document.querySelector('#checkout-district').dispatchEvent(new Event('change'))")
 wait("!document.querySelector('#place-order').disabled")
 assert '222.00' in js("document.querySelector('#checkout-total').textContent")
 assert 'Cash on Delivery' in js("document.querySelector('.cod-method').textContent")
 js("document.querySelector('#checkout-form').requestSubmit()")
 assert not checkout_calls,'Missing required delivery details must block submission'
 for key,value in dict(name='Local Browser QA',mobile='+94770000000',address='Local test address',city='Test city',postalCode='10100',instructions='Test only').items():
  js("document.querySelector('#checkout-"+key+"').value="+json.dumps(value))
 for width in [1440,768,390,320]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=1050,deviceScaleFactor=1,mobile=width<640));time.sleep(.1)
  assert js('document.documentElement.scrollWidth<=innerWidth'),f'Checkout overflow at {width}'
  if width in [1440,390]:shot(f'checkout-{width}.png')
 checkout_fail_before=True
 js("document.querySelector('#checkout-form').requestSubmit()")
 wait("!document.querySelector('#place-order').disabled")
 assert not checkout_orders and cart
 assert js("document.querySelector('#checkout-address').value")=='Local test address'
 assert 'Temporary failure' in js("document.querySelector('#checkout-error').textContent")
 checkout_fail_before=False;checkout_lose_response=True
 before=len(checkout_calls)
 js("document.querySelector('#checkout-form').requestSubmit();document.querySelector('#checkout-form').requestSubmit()")
 wait("location.pathname.endsWith('order-confirmation.html') && document.querySelector('#order-confirmation') && !document.querySelector('#order-confirmation').hidden")
 assert len(checkout_calls)==before+1 and len(checkout_orders)==1 and not cart
 assert 'Payment Status: Unpaid' in js("document.querySelector('#confirmation-content').textContent")
 assert 'Payment Method: Cash on Delivery' in js("document.querySelector('#confirmation-content').textContent")
 current=js('location.pathname.split("/").pop()+location.search');visit(current);js('window.checkoutReady')
 assert 'Local test address' in js("document.querySelector('#confirmation-content').textContent")
 for width in [1440,768,390,320]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=1050,deviceScaleFactor=1,mobile=width<640));time.sleep(.1)
  assert js('document.documentElement.scrollWidth<=innerWidth'),f'Confirmation overflow at {width}'
  if width in [1440,390]:shot(f'confirmation-{width}.png')
 print('PASS: COD cart entry, empty cart, delivery quotes, required fields, responsive checkout/confirmation, failed-save preservation, duplicate-click prevention, lost-response recovery and persisted order reload.')
 # Seller order view receives the same stored order and delivery snapshot.
 visit('seller-site/orders.html');js('window.sellerReady')
 wait("document.querySelector('#order-rows').children.length===1")
 assert 'Local test address' in js("document.querySelector('#order-rows').textContent")
 assert 'unpaid' in js("document.querySelector('#order-rows').textContent")
 assert js("document.querySelector('#seller-orders-pagination').children.length")==2
 for width in [1440,768,390]:
  call('Emulation.setDeviceMetricsOverride',dict(width=width,height=1050,deviceScaleFactor=1,mobile=width<640));time.sleep(.1)
  assert js('document.documentElement.scrollWidth<=innerWidth'),f'Seller orders overflow at {width}'
 print('PASS: Seller Site loads COD order items, unpaid status, delivery information, pagination and responsive table.')
 visit('seller-site/dashboard.html');js('window.sellerReady')
 wait("document.querySelector('#dashboard-stats').lastElementChild.querySelector('strong').textContent==='1'")
 assert not errors,errors
 print('PASS: real Chrome storefront, four responsive widths without page overflow, themes, suggestions, quick view, wishlist persistence/failure recovery, cart, notifications, orders, categories, deals and product links. No browser exceptions. Isolated fixtures only.')
finally:
 if ws:ws.close()
 browser.terminate();server.shutdown()
