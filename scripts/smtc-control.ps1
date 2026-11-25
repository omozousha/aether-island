# Aether Island — SMTC bridge (controller)
# Reads JSON commands from stdin: {"action":"toggle"|"play"|"pause"|"next"|"previous"|"seek","position":ms}
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

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if ($null -eq $mgr) { exit 1 }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim().Length -eq 0) { continue }

  try {
    $cmd = $line | ConvertFrom-Json
    $session = $mgr.GetCurrentSession()
    if ($null -eq $session) {
      $sessions = $mgr.GetSessions()
      if ($sessions -and $sessions.Count -gt 0) { $session = $sessions[0] }
    }
    if ($null -eq $session) { continue }

    switch ($cmd.action) {
      'toggle'   { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
      'play'     { $null = Await ($session.TryPlayAsync()) ([bool]) }
      'pause'    { $null = Await ($session.TryPauseAsync()) ([bool]) }
      'next'     { $null = Await ($session.TrySkipNextAsync()) ([bool]) }
      'previous' { $null = Await ($session.TrySkipPreviousAsync()) ([bool]) }
      'seek'     {
        if ($null -ne $cmd.position) {
          $null = Await ($session.TryChangePlaybackPositionAsync([long]$cmd.position)) ([bool])
        }
      }
    }
  } catch {}
}
