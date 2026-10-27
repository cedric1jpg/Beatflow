@echo off
set SCRIPT_DIR=%~dp0
set SHORTCUT=%USERPROFILE%\Desktop\Beatflow.lnk
set TARGET=%SCRIPT_DIR%beatflow.bat

powershell -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%SHORTCUT%'); " ^
  "$s.TargetPath = '%TARGET%'; " ^
  "$s.WorkingDirectory = '%SCRIPT_DIR%'; " ^
  "$s.Description = 'Launch Beatflow'; " ^
  "$s.Save()"

echo Shortcut created on Desktop.
pause
