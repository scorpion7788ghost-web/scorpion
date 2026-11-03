<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/src/Commerce.php';
require dirname(__DIR__).'/server/src/GitHubStore.php';
function check(bool $value,string $message): void { if(!$value)throw new RuntimeException($message); }
function rejects(callable $fn,int $status): void {try{$fn();throw new RuntimeException('Expected failure.');}catch(ApiFailure $e){check($e->status===$status,'Unexpected status.');}}
$root=$argv[1] ?? throw new RuntimeException('Use an isolated test directory.');
$files=new FileStore($root.'/local');$service=new Commerce($files);
check($service->catalog()['products']===[],'Fresh storage must be empty.');
$password='IntegrationPass123!';
$a=$service->register('seller',['name'=>'First','username'=>'first','password'=>$password,'email'=>'private@example.test']);
$b=$service->register('seller',['name'=>'Second','username'=>'second','password'=>$password]);
$customer=$service->register('customer',['name'=>'Customer','username'=>'customer','password'=>$password]);
check(is_file($root.'/local/users/'.$a['id'].'.json'),'A user must have its own JSON file.');
check(!str_contains(file_get_contents($root.'/local/users/'.$a['id'].'.json'),$password),'Plain passwords must never be stored.');
check(password_verify($password,$files->read('users',$a['id'])['passwordHash']),'Stored hash must verify.');
rejects(fn()=>$service->register('seller',['name'=>'Duplicate','username'=>'first','password'=>$password]),409);
rejects(fn()=>$service->login('customer','first',$password),401);
$input=['name'=>'Real listing','summary'=>'Short line','description'=>'Full product description','category'=>'Tech','price'=>'12.34','stock'=>3,'status'=>'active','sku'=>'OWN-SKU','image'=>'','isNew'=>true];
$p=$service->saveProduct($a,$a['id'],$input);
check($p['sellerId']===$a['id'],'Owner must be server-derived.');
rejects(fn()=>$service->saveProduct($b,$a['id'],$input),403);
rejects(fn()=>$service->saveProduct($b,$b['id'],$input,$p['id']),404);
rejects(fn()=>$service->updateStore($b,$a['id'],['name'=>'Hijacked']),403);
rejects(fn()=>$service->saveProduct($customer,$a['id'],$input),403);
check(count($service->catalog()['products'])===1,'Active listing should be visible.');
check(!str_contains(json_encode($service->catalog()),'private@example.test'),'Private registration email must not leak.');
$service->productStatus($a,$p['id'],'draft');check($service->catalog()['products']===[],'Drafts must not be public.');
$service->productStatus($a,$p['id'],'active');
$service->draft($a,'new',['name'=>'Partial']);check($service->ownStore($a,$a['id'])['drafts']['new']['name']==='Partial','Draft must persist.');
$service->cart($customer,[$p['id']=>2]);check($service->cart($customer)[$p['id']]===2,'Cart must persist.');
rejects(fn()=>$service->cart($customer,[$p['id']=>4]),422);
$updated=$service->updateAccount($a,['name'=>'Updated','email'=>'','currentPassword'=>$password,'password'=>'ChangedPassword123!']);
check($updated['sessionVersion']!==$a['sessionVersion'],'Password change must revoke other sessions.');
$newService=new Commerce(new FileStore($root.'/local'));check($newService->login('seller','first','ChangedPassword123!')['id']===$a['id'],'Records must survive service recreation.');
check($newService->ownStore($b,$b['id'])['products']===[],'Another seller must remain empty.');

class MemoryGitHub extends GitHubStore {
 public array $blobs=[],$trees=['tree0'=>[]],$commits=['commit0'=>['tree'=>['sha'=>'tree0'],'parents'=>[]]];
 public string $ref='commit0';public bool $privateRepo=true,$conflict=false;
 protected function api(string $method,string $path,?array $body=null): array {
  if($method==='GET'&&$path==='')return ['private'=>$this->privateRepo];
  if($method==='GET'&&str_starts_with($path,'/git/ref/'))return ['object'=>['sha'=>$this->ref]];
  if($method==='GET'&&str_starts_with($path,'/git/commits/'))return $this->commits[basename($path)];
  if($method==='GET'&&str_starts_with($path,'/git/trees/')){$id=basename(explode('?',$path)[0]);return ['tree'=>array_values($this->trees[$id]),'truncated'=>false];}
  if($method==='GET'&&str_starts_with($path,'/git/blobs/'))return ['content'=>$this->blobs[basename($path)]];
  if($method==='POST'&&$path==='/git/blobs'){$sha=sha1($body['content']);$this->blobs[$sha]=$body['content'];return ['sha'=>$sha];}
  if($method==='POST'&&$path==='/git/trees'){$next=$this->trees[$body['base_tree']];foreach($body['tree'] as $node)$next[$node['path']]=$node;$sha=sha1(json_encode($next));$this->trees[$sha]=$next;return ['sha'=>$sha];}
  if($method==='POST'&&$path==='/git/commits'){$sha=sha1(json_encode($body));$this->commits[$sha]=['tree'=>['sha'=>$body['tree']],'parents'=>$body['parents']];return ['sha'=>$sha];}
  if($method==='PATCH'&&str_starts_with($path,'/git/refs/')){if($this->conflict||!in_array($this->ref,$this->commits[$body['sha']]['parents'],true))throw new StorageFailure('Concurrent update rejected.');check($body['force']===false,'Git ref must never force overwrite.');$this->ref=$body['sha'];return ['object'=>['sha'=>$this->ref]];}
  throw new RuntimeException('Unexpected GitHub operation.');
 }
}
$git=new MemoryGitHub($root.'/github-runtime','owner/private-records','test-token','main');$githubService=new Commerce($git);
$user=$githubService->register('customer',['name'=>'User','username'=>'githubuser','password'=>$password]);
check(isset($git->trees[$git->commits[$git->ref]['tree']['sha']]['users/'.$user['id'].'.json']),'Registration must create an individual GitHub JSON file.');
check($githubService->login('customer','githubuser',$password)['id']===$user['id'],'GitHub record must be reusable for login.');
$before=$git->ref;$git->conflict=true;
try{$githubService->updateAccount($user,['name'=>'Conflict','email'=>'']);throw new RuntimeException('Conflict accepted.');}catch(StorageFailure){}
$git->conflict=false;check($git->ref===$before,'A conflicting write must leave the GitHub branch unchanged.');
check($githubService->user($user['id'])['name']==='User','Failed update must not become visible.');
$git->privateRepo=false;
try{$git->transaction(fn()=>$git->all('users'));throw new RuntimeException('Public repository accepted.');}catch(StorageFailure){}
echo "PASS: empty storage, per-user JSON, password hashes, persistence, roles, ownership, product states, drafts, carts, password-session revocation, private GitHub files, and non-overwriting commits.\n";
