param([string]$AppRoot = (Join-Path $PSScriptRoot '../app'))
$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path -LiteralPath $AppRoot).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x compiler not found. Enable .NET Framework 4.8 in Windows.' }
$target = Join-Path $AppRoot 'now-playing-capture.exe'
$sources = @('audio-meter.cs', 'audio-spectrum.cs', 'now-playing-capture.cs') | ForEach-Object { Join-Path $AppRoot $_ }
if ((Test-Path -LiteralPath $target) -and -not ($sources | Where-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc -gt (Get-Item -LiteralPath $target).LastWriteTimeUtc })) { exit 0 }
$temporary = Join-Path $AppRoot 'now-playing-capture.build.exe'
try {
    & $compiler /nologo /target:exe ("/out:" + $temporary) /main:NowPlayingAudio.Entry /r:System.Web.Extensions.dll /r:System.Core.dll @sources
    if ($LASTEXITCODE -ne 0) { throw 'Audio component compilation failed.' }
    Move-Item -LiteralPath $temporary -Destination $target -Force
} finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
