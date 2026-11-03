[CmdletBinding()]
param(
    [ValidateSet('GitHub','Local')][string]$Storage = 'GitHub',
    [switch]$UseGitCredentialManager,
    [ValidateRange(1024,65535)][int]$CustomerPort = 8080,
    [ValidateRange(1024,65535)][int]$SellerPort = 8081
)
$ErrorActionPreference = 'Stop'
if ($CustomerPort -eq $SellerPort) { throw 'Customer and Seller Site must use different ports.' }
$root = $PSScriptRoot
$runtime = Join-Path $root 'server/storage'
$php = (Get-Command php -ErrorAction Stop).Source
$router = Join-Path $root 'server/router.php'
$publicDirectory = Join-Path $root 'server/public'
$variables = @('LK_CA_BUNDLE','LK_PORTAL','LK_STORAGE_DIR','LK_STORAGE_DRIVER','LK_GITHUB_REPOSITORY','LK_GITHUB_BRANCH','LK_GITHUB_TOKEN','LK_ALLOWED_HOSTS','LK_CUSTOMER_URL','LK_SELLER_URL','PHP_INI_SCAN_DIR')
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$started = @()
try {
    foreach ($port in @($CustomerPort,$SellerPort)) {
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $port is in use. Stop the existing server or choose different ports." }
    }
    if ($Storage -eq 'GitHub' -and -not $env:LK_GITHUB_TOKEN) {
        if (-not $UseGitCredentialManager) { throw 'Set LK_GITHUB_TOKEN on the server or run with -UseGitCredentialManager to use your existing GitHub sign-in.' }
        $credentialInput = "protocol=https`nhost=github.com`n`n"
        $credentialOutput = $credentialInput | git credential fill
        $credentialData = @{}
        foreach ($line in $credentialOutput) { if ($line -match '^([^=]+)=(.*)$') { $credentialData[$matches[1]] = $matches[2] } }
        if (-not $credentialData.password) { throw 'GitHub sign-in is required.' }
        $env:LK_GITHUB_TOKEN = $credentialData.password
        $credentialData.Clear(); $credentialOutput = $null; $credentialInput = $null
    }
    if (-not $env:LK_CA_BUNDLE -and (Get-Command python -ErrorAction SilentlyContinue)) {
        $bundle = & python -c 'from pip._vendor import certifi; print(certifi.where())' 2>$null
        if ($bundle -and (Test-Path -LiteralPath $bundle)) { $env:LK_CA_BUNDLE = $bundle.Trim() }
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'logs') | Out-Null
    $env:LK_STORAGE_DIR = $runtime
    $env:LK_STORAGE_DRIVER = $Storage.ToLowerInvariant()
    if (-not $env:LK_GITHUB_REPOSITORY) { $env:LK_GITHUB_REPOSITORY = 'scorpion7788ghost-web/lk-tech-store-data' }
    if (-not $env:LK_GITHUB_BRANCH) { $env:LK_GITHUB_BRANCH = 'main' }
    $env:LK_ALLOWED_HOSTS = '127.0.0.1,localhost'
    $env:LK_CUSTOMER_URL = "http://127.0.0.1:$CustomerPort/"
    $env:LK_SELLER_URL = "http://127.0.0.1:$SellerPort/"
    $ini = Join-Path $root '.php/conf.d'
    if (Test-Path -LiteralPath $ini) { $env:PHP_INI_SCAN_DIR = $ini }
    foreach ($site in @(@{Role='customer';Port=$CustomerPort},@{Role='seller';Port=$SellerPort})) {
        $env:LK_PORTAL = $site.Role
        $arguments = @('-d','display_errors=0','-d','max_execution_time=90','-S',"127.0.0.1:$($site.Port)",'-t',('"'+$publicDirectory+'"'),('"'+$router+'"'))
        $process = Start-Process -FilePath $php -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "logs/$($site.Role).out.log") -RedirectStandardError (Join-Path $runtime "logs/$($site.Role).error.log")
        $started += $process
    }
    @{processIds=@($started | ForEach-Object Id);customerUrl=$env:LK_CUSTOMER_URL;sellerUrl=$env:LK_SELLER_URL;storage=$Storage} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'servers.json') -Encoding utf8
    Write-Output "Customer website: $($env:LK_CUSTOMER_URL)"
    Write-Output "Seller Site: $($env:LK_SELLER_URL)"
    Write-Output "Storage: $Storage"
    Write-Output 'Run ./stop-sites.ps1 to stop these local servers.'
} catch {
    foreach ($process in $started) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
    throw
} finally {
    foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
