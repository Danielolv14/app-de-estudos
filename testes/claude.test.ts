// O executor do Claude Code, testado com um "claude" falso: um script do Node que lê os argumentos e a entrada
// e responde como o `claude -p --output-format json`.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acharClaude, ambienteLimpo, argumentosClaude, explicarErro, extrairJson, lerSaida, rodarClaude, type ChamadaClaude } from '../src/main/claude'

const pasta = mkdtempSync(join(tmpdir(), 'claude-falso-'))
const script = join(pasta, 'claude-falso.cjs')
writeFileSync(
  script,
  `
let pedido = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (pedido += d))
process.stdin.on('end', () => {
  const args = process.argv.slice(2)
  const responder = (o) => process.stdout.write(JSON.stringify(o))
  if (pedido === 'demora') return setTimeout(() => {}, 20000)
  if (pedido === 'login') return responder({ type: 'result', is_error: true, result: 'OAuth token has expired. Please run /login' })
  if (pedido === 'sem-saida') {
    process.stderr.write('Invalid API key')
    process.exit(1)
  }
  if (pedido === 'texto') return responder({ is_error: false, result: 'Pronto:\\n\`\`\`json\\n{"ok": true}\\n\`\`\`', usage: { input_tokens: 5, output_tokens: 2 } })
  responder({
    is_error: false,
    result: '',
    structured_output: {
      pedido,
      args,
      pasta: process.cwd(),
      temChave: Object.keys(process.env).some((k) => /^(ANTHROPIC|CLAUDE)/i.test(k))
    },
    usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 7 }
  })
})
`
)

const chamada = (pedido: string, extra: Partial<ChamadaClaude> = {}): ChamadaClaude => ({
  exe: process.execPath,
  prefixo: [script],
  pasta,
  pedido,
  formato: { type: 'object', properties: { ok: { type: 'boolean' } } },
  modelo: 'opus',
  esforco: 'high',
  limiteMs: 10_000,
  ...extra
})

