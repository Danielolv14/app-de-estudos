// Bloqueio agendado: liga sozinho no horário de Ajustes, só acaba antes do fim com a meta batida e convive com a sessão.
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'
import { CONFIG_PADRAO } from '../src/shared/padroes'
import { configDuranteBloqueio, situacaoAgendada } from '../src/shared/regras'
import type { HorarioBloqueio } from '../src/shared/tipos'
import { AgendaBloqueio } from '../src/main/agenda'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { GerenciadorSessao } from '../src/main/sessao'
import { semear } from '../src/main/seed'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
const MIN = 60_000
/** Terça, 10/11/2026 (o plano semeado tem 120 min de meta nesse dia). */
const terca = (h: number, m = 0) => new Date(2026, 10, 10, h, m).getTime()

describe('horário do bloqueio agendado', () => {
  const padrao = CONFIG_PADRAO.bloqueioAgendado
  const sit = (agora: number, metaMin = 120, estudadoMs = 0, horarios: HorarioBloqueio[] = padrao) =>
    situacaoAgendada({ agora, horarios, metaMin, estudadoMs })

  it('vem ligado de segunda a sexta, das 13:50 às 18:00', () => {
    expect(padrao.map((h) => h.ativo)).toEqual([false, true, true, true, true, true, false])
    expect(padrao.every((h) => h.inicio === '13:50' && h.fim === '18:00')).toBe(true)
  })

  it('liga às 13:50 e desliga às 18:00', () => {
    expect(sit(terca(13, 49))).toEqual({ noHorario: false, ligado: false, inicio: '13:50', fim: '18:00' })
    expect(sit(terca(13, 50))).toMatchObject({ noHorario: true, ligado: true })
    expect(sit(terca(17, 59))).toMatchObject({ ligado: true })
    expect(sit(terca(18, 0))).toMatchObject({ noHorario: false, ligado: false })
  })

  it('acaba antes só com a meta batida, e em dia sem meta não bloqueia', () => {
    expect(sit(terca(15), 120, 119 * MIN)).toMatchObject({ noHorario: true, ligado: true })
    expect(sit(terca(15), 120, 120 * MIN)).toMatchObject({ noHorario: true, ligado: false })
    expect(sit(terca(15), 0)).toMatchObject({ noHorario: true, ligado: false })
  })

  it('não vale no fim de semana nem com horário quebrado', () => {
    expect(sit(new Date(2026, 10, 14, 15).getTime())).toEqual({ noHorario: false, ligado: false, inicio: null, fim: null })
    const com = (h: HorarioBloqueio) => padrao.map((x, i) => (i === 2 ? h : x))
    expect(sit(terca(15), 120, 0, com({ ativo: true, inicio: '18:00', fim: '13:50' })).ligado).toBe(false)
    expect(sit(terca(15), 120, 0, com({ ativo: true, inicio: '', fim: '18:00' })).ligado).toBe(false)
    expect(sit(terca(15), 120, 0, [])).toMatchObject({ ligado: false, fim: null })
  })

  it('durante o bloqueio, as listas só crescem e a agenda não muda', () => {
    const depois = {
      ...CONFIG_PADRAO,
      dominios: ['youtube.com'],
      bloqueioAgendado: padrao.map((h) => ({ ...h, ativo: false })),
      miniTimer: false
    }
    const c = configDuranteBloqueio(CONFIG_PADRAO, depois)
    expect(c.dominios).toEqual([...CONFIG_PADRAO.dominios, 'youtube.com'])
    expect(c.bloqueioAgendado).toEqual(padrao)
    expect(c.miniTimer).toBe(false)
  })
})

