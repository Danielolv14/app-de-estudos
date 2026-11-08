# Servico de bloqueio do App de Estudos.
#
# Roda como SYSTEM (tarefa agendada criada pelo instalar.ps1) e mantem o arquivo hosts igual
# ao que o app pediu em pedido.json: com o bloco de bloqueio quando "bloquear" e verdadeiro,
# sem ele quando nao. Confere a cada segundo, entao se alguem (ou algum programa) apagar o
# bloco no meio da sessao, ele volta sozinho.
#
# Seguranca: o pedido.json pode ser escrito pelo usuario comum, entao este script so aceita
# nomes de dominio validos e sempre aponta para 0.0.0.0 e ::. Nunca grava um IP vindo do pedido.
#
# Este arquivo e so ASCII de proposito: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

param(
  [string]$Pasta = (Join-Path $env:ProgramData 'AppDeEstudos'),
  [string]$Hosts = (Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'),
  [switch]$UmaVez
)

$ErrorActionPreference = 'Stop'
$Latin1 = [Text.Encoding]::GetEncoding(28591)   # le e grava byte a byte, sem estragar o resto do arquivo
$Utf8 = New-Object Text.UTF8Encoding $false
$Inicio = '# >>> App de Estudos: bloqueio (gerado automaticamente) >>>'
$Fim = '# <<< App de Estudos <<<'
$Padrao = '(?s)(\r?\n)*' + [regex]::Escape($Inicio) + '.*?' + [regex]::Escape($Fim) + '\r?\n?'
$PedidoPath = Join-Path $Pasta 'pedido.json'
$StatusPath = Join-Path $Pasta 'status.json'
$DominioValido = '^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'

function Ler-Pedido {
  if (-not (Test-Path -LiteralPath $PedidoPath)) { return $null }
  try { return ([IO.File]::ReadAllText($PedidoPath) | ConvertFrom-Json) } catch { return $null }
}

function Dominios-Validos($lista) {
  $vistos = @{}
  $saida = New-Object System.Collections.Generic.List[string]
  foreach ($d in @($lista)) {
    if ($d -isnot [string]) { continue }
    $x = $d.Trim().ToLowerInvariant()
    if ($x -match $DominioValido -and -not $vistos.ContainsKey($x) -and $saida.Count -lt 200) {
      $vistos[$x] = $true
      $saida.Add($x)
    }
  }
  # Sai item a item; quem chama junta com @(...). (Devolver o array inteiro com "," quebrava a lista vazia.)
  foreach ($x in $saida) { $x }
}

function Sem-Bloco([string]$texto) {
  return [regex]::Replace($texto, $Padrao, "`r`n").TrimEnd() + "`r`n"
}

# Monta o conteudo que o hosts deveria ter agora.
function Montar([string]$atual, [bool]$bloquear, [string[]]$dominios) {
  $tem = $atual.Contains($Inicio)
  if (-not $bloquear -or $dominios.Count -eq 0) {
    if (-not $tem) { return $atual }   # nunca mexe no hosts se o bloco nao esta la
    return Sem-Bloco $atual
  }
  $linhas = New-Object System.Collections.Generic.List[string]
  $linhas.Add($Inicio)
  foreach ($d in $dominios) {
    $linhas.Add("0.0.0.0 $d")
    $linhas.Add(":: $d")
  }
  $linhas.Add($Fim)
  if ($tem) { $base = Sem-Bloco $atual } else { $base = $atual.TrimEnd() + "`r`n" }
  return $base + "`r`n" + ($linhas -join "`r`n") + "`r`n"
}

function Gravar-Hosts([string]$texto) {
  for ($i = 0; $i -lt 5; $i++) {
    try {
      if (Test-Path -LiteralPath $Hosts) {
        $item = Get-Item -LiteralPath $Hosts -Force
        if ($item.IsReadOnly) { $item.IsReadOnly = $false }
      }
      [IO.File]::WriteAllText($Hosts, $texto, $Latin1)
      return
    } catch [System.IO.IOException] {
      Start-Sleep -Milliseconds 200
    }
  }
  throw 'hosts em uso por outro programa'
}

function Escrever-Status($obj) {
  [IO.File]::WriteAllText($StatusPath, ($obj | ConvertTo-Json -Compress), $Utf8)
}

New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$ultimoStatus = 0
$ultimaVersao = -1

while ($true) {
  $erro = $null
  $mudou = $false
  $pedido = Ler-Pedido
  $bloquear = [bool]($pedido -and $pedido.bloquear)
  if ($bloquear) { $dominios = @(Dominios-Validos $pedido.dominios) } else { $dominios = @() }
  $versao = $null
  if ($pedido) { $versao = $pedido.versao }

  try {
    if (Test-Path -LiteralPath $Hosts) { $atual = [IO.File]::ReadAllText($Hosts, $Latin1) } else { $atual = '' }
    $novo = Montar $atual $bloquear $dominios
    if ($novo -ne $atual) {
      Gravar-Hosts $novo
      $mudou = $true
    }
  } catch {
    $erro = $_.Exception.Message
  }

  if ($mudou) {
    try { & ipconfig.exe /flushdns | Out-Null } catch { }
  }

  $agora = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($mudou -or $erro -or ($versao -ne $ultimaVersao) -or (($agora - $ultimoStatus) -ge 4000)) {
    try {
      Escrever-Status @{
        versao    = $versao
        bloqueado = ($bloquear -and $dominios.Count -gt 0 -and -not $erro)
        dominios  = $dominios
        vivoEm    = $agora
        erro      = $erro
      }
      $ultimoStatus = $agora
      $ultimaVersao = $versao
    } catch { }
  }

  if ($UmaVez) { break }
  Start-Sleep -Milliseconds 1000
}
