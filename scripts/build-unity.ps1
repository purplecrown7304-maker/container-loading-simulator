param([string]$UnityEditor = 'C:\Program Files\Unity\Hub\Editor\6000.6.2f1\Editor\Unity.exe')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskProject = Join-Path $taskRoot 'unity'
$taskLog = Join-Path $taskProject 'Logs\web-build.log'
New-Item -ItemType Directory -Force (Split-Path $taskLog) | Out-Null
for ($taskAttempt = 1; $taskAttempt -le 2; $taskAttempt++) {
$taskProcess = Start-Process -FilePath $UnityEditor -ArgumentList @('-batchmode','-nographics','-quit','-projectPath',('"'+$taskProject+'"'),'-buildTarget','WebGL','-executeMethod','WebBuild.Run','-logFile',('"'+$taskLog+'"')) -WindowStyle Hidden -PassThru -Wait
if ($taskProcess.ExitCode -eq 0) { break }
if ($taskAttempt -eq 1 -and (Select-String -LiteralPath $taskLog -Pattern 'Backend has requested a buildprogram run' -Quiet)) { continue }
throw "Unity build failed. See $taskLog"
}
Write-Output 'Unity WebGL build complete: public/unity-viewer'
