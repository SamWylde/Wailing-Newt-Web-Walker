Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & WScript.ScriptFullName & "\..\start-electron.bat" & Chr(34) & " --silent", 0, False
Set WshShell = Nothing
