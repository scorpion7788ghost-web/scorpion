$ErrorActionPreference = 'Stop'
$env:PHP_INI_SCAN_DIR = Join-Path $PSScriptRoot '../.php/conf.d'
Push-Location $PSScriptRoot
try {
    php artisan serve --host=127.0.0.1 --port=8000
} finally {
    Pop-Location
}
