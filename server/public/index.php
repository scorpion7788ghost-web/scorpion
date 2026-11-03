<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/src/Commerce.php';
require_once dirname(__DIR__).'/src/GitHubStore.php';

ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $value, int $status = 200): never { http_response_code($status); echo json_encode($value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); exit; }
try {
    $portal = getenv('LK_PORTAL') ?: 'customer';
    if (!in_array($portal,['customer','seller'],true)) throw new RuntimeException('Invalid portal configuration.');
    $host = strtolower(parse_url('http://'.($_SERVER['HTTP_HOST'] ?? ''),PHP_URL_HOST) ?: '');
    $allowed = array_filter(explode(',',getenv('LK_ALLOWED_HOSTS') ?: 'localhost,127.0.0.1'));
    if (!in_array($host,$allowed,true)) throw new ApiFailure('This server hostname is not configured.',403);
    if (is_file(dirname(__DIR__).'/local.php')) require dirname(__DIR__).'/local.php';
    $runtime = getenv('LK_STORAGE_DIR') ?: dirname(__DIR__).'/storage';
    $files = getenv('LK_STORAGE_DRIVER')==='github'
        ? new GitHubStore($runtime, getenv('LK_GITHUB_REPOSITORY') ?: '', getenv('LK_GITHUB_TOKEN') ?: '', getenv('LK_GITHUB_BRANCH') ?: 'main')
        : new FileStore($runtime);
    $service = new Commerce($files);
    ini_set('session.use_strict_mode','1'); ini_set('session.use_only_cookies','1');
    session_name('lk_'.$portal.'_session');
    session_save_path($files->root.'/sessions');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']);
    if (!session_start()) throw new StorageFailure('A server session could not be started.');
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $identity = $_SESSION['identity'] ?? null;
    $user = null;
    if (is_array($identity) && ($identity['role'] ?? '') === $portal && time()-($_SESSION['lastActive'] ?? 0)<7200) {
        $candidate = $service->user($identity['id']);
        if ($candidate && hash_equals($candidate['sessionVersion'],$identity['version'] ?? '')) $user=$candidate;
    }
    if (!$user) unset($_SESSION['identity']); else $_SESSION['lastActive']=time();
    $method=$_SERVER['REQUEST_METHOD'];
    $path=substr(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '',4);
    $path='/'.trim($path,'/');
    if (!in_array($method,['GET','POST','PUT','PATCH','DELETE'],true)) throw new ApiFailure('Method not allowed.',405);
    $input=[];
    if ($method!=='GET') {
        $origin=$_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' && strtolower(parse_url($origin,PHP_URL_HOST) ?: '')!==$host) throw new ApiFailure('Cross-origin requests are not allowed.',403);
        if ($origin !== '' && (parse_url($origin,PHP_URL_PORT) ?: (parse_url($origin,PHP_URL_SCHEME)==='https'?443:80)) !== (int)($_SERVER['SERVER_PORT'] ?? 80)) throw new ApiFailure('Cross-origin requests are not allowed.',403);
        if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new ApiFailure('Refresh the page and try again.',403);
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''),'application/json')) throw new ApiFailure('Send JSON request data.',415);
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>2000000) throw new ApiFailure('The request is too large.',413);
        $raw=file_get_contents('php://input',false,null,0,2000001);
        if ($raw===false || strlen($raw)>2000000) throw new ApiFailure('The request is too large.',413);
        try { $decoded=json_decode($raw ?: '{}',false,512,JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new ApiFailure('Invalid JSON request.'); }
        if (!$decoded instanceof stdClass) throw new ApiFailure('Use a JSON object.');
        $input=json_decode($raw ?: '{}',true,512,JSON_THROW_ON_ERROR);
    }
    $needUser=function (?string $role=null) use (&$user,$portal): array {
        if (!$user) throw new ApiFailure('Please sign in.',401);
        if (($role && $user['role']!==$role) || $user['role']!==$portal) throw new ApiFailure('This account cannot access that website.',403);
        return $user;
    };
    $bind=function (array $account) use (&$user) {
        if (!session_regenerate_id(true)) throw new StorageFailure('A secure session could not be created.');
        $_SESSION['identity']=['id'=>$account['id'],'role'=>$account['role'],'version'=>$account['sessionVersion']];
        $_SESSION['lastActive']=time(); $_SESSION['csrf']=bin2hex(random_bytes(32)); $user=$account;
    };
    if ($path==='/bootstrap' && $method==='GET') {
        $data=$files->transaction(function () use ($service,$user,$portal) {
            $catalog=$service->catalog();
            return ['portal'=>$portal,'user'=>$user?$service->publicUser($user):null,'stores'=>$catalog['stores'],'products'=>$catalog['products'],'sellerStore'=>$user && $portal==='seller'?$service->ownStore($user,$user['id']):null,'cart'=>$user && $portal==='customer'?$service->cart($user):new stdClass(),'orders'=>[]];
        });
        $data['csrf']=$_SESSION['csrf'];$data['customerUrl']=getenv('LK_CUSTOMER_URL') ?: 'http://127.0.0.1:8080/';$data['sellerUrl']=getenv('LK_SELLER_URL') ?: 'http://127.0.0.1:8081/';respond($data);
    }
    if (in_array($path,['/auth/register','/auth/login'],true) && $method==='POST') {
        if (($input['role'] ?? $portal)!==$portal) throw new ApiFailure('Use the correct website for this account type.',403);
        $rateKey=hash('sha256',($_SERVER['REMOTE_ADDR'] ?? '').'|'.$portal.'|'.$path.'|'.strtolower(is_string($input['username'] ?? null)?substr($input['username'],0,30):''));
        $files->transaction(function () use ($files,$rateKey) {
            $limit=$files->read('limits',$rateKey) ?? ['started'=>time(),'count'=>0];
            if (time()-$limit['started']>900) $limit=['started'=>time(),'count'=>0];
            if ($limit['count']>=10) throw new ApiFailure('Too many attempts. Try again in 15 minutes.',429);
            $limit['count']++; $files->write('limits',$rateKey,$limit);
        });
        if ($path==='/auth/register') {
            $ipKey=hash('sha256','register|'.($_SERVER['REMOTE_ADDR'] ?? ''));
            $files->transaction(function () use ($files,$ipKey) { $limit=$files->read('limits',$ipKey) ?? ['started'=>time(),'count'=>0];if(time()-$limit['started']>3600)$limit=['started'=>time(),'count'=>0];if($limit['count']>=30)throw new ApiFailure('Registration limit reached. Try again later.',429);$limit['count']++;$files->write('limits',$ipKey,$limit); });
            $account=$service->register($portal,$input);
        } else {if(!is_string($input['password'] ?? null)||strlen($input['password'])>72)throw new ApiFailure('Username or password is incorrect for this account type.',401);$account=$service->login($portal,$service->text($input['username'] ?? '',30,true),$input['password']);}
        $bind($account); respond(['user'=>$service->publicUser($account),'csrf'=>$_SESSION['csrf']],$path==='/auth/register'?201:200);
    }
    if ($path==='/auth/logout' && $method==='POST') {
        $_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));respond(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
    }
    if ($path==='/me' && $method==='PATCH') { $account=$service->updateAccount($needUser(),$input);$bind($account);respond(['user'=>$service->publicUser($account),'csrf'=>$_SESSION['csrf']]); }
    if ($path==='/cart' && $method==='PUT') {
        if (!isset($input['items']) || !is_array($input['items'])) throw new ApiFailure('Cart items are required.');
        respond(['items'=>$service->cart($needUser('customer'),$input['items'])]);
    }
    if ($path==='/seller/store' && $method==='PATCH') { $owner=$needUser('seller');respond(['store'=>$service->updateStore($owner,$service->text($input['storeId'] ?? $owner['id'],100,true),$input)]); }
    if ($path==='/seller/products' && $method==='POST') { $owner=$needUser('seller');respond(['product'=>$service->saveProduct($owner,$service->text($input['storeId'] ?? $owner['id'],100,true),$input)],201); }
    if (preg_match('#^/seller/products/(product_[a-f0-9]{24})$#D',$path,$match) && $method==='PUT') { $owner=$needUser('seller');respond(['product'=>$service->saveProduct($owner,$service->text($input['storeId'] ?? $owner['id'],100,true),$input,$match[1])]); }
    if (preg_match('#^/seller/products/(product_[a-f0-9]{24})/status$#D',$path,$match) && $method==='PATCH') { $service->productStatus($needUser('seller'),$match[1],(string)($input['status'] ?? ''));respond(['ok'=>true]); }
    if ($path==='/seller/draft' && in_array($method,['PUT','DELETE'],true)) { $service->draft($needUser('seller'),(string)($_GET['key'] ?? 'new'),$method==='DELETE'?null:$input);respond(['ok'=>true]); }
    if ($path==='/seller/export' && $method==='GET') { $owner=$needUser('seller');$store=$service->ownStore($owner,$owner['id']);respond(['format'=>'lk-tech-store-export-v1','seller'=>$store['profile'],'products'=>$store['products']]); }
    throw new ApiFailure('Endpoint not found.',404);
} catch (ApiFailure $error) { respond(['error'=>$error->getMessage()],$error->status); }
catch (Throwable $error) { error_log('LK storage service: '.get_class($error).': '.$error->getMessage());respond(['error'=>'The storage service is unavailable. Your changes were not saved.'],503); }
