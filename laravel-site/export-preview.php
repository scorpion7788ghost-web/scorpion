<?php

// Export a self-contained preview for opening directly in a browser.
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$request = Illuminate\Http\Request::create('http://localhost/');
$response = $kernel->handle($request);

if ($response->getStatusCode() !== 200) {
    fwrite(STDERR, "Portfolio rendering failed.\n");
    exit(1);
}

$html = $response->getContent();
$html = preg_replace('~<link rel="stylesheet" href="[^"]*/css/portfolio\.css">~', '<style>'.file_get_contents(__DIR__.'/public/css/portfolio.css').'</style>', $html);
$html = preg_replace('~<script src="[^"]*/js/portfolio\.js" defer></script>~', '', $html);
$html = str_replace('href="http://localhost"', 'href="#main"', $html);
$html = str_replace('href="http://localhost/"', 'href="#main"', $html);
$html = str_replace('</body>', '<script>'.file_get_contents(__DIR__.'/public/js/portfolio.js').'</script></body>', $html);
file_put_contents(dirname(__DIR__).'/hii.html', $html);
$kernel->terminate($request, $response);
echo "Saved standalone portfolio to hii.html\n";
