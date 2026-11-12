param([Parameter(Mandatory=$true)][string]$EncodedAction)
$ErrorActionPreference = 'Stop'
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedAction)) | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BridgeRemoteCursor {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint buttons, UIntPtr info);
}
'@
switch ($payload.type) {
  'move' { [void][BridgeRemoteCursor]::SetCursorPos([int]$payload.x, [int]$payload.y) }
  'click' {
    [void][BridgeRemoteCursor]::SetCursorPos([int]$payload.x, [int]$payload.y)
    [BridgeRemoteCursor]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [BridgeRemoteCursor]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  }
  'type' {
    $text = [string]$payload.text
    # Escape SendKeys metacharacters while retaining ordinary Unicode characters.
    foreach ($char in $text.ToCharArray()) {
      $s = [string]$char
      if ('+^%~(){}[]'.Contains($s)) { $s = "{$s}" }
      [Windows.Forms.SendKeys]::SendWait($s)
    }
  }
  'key' {
    $key = [string]$payload.key
    $map = @{
      'Enter'='{ENTER}';'Return'='{ENTER}';'Tab'='{TAB}';'Escape'='{ESC}';'Esc'='{ESC}';
      'Backspace'='{BACKSPACE}';'Delete'='{DELETE}';'Up'='{UP}';'Down'='{DOWN}';
      'Left'='{LEFT}';'Right'='{RIGHT}';'Home'='{HOME}';'End'='{END}';
      'PageUp'='{PGUP}';'PageDown'='{PGDN}';'Space'=' '
    }
    if ($map.ContainsKey($key)) { $key = $map[$key] }
    elseif ($key -match '^[a-zA-Z0-9]$') { }
    elseif ($key -match '^F([1-9]|1[0-2])$') { $key = "{$key}" }
    elseif ($key -match '^(Ctrl|Alt|Shift)\+([a-zA-Z0-9])$') {
      $mod = $Matches[1]; $letter = $Matches[2]
      $prefix = switch ($mod) { 'Ctrl' {'^'} 'Alt' {'%'} 'Shift' {'+'} }
      $key = "$prefix$letter"
    } else { throw "Unsupported key name." }
    [Windows.Forms.SendKeys]::SendWait($key)
  }
  default { throw "Unsupported input operation." }
}
