"""Local-only browser QA. In-memory fixtures never reach Supabase or published files."""
import base64, json, os, subprocess, threading, time, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import websocket

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
products[0]['originalPrice'] = 99
saved, cart = set(), {}
fail_save = False

class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,data):
  content=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(content)
 def do_GET(self):
  path=self.path.split('?')[0]
  if path=='/assets/store-config.js':
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(b'window.STORE_CONFIG={provider:"php",apiBase:"/api",sellerUrl:location.origin+"/seller-site/",customerUrl:location.origin+"/"};');return
  if path=='/api/bootstrap':return self.reply(dict(user=dict(id='qa_buyer',name='Browser QA',role='customer'),products=products,stores=[dict(profile=dict(id='qa_seller',name='Isolated QA Store'))],cart=cart,orders=[]))
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
   time.sleep(.45)
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
 assert not errors,errors
 print('PASS: real Chrome storefront, four responsive widths without page overflow, themes, suggestions, quick view, wishlist persistence/failure recovery, cart, notifications, orders, categories, deals and product links. No browser exceptions. Isolated fixtures only.')
finally:
 if ws:ws.close()
 browser.terminate();server.shutdown()
