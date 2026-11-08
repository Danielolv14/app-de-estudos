// Testa o serviço de bloqueio de verdade (o .ps1), mas apontando para um hosts falso numa pasta temporária.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VERSAO_SERVICO } from '../src/main/bloqueio'

const SCRIPT = resolve('servico/servico-bloqueio.ps1')
const ORIGINAL = '# Copyright (c) 1993-2009 Microsoft Corp.\r\n#\r\n127.0.0.1 meu-projeto.local\r\n'

let pasta: string
let hosts: string
// Políticas dos navegadores vão para um canto do HKCU, para o teste não precisar de admin nem tocar no HKLM.
let raizReg: string
const politicas = () => `HKCU:\\${raizReg}`
const caminhoReg = (chave: string) => `HKCU\\${raizReg}\\${chave}`

/** Lê um valor do registro de teste (null se não existe). */
function valorReg(chave: string, nome: string): string | null {
  try {
    const out = execFileSync('reg', ['query', caminhoReg(chave), '/v', nome], { stdio: 'pipe' }).toString()
    return out.match(new RegExp(`${nome}\\s+REG_\\w+\\s+(\\S+)`))?.[1] ?? null
  } catch {
    return null
  }
}

function chaveExiste(chave: string): boolean {
  try {
    execFileSync('reg', ['query', caminhoReg(chave)], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function rodar(): void {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT,
    '-Pasta',
    pasta,
    '-Hosts',
    hosts,
    '-Politicas',
    politicas(),
    '-UmaVez'
  ])
}

const pedir = (pedido: object): void => writeFileSync(join(pasta, 'pedido.json'), JSON.stringify(pedido))
const lerHosts = (): string => readFileSync(hosts, 'latin1')
const status = () => JSON.parse(readFileSync(join(pasta, 'status.json'), 'utf8'))

describe('serviço de bloqueio (hosts)', () => {
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bloqueio-'))
    hosts = join(pasta, 'hosts')
    writeFileSync(hosts, ORIGINAL, 'latin1')
    raizReg = `Software\\AppDeEstudosTeste\\${Date.now()}${Math.random().toString(36).slice(2, 6)}\\Policies`
  })

  afterEach(() => {
    try {
      execFileSync('reg', ['delete', 'HKCU\\Software\\AppDeEstudosTeste', '/f'], { stdio: 'pipe' })
    } catch {
      // nada para apagar
    }
  })

  it('sem pedido, não mexe no hosts e avisa que está vivo', () => {
    rodar()
    expect(lerHosts()).toBe(ORIGINAL)
    expect(status()).toMatchObject({ bloqueado: false, erro: null })
    expect(Date.now() - status().vivoEm).toBeLessThan(15_000)
  })

  it('bloqueia, fica igual se rodar de novo, e libera voltando ao original', () => {
    pedir({ bloquear: true, dominios: ['instagram.com', 'web.whatsapp.com'], versao: 111 })
    rodar()
    const bloqueado = lerHosts()
    expect(bloqueado.startsWith(ORIGINAL)).toBe(true)
    expect(bloqueado).toContain('0.0.0.0 instagram.com\r\n:: instagram.com\r\n0.0.0.0 web.whatsapp.com')
    expect(status()).toMatchObject({ versao: 111, bloqueado: true, dominios: ['instagram.com', 'web.whatsapp.com'] })

    rodar()
    expect(lerHosts()).toBe(bloqueado)

    pedir({ bloquear: false, dominios: [], versao: 112 })
    rodar()
    expect(lerHosts()).toBe(ORIGINAL)
    expect(status()).toMatchObject({ versao: 112, bloqueado: false })
  })

  it('recoloca o bloco se alguém apagar no meio da sessão', () => {
    pedir({ bloquear: true, dominios: ['instagram.com'], versao: 1 })
    rodar()
    writeFileSync(hosts, ORIGINAL, 'latin1')
    rodar()
    expect(lerHosts()).toContain('0.0.0.0 instagram.com')
  })

  it('ignora o que não é domínio (não deixa o pedido redirecionar sites)', () => {
    pedir({
      bloquear: true,
      dominios: ['1.2.3.4 banco.com.br', 'INSTAGRAM.com ', 'instagram.com', 'x\r\n1.2.3.4 banco.com.br', '', 42, '-ruim.com'],
      versao: 7
    })
    rodar()
    const texto = lerHosts()
    expect(texto).not.toContain('banco')
    expect(texto).not.toContain('1.2.3.4')
    expect(texto).not.toContain('ruim')
    expect(texto.match(/0\.0\.0\.0 instagram\.com/g)?.length).toBe(1)
    expect(status().dominios).toEqual(['instagram.com'])
  })

  it('pedido de bloqueio com lista vazia não deixa bloco nenhum', () => {
    pedir({ bloquear: true, dominios: [], versao: 3 })
    rodar()
    expect(lerHosts()).toBe(ORIGINAL)
    expect(status().bloqueado).toBe(false)
    expect(chaveExiste('BraveSoftware\\Brave')).toBe(false)
  })

  it('no bloqueio, tira a janela com Tor e o DNS seguro do Brave (e o DNS seguro do Chrome); ao liberar, tira as políticas', () => {
    pedir({ bloquear: true, dominios: ['instagram.com'], versao: 20 })
    rodar()
    expect(valorReg('BraveSoftware\\Brave', 'TorDisabled')).toBe('0x1')
    expect(valorReg('BraveSoftware\\Brave', 'DnsOverHttpsMode')).toBe('off')
    expect(valorReg('Google\\Chrome', 'DnsOverHttpsMode')).toBe('off')
    // O app compara esta versão para pedir "Reinstalar" quando o script instalado for mais velho.
    expect(status()).toMatchObject({ bloqueado: true, politicas: true, servico: VERSAO_SERVICO })

    pedir({ bloquear: false, dominios: [], versao: 21 })
    rodar()
    expect(valorReg('BraveSoftware\\Brave', 'TorDisabled')).toBeNull()
    expect(chaveExiste('BraveSoftware\\Brave')).toBe(false)
    expect(chaveExiste('Google\\Chrome')).toBe(false)
    expect(status()).toMatchObject({ bloqueado: false, politicas: true })
  })

  it('não apaga política que não é dele', () => {
    execFileSync('reg', ['add', caminhoReg('BraveSoftware\\Brave'), '/v', 'BraveRewardsDisabled', '/t', 'REG_DWORD', '/d', '1', '/f'], { stdio: 'pipe' })
    pedir({ bloquear: true, dominios: ['instagram.com'], versao: 30 })
    rodar()
    pedir({ bloquear: false, dominios: [], versao: 31 })
    rodar()
    expect(valorReg('BraveSoftware\\Brave', 'BraveRewardsDisabled')).toBe('0x1')
    expect(valorReg('BraveSoftware\\Brave', 'TorDisabled')).toBeNull()
  })
})
