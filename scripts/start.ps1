param([int]$Port = 8791, [switch]$NoBrowser, [switch]$PreviewOnly)
$ErrorActionPreference = 'Stop'
$releaseRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $nodePath) { throw 'Install Node.js 24+ from https://nodejs.org/ then try again.' }
$nodeVersion = & $nodePath --version
$major = $nodeVersion.TrimStart('v').Split('.')[0]
if ([int]$major -lt 24) { throw 'Node.js 24+ is required.' }
$runtimeDir = Join-Path $releaseRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$url = 'http://127.0.0.1:' + $Port
$manifestPath = Join-Path $runtimeDir ('service-' + $Port + '.json')
$running = $false
try {
    $health = Invoke-RestMethod ($url + '/api/release-health') -TimeoutSec 2
    if (Test-Path -LiteralPath $manifestPath) {
        $saved = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $running = $saved.identity -eq $health.identity -and $saved.pid -eq $health.pid
    }
    if (-not $running) { throw 'Another copy is using this port. Stop that copy or choose another port.' }
} catch { if ($_.Exception.Message -like 'Another copy*') { throw } }
if ($running -and -not $PreviewOnly -and $health.previewOnly) { throw 'This copy is in preview-only mode. Stop it before starting all services.' }
if (-not $running) {
    $outLog = Join-Path $runtimeDir ('service-' + $Port + '.out.log')
    $errLog = Join-Path $runtimeDir ('service-' + $Port + '.err.log')
    $serverPath = Join-Path $PSScriptRoot 'serve.js'
    $arguments = @(('"' + $serverPath + '"'), '--port', [string]$Port)
    if ($PreviewOnly) { $arguments += '--preview-only' }
    $proc = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $releaseRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        Start-Sleep -Milliseconds 250
        $proc.Refresh()
        if ($proc.HasExited) { throw (Get-Content -LiteralPath $errLog -Raw -Encoding UTF8) }
        try { $health = Invoke-RestMethod ($url + '/api/release-health') -TimeoutSec 1; if ($health.pid -eq $proc.Id) { $running = $true; break } } catch {}
    }
    if (-not $running) { throw ('Startup timed out. Check ' + $errLog) }
}
Write-Host ('Ready: ' + $url + '/theme-editor.html') -ForegroundColor Green
if (-not $NoBrowser) { Start-Process ($url + '/theme-editor.html') -WindowStyle Hidden }