describe('agenda no app', () => {
  let agora = terca(13)
  let repo: Repositorio
  let sessao: GerenciadorSessao
  let agenda: AgendaBloqueio
  let eventos: string[]

  beforeEach(async () => {
    agora = terca(13)
    repo = new Repositorio(await Banco.abrir(null, wasm))
    semear(repo)
    eventos = []
    agenda = new AgendaBloqueio(repo, {
      agora: () => agora,
      ligar: (s) => eventos.push(`liga até ${s.fim}`),
      desligar: (motivo) => eventos.push(`desliga (${motivo ?? 'abrindo'})`),
      mudou: () => {}
    })
    // Os mesmos ganchos do index.ts: a sessão não reinicia o navegador de novo e, ao terminar, a agenda decide.
    sessao = new GerenciadorSessao(repo, {
      agora: () => agora,
      ligarBloqueio: (reiniciar) => eventos.push(reiniciar && !agenda.ligado ? 'sessão liga+navegador' : 'sessão liga'),
      desligarBloqueio: () => eventos.push(agenda.seguraDepoisDaSessao() ? 'segue bloqueado' : 'sessão desliga'),
      mudou: () => {}
    })
  })

  const tarefaDeHoje = () => repo.tarefas().find((t) => t.data === '2026-11-10')!

  it('ao abrir fora do horário, tira o bloqueio que sobrou; no horário, liga uma vez só', () => {
    agenda.conferir(true)
    expect(eventos).toEqual(['desliga (abrindo)'])
    agenda.conferir()
    agora = terca(13, 50)
    agenda.conferir()
    agenda.conferir()
    expect(agenda.ligado).toBe(true)
    expect(eventos).toEqual(['desliga (abrindo)', 'liga até 18:00'])
  })

  it('o app aberto no meio do horário já liga', () => {
    agora = terca(16)
    agenda.conferir(true)
    expect(eventos).toEqual(['liga até 18:00'])
  })

  it('acaba no fim do horário', () => {
    agora = terca(15)
    agenda.conferir()
    agora = terca(18)
    agenda.conferir()
    expect(agenda.ligado).toBe(false)
    expect(eventos).toEqual(['liga até 18:00', 'desliga (horario)'])
  })

  it('sessão encerrada antes da meta não libera: o bloqueio segue até o horário acabar', () => {
    agora = terca(13, 50)
    agenda.conferir()
    agora = terca(14)
    sessao.iniciar(tarefaDeHoje().id)
    agora = terca(14, 30)
    const frase = sessao.situacaoTrava().frase
    expect(sessao.encerrar({ frase, marcarFeita: false })).toEqual({ ok: true })
    agenda.conferir()
    expect(eventos).toEqual(['liga até 18:00', 'sessão liga', 'segue bloqueado'])
    agora = terca(18)
    agenda.conferir()
    expect(eventos.at(-1)).toBe('desliga (horario)')
  })

  it('meta batida na sessão: ao encerrar, o bloqueio acaba junto', () => {
    agora = terca(13, 55)
    agenda.conferir()
    sessao.iniciar(tarefaDeHoje().id)
    agora = terca(15, 56)
    agenda.conferir() // meta batida com a sessão ainda aberta: quem bloqueia é a sessão
    expect(agenda.ligado).toBe(false)
    expect(sessao.encerrar({ marcarFeita: true })).toEqual({ ok: true })
    agenda.conferir()
    expect(eventos).toEqual(['liga até 18:00', 'sessão liga', 'sessão desliga'])
  })

  it('o horário que começa no meio da sessão só vale quando ela termina antes da meta', () => {
    agora = terca(13, 30)
    sessao.iniciar(tarefaDeHoje().id)
    agora = terca(13, 50)
    agenda.conferir()
    expect(agenda.ligado).toBe(true)
    expect(eventos).toEqual(['sessão liga+navegador'])
    agora = terca(14)
    sessao.encerrar({ frase: sessao.situacaoTrava().frase, marcarFeita: false })
    expect(eventos).toEqual(['sessão liga+navegador', 'segue bloqueado'])
  })

  it('dia sem meta não bloqueia; meta tirada no meio libera', () => {
    repo.definirMeta('2026-11-10', 0)
    agora = terca(15)
    agenda.conferir()
    expect(eventos).toEqual([])
    repo.definirMeta('2026-11-10', null)
    agenda.conferir()
    repo.definirMeta('2026-11-10', 0)
    agenda.conferir()
    expect(eventos).toEqual(['liga até 18:00', 'desliga (meta)'])
  })
})
