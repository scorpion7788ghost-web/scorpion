"""End-to-end HTTP checks against isolated, empty private storage (not the live GitHub repository)."""
import http.cookiejar,json,os,socket,subprocess,tempfile,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Client:
 def __init__(self,base):
  self.base=base;self.jar=http.cookiejar.CookieJar();self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf=''
 def call(self,path,method='GET',data=None,expected=200,token=True,origin=None):
  headers={'Accept':'application/json'}
  if method!='GET':headers.update({'Content-Type':'application/json','X-CSRF-Token':self.csrf if token else 'invalid'})
  if origin:headers['Origin']=origin
  req=urllib.request.Request(self.base+'/api'+path,method=method,headers=headers,data=json.dumps(data or {}).encode() if method!='GET' else None)
  try:
   with self.http.open(req,timeout=15) as response:status=response.status;result=json.load(response)
  except urllib.error.HTTPError as error:status=error.code;result=json.load(error)
  assert status==expected,(path,status,result)
  if result.get('csrf'):self.csrf=result['csrf']
  return result
 def bootstrap(self):return self.call('/bootstrap')
def free_port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

def run():
 (ROOT/'.qa').mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='http-storage-',dir=ROOT/'.qa') as folder:
  servers=[];logs=[]
  try:
   bases={}
   for portal in ['customer','seller']:
    port=free_port();base=f'http://127.0.0.1:{port}';bases[portal]=base
    env=os.environ.copy();env.update(LK_PORTAL=portal,LK_STORAGE_DRIVER='local',LK_STORAGE_DIR=folder,PHP_INI_SCAN_DIR=str(ROOT/'.php/conf.d'))
    log=open(Path(folder)/(portal+'.log'),'wb');logs.append(log)
    process=subprocess.Popen(['php','-S',f'127.0.0.1:{port}',str(ROOT/'server/router.php')],cwd=ROOT,env=env,stdout=log,stderr=log);servers.append(process)
    for _ in range(40):
     try:urllib.request.urlopen(base+'/index.html',timeout=.5).close();break
     except (OSError,urllib.error.URLError):time.sleep(.1)
    else:raise RuntimeError('PHP server did not start.')
   a=Client(bases['seller']);b=Client(bases['seller']);customer=Client(bases['customer'])
   assert a.bootstrap()['products']==[];assert b.bootstrap()['user'] is None;assert customer.bootstrap()['stores']==[]
   pw='HttpIntegration123!'
   a.call('/auth/register','POST',{'name':'First Seller','username':'seller_first','password':pw,'email':'private@example.test'},201)
   aid=a.bootstrap()['user']['id'];assert (Path(folder)/'users'/f'{aid}.json').is_file()
   a.call('/auth/register','POST',{'name':'Duplicate','username':'seller_first','password':pw},409)
   b.call('/auth/register','POST',{'name':'Second Seller','username':'seller_second','password':pw},201);bid=b.bootstrap()['user']['id']
   customer.call('/auth/register','POST',{'role':'seller','name':'Wrong role','username':'wrong_role','password':pw},403)
   customer.call('/auth/register','POST',{'name':'Customer','username':'buyer','password':pw},201)
   customer.call('/seller/store','PATCH',{'name':'Forbidden'},403)
   a.call('/seller/store','PATCH',{'name':'CSRF'},403,token=False)
   a.call('/seller/store','PATCH',{'name':'Origin'},403,origin='https://evil.example')
   a.call('/seller/store','PATCH',{'storeId':bid,'name':'Hijacked'},403)
   product=a.call('/seller/products','POST',{'name':'A product','summary':'Summary','description':'A real listing description.','category':'Tech','price':'19.95','stock':2,'status':'active','sku':'LIVE-001','isNew':True},201)['product'];pid=product['id']
   assert product['sellerId']==aid
   b.call('/seller/products/'+pid,'PUT',{'name':'Foreign'},404)
   public=customer.bootstrap();assert len(public['products'])==1;assert 'private@example.test' not in json.dumps(public)
   customer.call('/cart','PUT',{'items':{pid:1}});assert customer.bootstrap()['cart'][pid]==1
   other=Client(bases['customer']);other.bootstrap();other.call('/auth/register','POST',{'name':'Other Customer','username':'other_buyer','password':pw},201);assert other.bootstrap()['cart']==[]
   fresh=Client(bases['seller']);fresh.bootstrap();fresh.call('/auth/login','POST',{'username':'seller_first','password':pw});assert fresh.bootstrap()['user']['id']==aid
   fresh.call('/me','PATCH',{'name':'Changed','email':'','currentPassword':pw,'password':'ChangedPassword123!'})
   assert a.bootstrap()['user'] is None
   a.call('/auth/login','POST',{'username':'seller_first','password':pw},401)
   a.call('/auth/login','POST',{'username':'seller_first','password':'ChangedPassword123!'})
   for endpoint in ['/server/storage/users/'+aid+'.json','/server/src/Commerce.php','/.git/config','/seller-site/add-product.html']:
    try:urllib.request.urlopen(bases['customer']+endpoint);raise AssertionError('Private/source path was served')
    except urllib.error.HTTPError as error:assert error.code==404
   for cookie in a.jar:assert cookie.has_nonstandard_attr('HttpOnly');assert cookie.get_nonstandard_attr('SameSite')=='Lax'
   a.call('/auth/logout','POST',{});assert a.bootstrap()['user'] is None
   assert len(list((Path(folder)/'users').glob('*.json')))==4
   print('PASS: real HTTP registration/login, per-user files, fresh-browser persistence, separate portals, CSRF, origin checks, ownership, shared public catalog, account carts, session revocation, secure cookies, logout, and private-file blocking.')
  finally:
   for process in servers:process.terminate()
   for process in servers:
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait()
   for log in logs:log.close()
if __name__=='__main__':run()
