<?php
declare(strict_types=1);
require_once __DIR__.'/FileStore.php';

final class ApiFailure extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422) { parent::__construct($message); }
}

/** Business rules are independent of the storage adapter for later database migration. */
final class Commerce
{
    public function __construct(public readonly FileStore $files) {}
    public function text(mixed $value, int $max, bool $required = false): string
    {
        if (!is_string($value)) $value = '';
        $value = trim($value);
        if (($required && $value === '') || mb_strlen($value) > $max) throw new ApiFailure('Check the required text fields and their maximum lengths.');
        return $value;
    }
    private function password(mixed $password): string
    {
        if (!is_string($password) || strlen($password) < 12 || strlen($password) > 72) throw new ApiFailure('Use a password between 12 and 72 bytes.');
        return $password;
    }
    public function publicUser(array $user): array
    {
        return array_intersect_key($user, array_flip(['id','role','username','name','email','createdAt','updatedAt']));
    }
    public function user(string $id): ?array { return $this->files->read('users', $id); }
    public function register(string $role, array $input): array
    {
        if (!in_array($role, ['customer','seller'], true)) throw new ApiFailure('Invalid account type.');
        $name = $this->text($input['name'] ?? '', 80, true);
        $username = strtolower($this->text($input['username'] ?? '', 30, true));
        if (!preg_match('/^[a-z0-9_]{3,30}$/D', $username)) throw new ApiFailure('Use 3-30 letters, numbers, or underscores for your username.');
        $password = $this->password($input['password'] ?? null);
        $email = $this->text($input['email'] ?? '', 120);
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiFailure('Enter a valid email address.');
        $hash = password_hash($password, PASSWORD_DEFAULT);
        return $this->files->transaction(function () use ($role,$name,$username,$email,$hash) {
            foreach ($this->files->all('users') as $user) {
                if ($user['role'] === $role && $user['username'] === $username) throw new ApiFailure('That username is already registered for this account type.', 409);
            }
            $now = gmdate(DATE_ATOM);
            $user = ['id'=>$role.'_'.bin2hex(random_bytes(12)), 'role'=>$role, 'username'=>$username, 'name'=>$name, 'email'=>$email, 'passwordHash'=>$hash, 'sessionVersion'=>bin2hex(random_bytes(16)), 'createdAt'=>$now, 'updatedAt'=>$now];
            $this->files->write('users', $user['id'], $user);
            return $user;
        });
    }
    public function login(string $role, string $username, string $password): array
    {
        $username = strtolower(trim($username));
        foreach ($this->files->all('users') as $user) {
            if ($user['role'] === $role && $user['username'] === $username && password_verify($password, $user['passwordHash'])) return $user;
        }
        throw new ApiFailure('Username or password is incorrect for this account type.', 401);
    }
    public function updateAccount(array $user, array $input): array
    {
        return $this->files->transaction(function () use ($user,$input) {
            $next = $this->user($user['id']);
            if (!$next) throw new ApiFailure('Please sign in again.', 401);
            $next['name'] = $this->text($input['name'] ?? '', 80, true);
            $next['email'] = $this->text($input['email'] ?? '', 120);
            if ($next['email'] !== '' && !filter_var($next['email'], FILTER_VALIDATE_EMAIL)) throw new ApiFailure('Enter a valid email address.');
            if (($input['password'] ?? '') !== '') {
                if (!password_verify((string)($input['currentPassword'] ?? ''), $next['passwordHash'])) throw new ApiFailure('Your current password is incorrect.');
                $next['passwordHash'] = password_hash($this->password($input['password']), PASSWORD_DEFAULT);
                $next['sessionVersion'] = bin2hex(random_bytes(16));
            }
            $next['updatedAt'] = gmdate(DATE_ATOM);
            $this->files->write('users', $next['id'], $next);
            return $next;
        });
    }
    public function store(string $id): ?array
    {
        if (!preg_match('/^seller_[a-f0-9]{24}$/D', $id)) return null;
        $owner = $this->user($id);
        if (!$owner || $owner['role'] !== 'seller') return null;
        return $this->files->read('stores', $id) ?? ['profile'=>['id'=>$id,'name'=>$owner['name'],'tagline'=>'','description'=>'','email'=>'','phone'=>'','location'=>'','color'=>'#c5a6f5'], 'products'=>[], 'orders'=>[], 'drafts'=>[]];
    }
    public function ownStore(array $user, string $id): array
    {
        if ($user['role'] !== 'seller' || $user['id'] !== $id) throw new ApiFailure('You can only manage your own store.', 403);
        return $this->store($id) ?? throw new ApiFailure('Store not found.', 404);
    }
    public function catalog(): array
    {
        $stores = []; $products = [];
        foreach ($this->files->all('users') as $user) {
            if ($user['role'] !== 'seller') continue;
            $store = $this->store($user['id']);
            $active = array_values(array_filter($store['products'], fn ($p) => $p['status'] === 'active'));
            $stores[] = ['profile'=>$store['profile'], 'products'=>$active];
            array_push($products, ...$active);
        }
        usort($products, fn ($a,$b) => strcmp($b['createdAt'], $a['createdAt']));
        return ['stores'=>$stores,'products'=>$products];
    }
    public function updateStore(array $user, string $id, array $input): array
    {
        return $this->files->transaction(function () use ($user,$id,$input) {
            $store = $this->ownStore($user,$id);
            foreach (['name'=>120,'tagline'=>140,'description'=>2000,'email'=>120,'phone'=>120,'location'=>120] as $key=>$max) $store['profile'][$key] = $this->text($input[$key] ?? '', $max, $key === 'name');
            if ($store['profile']['email'] !== '' && !filter_var($store['profile']['email'], FILTER_VALIDATE_EMAIL)) throw new ApiFailure('Enter a valid store email.');
            $this->files->write('stores', $id, $store); return $store;
        });
    }
    public function image(mixed $value): string
    {
        if (!$value || $value === 'assets/products/placeholder.svg') return 'assets/products/placeholder.svg';
        if (!is_string($value) || strlen($value) > 900000 || !preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#D', $value, $match)) throw new ApiFailure('Upload a JPG, PNG, or WebP photo.');
        $bytes = base64_decode($match[2], true);
        $size = $bytes === false ? false : @getimagesizefromstring($bytes);
        if (!$size || !in_array($size['mime'], ['image/jpeg','image/png','image/webp'], true) || $size['mime'] !== 'image/'.$match[1] || $size[0]*$size[1] > 40000000) throw new ApiFailure('The uploaded photo is invalid.');
        return $value;
    }
    public function saveProduct(array $user, string $id, array $input, ?string $productId = null): array
    {
        return $this->files->transaction(function () use ($user,$id,$input,$productId) {
            $store = $this->ownStore($user,$id); $existing = null;
            foreach ($store['products'] as $product) if ($product['id'] === $productId) $existing = $product;
            if ($productId && !$existing) throw new ApiFailure('Product not found in your store.', 404);
            $price = is_bool($input['price'] ?? null)?false:filter_var($input['price'] ?? null, FILTER_VALIDATE_FLOAT);
            $stock = is_bool($input['stock'] ?? null)?false:filter_var($input['stock'] ?? null, FILTER_VALIDATE_INT);
            if ($price === false || !is_finite($price) || $price < .01 || $price > 999999.99) throw new ApiFailure('Enter a price from $0.01 to $999,999.99.');
            if ($stock === false || $stock < 0 || $stock > 99999) throw new ApiFailure('Stock must be a whole number from 0 to 99,999.');
            if (!in_array($input['category'] ?? '', ['Tech','Home','Accessories','Lifestyle'], true)) throw new ApiFailure('Choose a category.');
            if (!in_array($input['status'] ?? '', ['active','draft','archived'], true)) throw new ApiFailure('Choose a status.');
            $sku = $this->text($input['sku'] ?? '',40);
            foreach ($store['products'] as $product) if ($sku !== '' && $product['id'] !== $productId && strtolower($product['sku']) === strtolower($sku)) throw new ApiFailure('That SKU is already used in your store.',409);
            $now = gmdate(DATE_ATOM);
            $product = ['id'=>$existing['id'] ?? 'product_'.bin2hex(random_bytes(12)), 'sellerId'=>$id, 'name'=>$this->text($input['name'] ?? '',80,true), 'summary'=>$this->text($input['summary'] ?? '',100,true), 'description'=>$this->text($input['description'] ?? '',2000,true), 'category'=>$input['category'], 'priceCents'=>(int)round($price*100), 'price'=>round($price,2), 'stock'=>$stock, 'status'=>$input['status'], 'sku'=>$sku, 'image'=>$this->image($input['image'] ?? ''), 'color'=>preg_match('/^#[a-fA-F0-9]{6}$/D',(string)($input['color'] ?? ''))?$input['color']:'#e7dbed', 'isNew'=>($input['isNew'] ?? false) === true, 'isCustom'=>true, 'createdAt'=>$existing['createdAt'] ?? $now, 'updatedAt'=>$now];
            if ($existing) $store['products'] = array_map(fn ($p) => $p['id'] === $productId ? $product : $p, $store['products']); else array_unshift($store['products'],$product);
            unset($store['drafts'][$productId ?? 'new']);
            $this->files->write('stores',$id,$store); return $product;
        });
    }
    public function productStatus(array $user, string $productId, string $status): void
    {
        if (!in_array($status,['active','draft','archived'],true)) throw new ApiFailure('Invalid product status.');
        $this->files->transaction(function () use ($user,$productId,$status) {
            $store = $this->ownStore($user,$user['id']); $found = false;
            foreach ($store['products'] as &$product) if ($product['id'] === $productId) { $product['status']=$status; $product['updatedAt']=gmdate(DATE_ATOM); $found=true; }
            unset($product);
            if (!$found) throw new ApiFailure('Product not found in your store.',404);
            $this->files->write('stores',$user['id'],$store);
        });
    }
    public function draft(array $user, string $key, ?array $input): void
    {
        if ($key !== 'new' && !preg_match('/^product_[a-f0-9]{24}$/D',$key)) throw new ApiFailure('Invalid draft.');
        $this->files->transaction(function () use ($user,$key,$input) {
            $store=$this->ownStore($user,$user['id']);
            if ($key !== 'new' && !array_filter($store['products'],fn ($p)=>$p['id']===$key)) throw new ApiFailure('Product not found in your store.',404);
            if ($input === null) unset($store['drafts'][$key]);
            else {
                $draft=[];
                foreach (['name'=>80,'summary'=>100,'description'=>2000,'category'=>30,'price'=>30,'stock'=>10,'status'=>20,'sku'=>40,'imageName'=>200,'color'=>10] as $field=>$max) $draft[$field]=$this->text($input[$field] ?? '',$max);
                $draft['image']=$this->image($input['image'] ?? ''); $draft['isNew']=($input['isNew'] ?? false) === true;
                $store['drafts'][$key]=$draft;
            }
            $this->files->write('stores',$user['id'],$store);
        });
    }
    public function cart(array $user, ?array $items = null): array
    {
        if ($user['role'] !== 'customer') throw new ApiFailure('Customer access is required.',403);
        return $this->files->transaction(function () use ($user,$items) {
            $catalog=array_column($this->catalog()['products'],null,'id');
            $existing=$this->files->read('carts',$user['id'])['items'] ?? [];
            $result=[];
            foreach ($items ?? $existing as $id=>$quantity) {
                if (!isset($catalog[$id])) { if ($items !== null) throw new ApiFailure('A product in your cart is no longer available.'); else continue; }
                if (!is_int($quantity) || $quantity<1 || $quantity>99 || $quantity>$catalog[$id]['stock']) { if ($items !== null) throw new ApiFailure('A cart quantity exceeds the available stock.'); else $quantity=min(99,$catalog[$id]['stock'],max(0,(int)$quantity)); }
                if ($quantity>0) $result[$id]=$quantity;
            }
            if ($items !== null) $this->files->write('carts',$user['id'],['items'=>$result,'updatedAt'=>gmdate(DATE_ATOM)]);
            return $result;
        });
    }
}
