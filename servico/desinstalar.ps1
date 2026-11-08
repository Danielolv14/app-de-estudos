# Remove o servico de bloqueio do App de Estudos e tira o bloco do arquivo hosts.
# Precisa rodar como administrador. So ASCII de proposito.

$ErrorActionPreference = 'Stop'
$Destino = Join-Path $env:ProgramFiles 'App de Estudos - Bloqueio'
$Dados = Join-Path $env:ProgramData 'AppDeEstudos'
$NomeTarefa = 'Bloqueio'
$PastaTarefa = '\App de Estudos\'

try { Stop-ScheduledTask -TaskName $NomeTarefa -TaskPath $PastaTarefa -ErrorAction Stop } catch { }
try { Unregister-ScheduledTask -TaskName $NomeTarefa -TaskPath $PastaTarefa -Confirm:$false -ErrorAction Stop } catch { }

# Pede "sem bloqueio" e roda o servico uma vez, para ele tirar o bloco do hosts do jeito de sempre.
$servico = Join-Path $Destino 'servico-bloqueio.ps1'
if (-not (Test-Path -LiteralPath $servico)) { $servico = Join-Path $PSScriptRoot 'servico-bloqueio.ps1' }
if (Test-Path -LiteralPath $servico) {
  New-Item -ItemType Directory -Force -Path $Dados | Out-Null
  [IO.File]::WriteAllText((Join-Path $Dados 'pedido.json'), '{"bloquear":false,"dominios":[],"versao":0}')
  & $servico -Pasta $Dados -UmaVez
}

Remove-Item -LiteralPath $Dados -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Destino -Recurse -Force -ErrorAction SilentlyContinue
