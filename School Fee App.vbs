Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)

' start the server with no window
shell.CurrentDirectory = folder & "\backend"
shell.Run "cmd /c node server.js", 0, False

' wait a moment, then open the app in its own window
WScript.Sleep 3000
shell.Run "msedge --app=http://localhost:5000", 1, False