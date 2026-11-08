// Testa o vigia que fecha apps durante a sessão, usando "ping" como app de mentira
// (nenhum programa de verdade do usuário é tocado).
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scriptVigia } from '../src/main/bloqueio'
import { iniciarPowerShell } from '../src/main/powershell'

const PING = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'PING.EXE')
const abertos: ChildProcess[] = []

function abrir(exe: string): ChildProcess {
  const p = spawn(exe, ['-n', '60', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })
  abertos.push(p)
  return p
}

function vigiar(processos: string[], pastas: string[]): { filho: ChildProcess; fechados: string[] } {
  const filho = iniciarPowerShell(scriptVigia(processos, pastas))
  abertos.push(filho)
  const fechados: string[] = []
  filho.stdout?.on('data', (b: Buffer) => fechados.push(...b.toString().split(/\r?\n/).filter(Boolean)))
  return { filho, fechados }
}

const terminou = (p: ChildProcess, ms: number) =>
  new Promise<boolean>((resolve) => {
    if (p.exitCode !== null || p.signalCode !== null) return resolve(true)
    const t = setTimeout(() => resolve(false), ms)
    p.once('exit', () => {
      clearTimeout(t)
      resolve(true)
    })
  })

afterEach(() => {
  for (const p of abertos.splice(0)) p.kill()
})

describe('vigia de apps', () => {
  it('fecha o processo da lista pelo nome (sem diferenciar maiúsculas nem .exe)', async () => {
    const ping = abrir(PING)
    const v = vigiar(['PING.exe'], [])
    expect(await terminou(ping, 15_000)).toBe(true)
    // O nome chega pela saída do PowerShell logo depois de o processo fechar.
    for (let i = 0; i < 30 && v.fechados.length === 0; i++) await new Promise((r) => setTimeout(r, 100))
    expect(v.fechados.map((n) => n.toLowerCase())).toContain('ping')
  }, 20_000)

  it('fecha o que roda de dentro de uma pasta bloqueada e deixa o resto', async () => {
    const pasta = join(mkdtempSync(join(tmpdir(), 'vigia-')), 'JogosTeste')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(pasta)
    const copia = join(pasta, 'jogo-de-teste.exe')
    copyFileSync(PING, copia)
    const jogo = abrir(copia)
    const outro = abrir(PING)
    vigiar(['nao-existe'], ['\\JogosTeste\\'])
    expect(await terminou(jogo, 15_000)).toBe(true)
    expect(await terminou(outro, 4000)).toBe(false)
  }, 25_000)
})
