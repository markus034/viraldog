const { execSync } = require('child_process');

const currentDir = __dirname.replace(/\\/g, '\\\\');

// PowerShell script executed with UTF-16LE EncodedCommand
const psScript = `
$w = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')

$desktopLnk = [System.IO.Path]::Combine($desktop, 'ViralDog.lnk')
$s1 = $w.CreateShortcut($desktopLnk)
$s1.TargetPath = [System.IO.Path]::Combine('${currentDir}', 'ViralDog.vbs')
$s1.WorkingDirectory = '${currentDir}'
$s1.Description = 'ViralDog - Automação do Instagram'
$s1.IconLocation = [System.IO.Path]::Combine('${currentDir}', 'electron\\assets\\icon.ico') + ',0'
$s1.Save()

$startupLnk = [System.IO.Path]::Combine($startup, 'ViralDog.lnk')
$s2 = $w.CreateShortcut($startupLnk)
$s2.TargetPath = [System.IO.Path]::Combine('${currentDir}', 'ViralDog.vbs')
$s2.WorkingDirectory = '${currentDir}'
$s2.Description = 'ViralDog - Inicialização Automática'
$s2.IconLocation = [System.IO.Path]::Combine('${currentDir}', 'electron\\assets\\icon.ico') + ',0'
$s2.Save()

Write-Host "Atalhos do ViralDog salvos com sucesso!"
`;

const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
execSync(`powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`, { stdio: 'inherit' });
