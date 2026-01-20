Set WshShell = CreateObject("WScript.Shell")

' Kill processes on port 5000
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %a >nul 2>&1", 0, True

' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Launch Electron silently
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npm start", 0, False

Set WshShell = Nothing
