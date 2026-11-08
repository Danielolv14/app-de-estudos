// Testa o serviço de bloqueio de verdade (o .ps1), mas apontando para um hosts falso numa pasta temporária.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve('servico/servico-bloqueio.ps1')
const ORIGINAL = '# Copyright (c) 1993-2009 Microsoft Corp.\r\n#\r\n127.0.0.1 meu-projeto.local\r\n'

let pasta: string
let hosts: string

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
  })
})
