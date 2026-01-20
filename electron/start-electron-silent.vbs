Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & WScript.ScriptFullName & "\..\start-electron.bat" & Chr(34), 0, False
Set WshShell = Nothing
