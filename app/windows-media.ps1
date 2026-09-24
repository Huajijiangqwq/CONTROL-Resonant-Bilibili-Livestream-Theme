# SPDX-License-Identifier: MIT
# Original Windows SMTC adapter; read-only. No player control or audio recording.
param([int]$OwnerPid = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
$awaitMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-WinRT($operation, [Type]$type) {
    $task = $awaitMethod.MakeGenericMethod($type).Invoke($null, @($operation))
    if (-not $task.Wait(3000)) { throw 'Windows media response timed out' }
    return $task.Result
}
function Emit($value) { [Console]::WriteLine(($value | ConvertTo-Json -Compress -Depth 5)) }
$manager = $null
$lastKey = ''
$lastCover = ''
$coverRetry = 0
while ($true) {
    if ($OwnerPid -gt 0 -and -not (Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue)) { break }
    try {
        if (-not $manager) { $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
        $session = $manager.GetCurrentSession()
        if (-not $session) {
            Emit @{ connected=$true; hasSong=$false; paused=$true; title=''; artist=''; album=''; id=''; cover=''; duration=0; position=0 }
        } else {
            $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $play = $session.GetPlaybackInfo()
            $timeline = $session.GetTimelineProperties()
            $key = $session.SourceAppUserModelId + '|' + $props.Title + '|' + $props.Artist
            $now = [DateTimeOffset]::UtcNow
            if ($key -ne $lastKey) { $lastKey=$key; $lastCover=''; $coverRetry=0 }
            # Re-read briefly after a track change: title and thumbnail can update separately.
            $includeCover = $coverRetry -lt 3
            if ($includeCover) {
                $coverRetry++
                if ($props.Thumbnail) {
                    $stream = $null; $reader = $null
                    try {
                        $stream = Await-WinRT ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                        if ($stream.Size -gt 0 -and $stream.Size -le 4194304) {
                            $reader = [Windows.Storage.Streams.DataReader]::new($stream)
                            $null = Await-WinRT ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
                            $bytes = New-Object byte[] ([int]$stream.Size)
                            $reader.ReadBytes($bytes)
                            $mime = $stream.ContentType
                            if ($mime -match '^image/(png|jpeg|jpg|webp|gif)$') { $lastCover = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes) }
                        }
                    } catch { } finally {
                        if ($reader) { $reader.Dispose() }
                        if ($stream) { $stream.Dispose() }
                    }
                }
            }
            $paused = $play.PlaybackStatus.ToString() -ne 'Playing'
            $duration = [Math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalSeconds)
            $position = [Math]::Max(0, ($timeline.Position - $timeline.StartTime).TotalSeconds)
            if (-not $paused) {
                $elapsed = [Math]::Max(0, ($now - $timeline.LastUpdatedTime).TotalSeconds)
                if ($elapsed -lt 120) { $position += $elapsed }
            }
            if ($duration -gt 0) { $position = [Math]::Min($duration,$position) }
            $result = @{ connected=$true; hasSong=([bool]$props.Title); paused=$paused; title=$props.Title; artist=$props.Artist; album=$props.AlbumTitle; id=$key; duration=$duration; position=$position }
            if ($includeCover) { $result.cover=$lastCover }
            Emit $result
        }
    } catch {
        Emit @{ connected=$false; error=$_.Exception.Message }
        $manager = $null
    }
    Start-Sleep -Milliseconds 750
}
