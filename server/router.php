<?php
declare(strict_types=1);
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/');
if ($path==='/healthz') { header('Content-Type: application/json'); header('Cache-Control: no-store'); echo '{"status":"ok"}'; return true; }
if ($path==='/api' || str_starts_with($path,'/api/')) { require __DIR__.'/public/index.php'; return true; }
$portal=getenv('LK_PORTAL') ?: 'customer';
$root=realpath(dirname(__DIR__).($portal==='seller'?'/seller-site':''));
if ($path==='/') $path='/index.html';
if (str_contains($path,"\0") || str_contains($path,'\\') || preg_match('#(^|/)\.\.(/|$)#',$path)) { http_response_code(404);return true; }
$isPage=preg_match('#^/[a-z-]+\.html$#D',$path);
$isAsset=preg_match('#^/assets/[a-zA-Z0-9_./-]+\.(css|js|svg|png|jpg|jpeg|webp|ico)$#D',$path);
$target=realpath($root.$path);
if ((!$isPage && !$isAsset) || !$target || !str_starts_with($target,$root.DIRECTORY_SEPARATOR) || !is_file($target)) { http_response_code(404);header('Content-Type: text/plain');echo 'Not found';return true; }
$types=['html'=>'text/html; charset=utf-8','css'=>'text/css; charset=utf-8','js'=>'application/javascript; charset=utf-8','svg'=>'image/svg+xml','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp','ico'=>'image/x-icon'];
header('Content-Type: '.$types[pathinfo($target,PATHINFO_EXTENSION)]);header('X-Content-Type-Options: nosniff');header('Cache-Control: no-cache');readfile($target);return true;
