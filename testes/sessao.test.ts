import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { GerenciadorSessao } from '../src/main/sessao'
import { semear } from '../src/main/seed'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
const MIN = 60_000

let agora = new Date(2026, 10, 10, 14, 0).getTime() // ter 10/11, meta de 120 min no plano semeado
let repo: Repositorio
let sessao: GerenciadorSessao
let eventos: string[]

beforeEach(async () => {
  agora = new Date(2026, 10, 10, 14, 0).getTime()
  repo = new Repositorio(await Banco.abrir(null, wasm))
  semear(repo)
  eventos = []
  sessao = new GerenciadorSessao(repo, {
    agora: () => agora,
    ligarBloqueio: (reiniciar) => eventos.push(reiniciar ? 'liga+chrome' : 'liga'),
    desligarBloqueio: () => eventos.push('desliga'),
    mudou: () => {}
  })
})

const tarefaDeHoje = () => repo.tarefas().find((t) => t.data === '2026-11-10')!

describe('sessão de estudo', () => {
  it('começa na tarefa, liga o bloqueio com reinício do Chrome e não abre duas sessões', () => {
    const t = tarefaDeHoje()
    const a = sessao.iniciar(t.id)
    expect(a).toMatchObject({ tarefaId: t.id, materiaId: t.materiaId, dia: '2026-11-10', status: 'estudando' })
    expect(sessao.iniciar(null).sessaoId).toBe(a.sessaoId)
    expect(eventos).toEqual(['liga+chrome'])
  })

  it('pausa sem desbloquear e trava o encerramento antes da meta', () => {
    sessao.iniciar(tarefaDeHoje().id)
    agora += 30 * MIN
    sessao.pausar()
    agora += 10 * MIN
    expect(eventos).toEqual(['liga+chrome'])

    const trava = sessao.situacaoTrava()
    expect(trava).toMatchObject({ livre: false, metaMin: 120, faltamMin: 90 })
    expect(trava.frase).toBe('Vou parar 1h30 antes da meta de hoje, mesmo faltando 16 dias para a Atividade avaliativa 2 de Cálculo.')
    expect(sessao.encerrar({ marcarFeita: false })).toEqual({ ok: false, motivo: 'frase' })
    expect(sessao.encerrar({ frase: 'quero parar', marcarFeita: false })).toEqual({ ok: false, motivo: 'frase' })
    expect(sessao.ativa()).not.toBeNull()

    expect(sessao.encerrar({ frase: trava.frase.toLowerCase(), marcarFeita: false })).toEqual({ ok: true })
    expect(eventos).toEqual(['liga+chrome', 'desliga'])
    const s = repo.sessoes()[0]
    expect(s).toMatchObject({ estudoSeg: 1800, pausaSeg: 600, antesDaMeta: true })
    expect(repo.tarefa(tarefaDeHoje().id)?.feita).toBe(false)
  })

  it('com a meta batida encerra livre e marca a tarefa como feita', () => {
    const t = tarefaDeHoje()
    sessao.iniciar(t.id)
    agora += 121 * MIN
    expect(sessao.situacaoTrava().livre).toBe(true)
    expect(sessao.encerrar({ marcarFeita: true })).toEqual({ ok: true })
    expect(repo.tarefa(t.id)?.feita).toBe(true)
    expect(repo.sessoes()[0].antesDaMeta).toBe(false)
  })

  it('soma sessões do mesmo dia para a meta', () => {
    sessao.iniciar(tarefaDeHoje().id)
    agora += 100 * MIN
    sessao.encerrar({ frase: sessao.situacaoTrava().frase, marcarFeita: false })
    sessao.iniciar(null)
    agora += 15 * MIN
    expect(sessao.situacaoTrava()).toMatchObject({ livre: false, faltamMin: 5 })
    agora += 5 * MIN
    expect(sessao.situacaoTrava().livre).toBe(true)
  })

  it('guarda o check-in do fim da sessão, numa linha só', () => {
    sessao.iniciar(tarefaDeHoje().id)
    agora += 121 * MIN
    sessao.encerrar({ marcarFeita: true, feito: '  3.4 e 3.5,\n exercícios 1 a 27 ', travou: 'implícita com produto' })
    expect(repo.sessoes()[0]).toMatchObject({ checkinFeito: '3.4 e 3.5, exercícios 1 a 27', checkinTravou: 'implícita com produto' })
  })

  it('dia sem tarefa (folga) não tem trava', () => {
    agora = new Date(2026, 10, 9, 15, 0).getTime() // segunda
    sessao.iniciar(null)
    agora += 5 * MIN
    expect(sessao.encerrar({ marcarFeita: false })).toEqual({ ok: true })
  })

  it('recupera a sessão depois de o PC desligar: volta pausada e religa o bloqueio sem mexer no Chrome', () => {
    sessao.iniciar(tarefaDeHoje().id)
    agora += 20 * MIN
    sessao.batimento()
    agora += 180 * MIN // PC desligado
    expect(sessao.recuperarAoAbrir()).toBe(true)
    const a = sessao.ativa()!
    expect(a.status).toBe('pausado')
    expect(sessao.situacaoTrava().estudadoMs).toBe(20 * MIN)
    expect(eventos).toEqual(['liga+chrome', 'liga'])
  })
})
