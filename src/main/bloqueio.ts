// Liga e desliga o bloqueio durante a sessão:
//  - sites: pede ao serviço (que roda como SYSTEM) para colocar ou tirar o bloco do hosts;
//  - Chrome: reinicia no começo da sessão, porque o hosts não derruba conexões já abertas;
//  - apps do PC: um PowerShell em segundo plano fecha os programas da lista enquanto a sessão durar.
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config, StatusBloqueio } from '@shared/tipos'
import { aspas, iniciarPowerShell, rodarComoAdmin } from './powershell'

export const PASTA_DADOS = join(process.env.ProgramData ?? 'C:\\ProgramData', 'AppDeEstudos')
const PEDIDO = join(PASTA_DADOS, 'pedido.json')
const STATUS = join(PASTA_DADOS, 'status.json')

type StatusServico = { versao: number | null; bloqueado: boolean; vivoEm: number; erro: string | null }

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lerStatusServico(): StatusServico | null {
  try {
    return JSON.parse(readFileSync(STATUS, 'utf8').replace(/^\uFEFF/, '')) as StatusServico
  } catch {
    return null
  }
}

export function statusBloqueio(): StatusBloqueio {
  const instalado = existsSync(PASTA_DADOS)
  const s = lerStatusServico()
  const vivo = !!s && Date.now() - s.vivoEm < 15_000
  return { instalado, vivo, bloqueado: vivo && !!s?.bloqueado, erro: s?.erro ?? null }
}

/** Escreve o pedido e espera o serviço confirmar (até 6 s). */
async function pedir(bloquear: boolean, dominios: string[]): Promise<boolean> {
  if (!existsSync(PASTA_DADOS)) return false
  const versao = Date.now()
  writeFileSync(PEDIDO, JSON.stringify({ bloquear, dominios, versao }))
  for (let i = 0; i < 24; i++) {
    await esperar(250)
    if (lerStatusServico()?.versao === versao) return true
  }
  return false
}

// ---------- Chrome ----------

function processoRodando(imagem: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${imagem}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (_e, out) =>
      resolve(String(out).toLowerCase().includes(`"${imagem.toLowerCase()}"`))
    )
  })
}

function caminhoChrome(): string | null {
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
  for (const base of bases) {
    if (!base) continue
    const c = join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')
    if (existsSync(c)) return c
  }
  return null
}

const taskkill = (args: string[]) => new Promise<void>((r) => execFile('taskkill', args, { windowsHide: true }, () => r()))

/**
 * Fecha o Chrome do jeito normal (como clicar no X, então ele salva as abas) e reabre restaurando a sessão.
 * As abas voltam, mas Instagram e WhatsApp Web precisam conectar de novo e caem no bloqueio.
 */
export async function reiniciarChrome(): Promise<boolean> {
  if (!(await processoRodando('chrome.exe'))) return false
  const caminho = caminhoChrome()
  await taskkill(['/IM', 'chrome.exe'])
  for (let i = 0; i < 20 && (await processoRodando('chrome.exe')); i++) await esperar(500)
  if (await processoRodando('chrome.exe')) await taskkill(['/F', '/IM', 'chrome.exe', '/T'])
  await esperar(800)
  if (caminho) spawn(caminho, ['--restore-last-session'], { detached: true, stdio: 'ignore' }).unref()
  return true
}

// ---------- Apps do PC ----------

/** Script do vigia: a cada 3 s fecha o que estiver na lista (pelo nome ou pela pasta) e escreve o nome fechado. */
export function scriptVigia(processos: string[], pastas: string[]): string {
  const lista = (xs: string[]) => '@(' + xs.map((x) => aspas(x.toLowerCase().replace(/\.exe$/, ''))).join(',') + ')'
  const listaPastas = '@(' + pastas.map((p) => aspas(p.toLowerCase())).join(',') + ')'
  return `
$nomes = ${lista(processos)}
$pastas = ${listaPastas}
$eu = $PID
while ($true) {
  foreach ($p in Get-Process) {
    if ($p.Id -eq $eu) { continue }
    $alvo = $nomes -contains $p.ProcessName.ToLower()
    if (-not $alvo -and $pastas.Count -gt 0) {
      $caminho = $null
      try { $caminho = $p.Path } catch { }
      if ($caminho) {
        $c = $caminho.ToLower()
        foreach ($pa in $pastas) { if ($c.Contains($pa)) { $alvo = $true; break } }
      }
    }
    if ($alvo) {
      try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; [Console]::Out.WriteLine($p.ProcessName); [Console]::Out.Flush() } catch { }
    }
  }
  Start-Sleep -Seconds 3
}`
}

