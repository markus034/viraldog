Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Executar script Node.js para garantir a codificação UTF-8 correta dos atalhos
strCommand = "cmd.exe /c cd /d """ & strCurrentDir & """ && node configurar_atalhos.js"
WshShell.Run strCommand, 0, True
