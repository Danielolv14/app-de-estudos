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

/** O app aberto, com o batimento de 30 s rodando. */
function passar(min: number): void {
  for (let s = 0; s < min * 2; s++) {
    agora += 30_000
    expect(sessao.batimento()).toBeNull()
  }
}

describe('sessão de estudo', () => {
  it('começa na tarefa, liga o bloqueio com reinício do navegador e não abre duas sessões', () => {
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

  it('a frase da trava usa a avaliação da matéria da sessão, com o nome dela', () => {
    const arq = repo.materias().find((m) => m.nome === 'Arquitetura')!
    // A Prova 2 de Arquitetura vem antes da AA2 de Cálculo, mas a sessão é de Cálculo.
    repo.salvarEvento({ materiaId: arq.id, data: '2026-11-18', titulo: 'Prova 2', tipo: 'prova', pontos: 30, meta: null, nota: null, conteudo: '' })
    sessao.iniciar(tarefaDeHoje().id)
    expect(sessao.situacaoTrava().frase).toBe('Vou parar 2h antes da meta de hoje, mesmo faltando 16 dias para a Atividade avaliativa 2 de Cálculo.')
    sessao.encerrar({ frase: sessao.situacaoTrava().frase, marcarFeita: false })

    // Sessão sem tarefa: vale a próxima de qualquer matéria, com o nome dela.
    sessao.iniciar(null)
    expect(sessao.situacaoTrava().frase).toBe('Vou parar 2h antes da meta de hoje, mesmo faltando 8 dias para a Prova 2 de Arquitetura.')
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

  it('recupera a sessão depois de o PC desligar: volta pausada e religa o bloqueio sem reiniciar o navegador', () => {
    sessao.iniciar(tarefaDeHoje().id)
    passar(20)
    agora += 180 * MIN // PC desligado
    expect(sessao.recuperarAoAbrir()).toBe(true)
    const a = sessao.ativa()!
    expect(a.status).toBe('pausado')
    expect(sessao.situacaoTrava().estudadoMs).toBe(20 * MIN)
    expect(eventos).toEqual(['liga+chrome', 'liga'])
  })

  it('o PC dormindo com o app aberto não conta: volta pausada e o batimento não anda enquanto ele dorme', () => {
    sessao.iniciar(tarefaDeHoje().id)
    passar(20)
    sessao.suspender()
    agora += 30_000
    expect(sessao.batimento()).toBeNull() // o timer do app ainda pode disparar com o Windows indo dormir
    agora += 45 * MIN
    expect(sessao.acordar()).toBe(45 * MIN + 30_000)
    expect(sessao.ativa()!.status).toBe('pausado')
    expect(sessao.situacaoTrava().estudadoMs).toBe(20 * MIN)

    sessao.retomar()
    passar(10)
    expect(sessao.situacaoTrava().estudadoMs).toBe(30 * MIN)
    expect(sessao.acordar()).toBeNull() // "voltou" sem ter dormido: nada muda
  })

  it('dormir com a sessão pausada não vira pausa', () => {
    sessao.iniciar(tarefaDeHoje().id)
    passar(10)
    sessao.pausar()
    passar(5)
    sessao.suspender()
    agora += 60 * MIN
    sessao.acordar()
    agora += 5 * MIN
    sessao.retomar()
    sessao.encerrar({ frase: sessao.situacaoTrava().frase, marcarFeita: false })
    expect(repo.sessoes()[0]).toMatchObject({ estudoSeg: 600, pausaSeg: 600 })
  })

  it('se o aviso do Windows não chegar, o batimento percebe o pulo do relógio e conta só até o último sinal', () => {
    sessao.iniciar(tarefaDeHoje().id)
    passar(15)
    agora += 40 * MIN // dormiu sem o app saber
    expect(sessao.batimento()).toBe(40 * MIN)
    expect(sessao.ativa()!.status).toBe('pausado')
    expect(sessao.situacaoTrava().estudadoMs).toBe(15 * MIN)
  })
})
