# Aether Island — SMTC bridge (poller)
# Emits one JSON object per line on stdout describing the current media session.
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$ext = [System.WindowsRuntimeSystemExtensions]
$asTaskGeneric = ($ext.GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, [Type]$type) {
  if ($null -eq $op) { return $null }
  try {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    if (-not $task.Wait(2500)) { return $null }
    return $task.Result
  } catch { return $null }
}

function Emit($obj) {
  try {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch {}
}

# Preload WinRT projections
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackInfo, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if ($null -eq $mgr) {
  Emit @{ ok = $false; error = 'smtc-unavailable' }
  exit 1
}

Emit @{ ok = $true; ready = $true }

$lastKey = ''
$lastArt = ''

while ($true) {
  try {
    $session = $mgr.GetCurrentSession()
    if ($null -eq $session) {
      $sessions = $mgr.GetSessions()
      if ($sessions -and $sessions.Count -gt 0) { $session = $sessions[0] }
    }

    if ($null -eq $session) {
      Emit @{ ok = $true; active = $false }
      Start-Sleep -Milliseconds 700
      continue
    }

    $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $session.GetPlaybackInfo()
    $timeline = $session.GetTimelineProperties()

    $title = ''
    $artist = ''
    $album = ''
    if ($null -ne $props) {
      if ($props.Title) { $title = [string]$props.Title }
      if ($props.Artist) { $artist = [string]$props.Artist }
      if ($props.AlbumTitle) { $album = [string]$props.AlbumTitle }
    }

    $key = "$artist|$title|$album"
    $artPayload = $null
    if ($key -ne $lastKey) {
      $lastKey = $key
      $lastArt = ''
      if ($null -ne $props -and $null -ne $props.Thumbnail) {
        try {
          $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          if ($null -ne $stream -and $stream.Size -gt 0 -and $stream.Size -lt 3000000) {
            $reader = [Windows.Storage.Streams.DataReader]::new($stream)
            $null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
            $bytes = New-Object byte[] ([int]$stream.Size)
            $reader.ReadBytes($bytes)
            $reader.Dispose()
            $lastArt = [Convert]::ToBase64String($bytes)
            $stream.Dispose()
          }
        } catch {}
      }
      $artPayload = $lastArt
    }

    $duration = 0.0
    try { $duration = [double]$timeline.EndTime.TotalMilliseconds } catch {}
    if ($duration -le 0) {
      try { $duration = [double]$timeline.MaxSeekTime.TotalMilliseconds } catch {}
    }

    $payload = @{
      ok       = $true
      active   = $true
      key      = $key
      title    = $title
      artist   = $artist
      album    = $album
      status   = [int]$info.PlaybackStatus
      position = [double]$timeline.Position.TotalMilliseconds
      duration = $duration
      app      = [string]$session.SourceAppUserModelId
      canNext  = [bool]$info.Controls.IsNextEnabled
      canPrev  = [bool]$info.Controls.IsPreviousEnabled
      canSeek  = [bool]$info.Controls.IsPlaybackPositionEnabled
    }

    if ($null -ne $artPayload) { $payload.art = $artPayload }

    Emit $payload
  } catch {
    Emit @{ ok = $false; error = "$($_.Exception.Message)" }
  }
  Start-Sleep -Milliseconds 700
}