const NOMES_AMIGAVEIS: Record<string, string> = {
  whatsapp: 'o WhatsApp',
  'whatsapp.root': 'o WhatsApp',
  steam: 'a Steam',
  steamwebhelper: 'a Steam',
  epicgameslauncher: 'a Epic Games',
  epicwebhelper: 'a Epic Games',
  riotclientservices: 'o Riot Client',
  riotclientux: 'o Riot Client',
  riotclientuxrender: 'o Riot Client',
  leagueclient: 'o League of Legends',
  leagueclientux: 'o League of Legends',
  leagueclientuxrender: 'o League of Legends',
  'league of legends': 'o League of Legends',
  valorant: 'o Valorant',
  'valorant-win64-shipping': 'o Valorant'
}

export const nomeAmigavel = (processo: string): string => NOMES_AMIGAVEIS[processo.toLowerCase()] ?? processo

export class ControleBloqueio {
  private vigia: ChildProcess | null = null
  private ligado = false

  constructor(private readonly aoFecharApp: (nome: string) => void) {}

  /** Liga tudo. `reiniciar` = reiniciar o Chrome (só no começo da sessão, não ao recuperar depois de um boot). */
  async ligar(config: Config, reiniciar: boolean): Promise<{ sites: boolean; chromeReiniciado: boolean }> {
    this.ligado = true
    this.iniciarVigia(config)
    const sites = await pedir(true, config.dominios)
    const chromeReiniciado = sites && reiniciar && config.reiniciarChrome ? await reiniciarChrome() : false
    return { sites, chromeReiniciado }
  }

  async desligar(): Promise<void> {
    this.ligado = false
    this.pararVigia()
    await pedir(false, [])
  }

  /** Ajustes mudaram no meio da sessão: atualiza a lista sem reiniciar o Chrome. */
  async atualizar(config: Config): Promise<void> {
    if (!this.ligado) return
    this.pararVigia()
    this.iniciarVigia(config)
    await pedir(true, config.dominios)
  }

  private iniciarVigia(config: Config): void {
    if (this.vigia || (config.processos.length === 0 && config.pastasBloqueadas.length === 0)) return
    const filho = iniciarPowerShell(scriptVigia(config.processos, config.pastasBloqueadas))
    let resto = ''
    filho.stdout?.on('data', (b: Buffer) => {
      const linhas = (resto + b.toString()).split(/\r?\n/)
      resto = linhas.pop() ?? ''
      for (const l of linhas) if (l.trim()) this.aoFecharApp(l.trim())
    })
    filho.on('exit', () => {
      if (this.vigia === filho) this.vigia = null
      // Caiu sozinho no meio da sessão: sobe de novo.
      if (this.ligado) setTimeout(() => this.ligado && this.iniciarVigia(config), 3000)
    })
    this.vigia = filho
  }

  private pararVigia(): void {
    const v = this.vigia
    this.vigia = null
    v?.kill()
  }
}

// ---------- Instalação do serviço ----------

export async function instalarServico(pastaScripts: string): Promise<{ ok: boolean; mensagem: string }> {
  const usuario = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`
  const r = await rodarComoAdmin(
    `& ${aspas(join(pastaScripts, 'instalar.ps1'))} -Origem ${aspas(pastaScripts)} -Usuario ${aspas(usuario)}`
  )
  if (r.cancelado) return { ok: false, mensagem: 'A instalação foi cancelada na janela de administrador.' }
  if (!r.ok) return { ok: false, mensagem: `A instalação falhou: ${r.erro || 'erro desconhecido'}` }
  for (let i = 0; i < 20 && !statusBloqueio().vivo; i++) await esperar(500)
  return statusBloqueio().vivo
    ? { ok: true, mensagem: 'Bloqueio instalado e funcionando.' }
    : { ok: false, mensagem: 'Instalei, mas o serviço ainda não respondeu. Reinicie o PC e confira de novo.' }
}

export async function desinstalarServico(pastaScripts: string): Promise<{ ok: boolean; mensagem: string }> {
  const r = await rodarComoAdmin(`& ${aspas(join(pastaScripts, 'desinstalar.ps1'))}`)
  if (r.cancelado) return { ok: false, mensagem: 'A remoção foi cancelada na janela de administrador.' }
  if (!r.ok) return { ok: false, mensagem: `A remoção falhou: ${r.erro || 'erro desconhecido'}` }
  return { ok: true, mensagem: 'Bloqueio removido. O arquivo hosts voltou ao normal.' }
}
