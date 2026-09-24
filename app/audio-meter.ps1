$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'audio-meter.cs'),(Join-Path $PSScriptRoot 'audio-spectrum.cs') -ReferencedAssemblies 'System.Web.Extensions','System.Core'
[HissAudio.Service]::Run()