const chaveAntes = process.env.ANTHROPIC_API_KEY
afterEach(() => {
  if (chaveAntes === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = chaveAntes
})

describe('chamada do Claude Code', () => {
  it('monta os argumentos do modo restrito, só com leitura e sem MCP', () => {
    const a = argumentosClaude({ formato: { type: 'object' }, modelo: 'sonnet', esforco: 'low' })
    expect(a.slice(0, 2)).toEqual(['-p', '--restricted'])
    expect(a).toEqual(expect.arrayContaining(['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']))
    expect(a[a.indexOf('--tools') + 1]).toBe('Read')
    expect(a[a.indexOf('--output-format') + 1]).toBe('json')
    expect(JSON.parse(a[a.indexOf('--json-schema') + 1])).toEqual({ type: 'object' })
    expect(a[a.indexOf('--model') + 1]).toBe('sonnet')
    expect(a[a.indexOf('--effort') + 1]).toBe('low')
    expect(a).not.toContain('--bare')
  })

  it('tira as variáveis do Claude e da Anthropic do ambiente', () => {
    const env = ambienteLimpo({ PATH: 'x', ANTHROPIC_API_KEY: 'k', CLAUDECODE: '1', claude_code_entrypoint: 'y', HOME: 'h' })
    expect(env).toEqual({ PATH: 'x', HOME: 'h' })
  })

  it('traduz os erros para o que fazer', () => {
    expect(explicarErro('OAuth token has expired')).toContain('claude auth login')
    expect(explicarErro('Not logged in · Please run /login')).toContain('claude auth login')
    expect(explicarErro('Claude AI usage limit reached|1731')).toContain('limite de uso')
    expect(explicarErro('getaddrinfo ENOTFOUND api.anthropic.com')).toContain('Sem conexão')
    expect(explicarErro('  outra   coisa ')).toBe('O Claude Code deu erro: outra coisa')
  })

  it('lê a saída: resposta estruturada, JSON no texto, erro e lixo', () => {
    expect(lerSaida(JSON.stringify({ structured_output: { a: 1 }, usage: { input_tokens: 3, cache_read_input_tokens: 4, output_tokens: 2 } }))).toEqual({
      ok: true,
      dados: { a: 1 },
      tokensEntrada: 7,
      tokensSaida: 2
    })
    expect(lerSaida(JSON.stringify({ result: 'Aqui está: {"b": [1]} pronto' }))).toMatchObject({ ok: true, dados: { b: [1] } })
    expect(lerSaida(JSON.stringify({ is_error: true, result: 'Unauthorized (401)' }))).toMatchObject({ ok: false, mensagem: expect.stringContaining('auth login') })
    expect(lerSaida(JSON.stringify({ result: 'não sei' }))).toMatchObject({ ok: false, mensagem: expect.stringContaining('formato') })
    expect(lerSaida('Error: something broke')).toMatchObject({ ok: false, mensagem: expect.stringContaining('something broke') })
    expect(extrairJson('```json\n{"x": 2}\n```')).toEqual({ x: 2 })
  })

  it('acha o claude.exe: o escolhido, o do PATH e o do npm', () => {
    const base = mkdtempSync(join(tmpdir(), 'achar-'))
    const npm = join(base, 'nodejs')
    mkdirSync(join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'bin'), { recursive: true })
    const doNpm = join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    writeFileSync(doNpm, '')
    const escolhido = join(base, 'meu-claude.exe')
    writeFileSync(escolhido, '')
    expect(acharClaude('', `C:\\nada;${npm}`, base)).toBe(doNpm)
    expect(acharClaude(escolhido, npm, base)).toBe(escolhido)
    expect(acharClaude('', join(base, 'vazio'), base)).toBeNull()
  })

  it('manda o pedido pela entrada, roda na pasta da tarefa e sem as chaves no ambiente', async () => {
    process.env.ANTHROPIC_API_KEY = 'nao-pode-vazar'
    const pedido = 'Monte um simulado de cálculo: x² + √x, com acento e "aspas".'
    const r = await rodarClaude(chamada(pedido))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const d = r.dados as { pedido: string; args: string[]; pasta: string; temChave: boolean }
    expect(d.pedido).toBe(pedido)
    expect(d.args).toEqual(argumentosClaude(chamada(pedido)))
    expect(d.pasta.toLowerCase()).toBe(pasta.toLowerCase())
    expect(d.temChave).toBe(false)
    expect(r.tokensEntrada).toBe(130)
    expect(r.tokensSaida).toBe(7)
  })

  it('aceita o JSON dentro do texto quando a resposta estruturada não vem', async () => {
    expect(await rodarClaude(chamada('texto'))).toMatchObject({ ok: true, dados: { ok: true }, tokensEntrada: 5 })
  })

  it('devolve a instrução de login e o erro de quem sai sem resposta', async () => {
    expect(await rodarClaude(chamada('login'))).toMatchObject({ ok: false, mensagem: expect.stringContaining('claude auth login') })
    expect(await rodarClaude(chamada('sem-saida'))).toMatchObject({ ok: false, mensagem: expect.stringContaining('Invalid API key') })
  })

  it('cancela no tempo limite e quando pedem', async () => {
    const lento = await rodarClaude(chamada('demora', { limiteMs: 600 }))
    expect(lento).toMatchObject({ ok: false, mensagem: expect.stringContaining('cancelei') })

    const controle = new AbortController()
    const r = rodarClaude(chamada('demora', { sinal: controle.signal }))
    setTimeout(() => controle.abort(), 300)
    expect(await r).toMatchObject({ ok: false, mensagem: 'Cancelado.' })
  })

  it('avisa quando o executável não existe', async () => {
    const r = await rodarClaude(chamada('x', { exe: join(pasta, 'nao-existe.exe'), prefixo: [] }))
    expect(r).toMatchObject({ ok: false, mensagem: expect.stringContaining('Não achei o Claude Code') })
  })
})
