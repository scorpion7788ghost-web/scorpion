[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot 'server/storage/servers.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No managed local servers found.'; exit }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expectedRouter = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server/router.php'))
foreach ($serverId in $state.processIds) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId="+[int]$serverId) -ErrorAction SilentlyContinue
    if ($process -and $process.Name -eq 'php.exe' -and $process.CommandLine -and $process.CommandLine.Contains($expectedRouter)) {
        Stop-Process -Id ([int]$serverId)
        Write-Output ('Stopped local PHP server '+$serverId)
    }
}
