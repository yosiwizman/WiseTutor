# Creates WiseTutor shortcuts on Desktop and Start Menu.
# Run with: Right-click -> Run with PowerShell (or double-click after allowing script execution)
$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $MyInvocation.MyCommand.Definition
$batPath = Join-Path $source "WiseTutor.bat"

function Make-Shortcut($lnkPath, $target) {
  $WshShell = New-Object -ComObject WScript.Shell
  $s = $WshShell.CreateShortcut($lnkPath)
  $s.TargetPath = $target
  $s.WorkingDirectory = $source
  $s.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
  $s.Description = "WiseTutor"
  $s.Save()
}

$desktopLnk   = [Environment]::GetFolderPath('Desktop')    + "\WiseTutor.lnk"
$startMenuLnk = [Environment]::GetFolderPath('StartMenu')  + "\Programs\WiseTutor.lnk"

Make-Shortcut -lnkPath $desktopLnk   -target $batPath
Make-Shortcut -lnkPath $startMenuLnk -target $batPath

Write-Host "WiseTutor installed. You can launch it from the Desktop or the Start Menu."
