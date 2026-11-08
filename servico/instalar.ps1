# Instala o servico de bloqueio do App de Estudos. Precisa rodar como administrador (o app pede uma vez).
#
# 1. Copia o servico-bloqueio.ps1 para "Arquivos de Programas", onde o usuario comum nao consegue
#    alterar o script (ele vai rodar como SYSTEM, entao nao pode ficar numa pasta editavel).
# 2. Cria C:\ProgramData\AppDeEstudos e da permissao ao usuario para escrever o pedido.json.
# 3. Registra uma tarefa agendada que roda como SYSTEM desde o boot, sem limite de tempo,
#    tambem na bateria, e que reinicia sozinha se cair.
#
# So ASCII de proposito (Windows PowerShell 5.1 le .ps1 sem BOM como ANSI).

param(
  [Parameter(Mandatory = $true)][string]$Origem,
  [Parameter(Mandatory = $true)][string]$Usuario
)

$ErrorActionPreference = 'Stop'
$Destino = Join-Path $env:ProgramFiles 'App de Estudos - Bloqueio'
$Dados = Join-Path $env:ProgramData 'AppDeEstudos'
$NomeTarefa = 'Bloqueio'
$PastaTarefa = '\App de Estudos\'

try { Stop-ScheduledTask -TaskName $NomeTarefa -TaskPath $PastaTarefa -ErrorAction Stop } catch { }

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
Copy-Item -LiteralPath (Join-Path $Origem 'servico-bloqueio.ps1') -Destination $Destino -Force
Copy-Item -LiteralPath (Join-Path $Origem 'desinstalar.ps1') -Destination $Destino -Force

New-Item -ItemType Directory -Force -Path $Dados | Out-Null
& icacls.exe $Dados /grant "${Usuario}:(OI)(CI)M" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls falhou com o codigo $LASTEXITCODE" }

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script = Join-Path $Destino 'servico-bloqueio.ps1'
$acao = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$gatilho = New-ScheduledTaskTrigger -AtStartup
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $NomeTarefa -TaskPath $PastaTarefa -Action $acao -Trigger $gatilho `
  -Settings $config -Principal $principal -Force `
  -Description 'Mantem o bloqueio de sites do App de Estudos no arquivo hosts.' | Out-Null

Start-ScheduledTask -TaskName $NomeTarefa -TaskPath $PastaTarefa
