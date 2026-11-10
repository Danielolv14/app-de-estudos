// Chama o Claude Code instalado no PC, sem janela (`claude -p`), usando a assinatura do Daniel.
// Cuidados:
// - `--restricted` ignora os arquivos de configuração do usuário. Assim os hooks dele não rodam
//   (eles gravariam uma nota de sessão e um commit no vault a cada chamada).
// - `--tools Read` e `--restricted` deixam a IA só ler arquivos da pasta da tarefa: ela não roda comando nem edita nada.
// - `--strict-mcp-config` sem servidores: nada de MCP (o segundo cérebro, por exemplo).
// - Não dá para usar `--bare`: ele só aceita chave da API, e não o login da assinatura.
// - O pedido vai pela entrada padrão, e não na linha de comando, que no Windows tem limite de tamanho.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Esforco = 'low' | 'medium' | 'high'

export type ChamadaClaude = {
  /** claude.exe (ou, nos testes, o node com um script falso em `prefixo`). */
  exe: string
  prefixo?: string[]
  /** Pasta da tarefa: a única que a IA consegue ler. */
  pasta: string
  pedido: string
  /** Formato da resposta (JSON Schema). O Claude Code confere antes de devolver. */
  formato: object
  modelo: string
  esforco: Esforco
  limiteMs: number
  sinal?: AbortSignal
}

export type RespostaClaude =
  | { ok: true; dados: unknown; segundos: number; tokensEntrada: number; tokensSaida: number }
  | { ok: false; mensagem: string; segundos: number }

/** Procura o claude.exe: o escolhido à mão, o do instalador nativo e o do npm (o claude.cmd chama este). */
export function acharClaude(escolhido: string, path = process.env.PATH ?? '', casa = homedir()): string | null {
  const candidatos: string[] = []
  if (escolhido.trim()) candidatos.push(escolhido.trim())
  const pastas = path.split(';').map((p) => p.trim().replace(/^"|"$/g, '')).filter(Boolean)
  for (const p of pastas) candidatos.push(join(p, 'claude.exe'))
  for (const p of pastas) candidatos.push(join(p, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
  candidatos.push(join(casa, '.local', 'bin', 'claude.exe'))
  return candidatos.find((c) => existsSync(c)) ?? null
}

export function argumentosClaude(c: Pick<ChamadaClaude, 'formato' | 'modelo' | 'esforco'>): string[] {
  return [
    '-p',
    '--restricted',
    '--tools',
    'Read',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--permission-prompts',
    'none',
    '--no-session-persistence',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(c.formato),
    '--model',
    c.modelo,
    '--effort',
    c.esforco
  ]
}

/**
 * Tira as variáveis do Claude e da Anthropic do ambiente. Uma ANTHROPIC_API_KEY esquecida faria a chamada
 * ser cobrada na API em vez de usar a assinatura, e as do app desktop do Claude confundem o login.
 */
export function ambienteLimpo(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/i.test(k)))
}

/** Tradução dos erros do Claude Code para o que fazer. */
export function explicarErro(texto: string): string {
  const t = texto.toLowerCase()
  if (/authenticat|oauth|log ?in|not logged|unauthorized|401/.test(t))
    return 'O Claude Code deste PC não está logado. Abra um terminal, rode "claude auth login", entre com a sua conta e tente de novo.'
  if (/usage limit|rate limit|limit reached|too many requests|429|overloaded|529/.test(t))
    return 'O limite de uso do seu plano do Claude acabou por enquanto (ou o serviço está cheio). Tente de novo mais tarde.'
  if (/enotfound|econnrefused|network|fetch failed|getaddrinfo|socket/.test(t)) return 'Sem conexão com o Claude. Confira a internet e tente de novo.'
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return `O Claude Code deu erro: ${limpo.slice(0, 300) || 'sem mensagem'}`
}

/** Tira o JSON de um texto (com ou sem cercas de código), para quando a resposta estruturada não vier separada. */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  try {
    return JSON.parse(semCerca)
  } catch {
    const ini = semCerca.indexOf('{')
    const fim = semCerca.lastIndexOf('}')
    if (ini >= 0 && fim > ini) return JSON.parse(semCerca.slice(ini, fim + 1))
    throw new Error('sem JSON')
  }
}

type SaidaJson = {
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
}

/** Lê a saída do `claude -p --output-format json`. */
export function lerSaida(stdout: string): { ok: true; dados: unknown; tokensEntrada: number; tokensSaida: number } | { ok: false; mensagem: string } {
  let r: SaidaJson
  try {
    r = JSON.parse(stdout.trim()) as SaidaJson
  } catch {
    return { ok: false, mensagem: explicarErro(stdout) }
  }
  if (r.is_error) return { ok: false, mensagem: explicarErro(r.result ?? '') }
  const u = r.usage ?? {}
  const tokensEntrada = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  const tokensSaida = u.output_tokens ?? 0
  if (r.structured_output !== undefined && r.structured_output !== null) return { ok: true, dados: r.structured_output, tokensEntrada, tokensSaida }
  try {
    return { ok: true, dados: extrairJson(r.result ?? ''), tokensEntrada, tokensSaida }
  } catch {
    return { ok: false, mensagem: 'A resposta da IA veio num formato que o app não entendeu. Tente de novo.' }
  }
}

export function rodarClaude(c: ChamadaClaude): Promise<RespostaClaude> {
  const inicio = Date.now()
  const segundos = () => Math.round((Date.now() - inicio) / 100) / 10
  return new Promise((resolver) => {
    let terminou = false
    const fim = (r: RespostaClaude) => {
      if (terminou) return
      terminou = true
      clearTimeout(relogio)
      c.sinal?.removeEventListener('abort', aoCancelar)
      resolver(r)
    }

    const filho = spawn(c.exe, [...(c.prefixo ?? []), ...argumentosClaude(c)], {
      cwd: c.pasta,
      env: ambienteLimpo(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let saida = ''
    let erro = ''
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (d: string) => (saida += d))
    filho.stderr.on('data', (d: string) => (erro += d))

    const relogio = setTimeout(() => {
      filho.kill()
      fim({ ok: false, mensagem: `A IA passou de ${Math.round(c.limiteMs / 60_000)} min sem responder, e eu cancelei. Tente de novo.`, segundos: segundos() })
    }, c.limiteMs)
    const aoCancelar = () => {
      filho.kill()
      fim({ ok: false, mensagem: 'Cancelado.', segundos: segundos() })
    }
    if (c.sinal?.aborted) aoCancelar()
    c.sinal?.addEventListener('abort', aoCancelar)

    filho.on('error', (e: NodeJS.ErrnoException) =>
      fim({
        ok: false,
        mensagem: e.code === 'ENOENT' ? 'Não achei o Claude Code neste PC. Instale ou escolha o claude.exe em Ajustes.' : explicarErro(e.message),
        segundos: segundos()
      })
    )
    filho.on('close', (codigo) => {
      if (terminou) return
      if (!saida.trim()) return fim({ ok: false, mensagem: explicarErro(erro || `saiu com código ${codigo}`), segundos: segundos() })
      const r = lerSaida(saida)
      fim(r.ok ? { ...r, segundos: segundos() } : { ok: false, mensagem: r.mensagem, segundos: segundos() })
    })
    // Sem isto, um erro de escrita (o processo já morreu) derruba o app.
    filho.stdin.on('error', () => {})
    filho.stdin.end(c.pedido, 'utf8')
  })
}
