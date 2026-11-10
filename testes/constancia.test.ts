import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import type { Sessao, Tarefa } from '@shared/tipos'
import { dias, estudoPorDia, nivel, semanas, sequencia, type DadosConstancia } from '@shared/constancia'
import { gerarResumo } from '@shared/resumo'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados } from '../src/main/seed'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
const H = 3600

const tarefa = (data: string, minutos = 120): Tarefa => ({ id: 0, materiaId: 1, data, titulo: 't', detalhe: '', minutos, feita: false, ordem: 0 })
const sessao = (dia: string, seg: number): Sessao => ({
  id: 0,
  tarefaId: null,
  materiaId: 1,
  dia,
  inicio: 0,
  fim: 1,
  estudoSeg: seg,
  pausaSeg: 0,
  antesDaMeta: false,
  checkinFeito: '',
  checkinTravou: ''
})

// Semana de 2026-11-02 (seg) a 08 (dom). Metas de ter a sex, 2 h cada.
const base = (o: Partial<DadosConstancia> = {}): DadosConstancia => ({
  hoje: '2026-11-10',
  agora: new Date(2026, 10, 10, 15).getTime(),
  tarefas: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-10', '2026-11-11'].map((d) => tarefa(d)),
  sessoes: [],
  metasDia: {},
  ativa: null,
  ...o
})

describe('constância', () => {
  it('fim de semana e segunda (sem meta) não quebram a sequência, e hoje só conta se já cumpriu', () => {
    const d = base({ sessoes: [sessao('2026-11-04', 2 * H), sessao('2026-11-05', 2 * H), sessao('2026-11-06', 3 * H), sessao('2026-11-08', H)] })
    expect(sequencia(d)).toEqual({ atual: 3, recorde: 3 })
    // Hoje cumprido: soma.
    expect(sequencia(base({ sessoes: [...d.sessoes, sessao('2026-11-10', 2 * H)] }))).toEqual({ atual: 4, recorde: 4 })
    // Um dia com meta abaixo zera a atual, mas o recorde fica.
    expect(sequencia(base({ sessoes: [sessao('2026-11-03', 2 * H), sessao('2026-11-04', 2 * H), sessao('2026-11-06', 2 * H)] }))).toEqual({
      atual: 1,
      recorde: 2
    })
    // Meta ajustada à mão vale mais que a soma das tarefas.
    expect(sequencia(base({ metasDia: { '2026-11-03': 30 }, sessoes: [sessao('2026-11-03', 1800)] })).atual).toBe(0)
    expect(sequencia(base({ tarefas: [], sessoes: [] }))).toEqual({ atual: 0, recorde: 0 })
  })

  it('soma a sessão em andamento no dia dela', () => {
    const agora = new Date(2026, 10, 10, 15).getTime()
    const ativa = { sessaoId: 9, tarefaId: null, materiaId: 1, dia: '2026-11-10', status: 'estudando' as const, inicio: agora - 2 * H * 1000, estudoMs: 0, pausaMs: 0, marco: agora - 2 * H * 1000, batimento: agora }
    expect(estudoPorDia({ sessoes: [sessao('2026-11-10', H)], ativa, agora }).get('2026-11-10')).toBe(3 * H * 1000)
  })

  it('dias e semanas: planejado x feito e quantos dias cumpriu', () => {
    const d = base({ sessoes: [sessao('2026-11-03', 3 * H), sessao('2026-11-04', H), sessao('2026-11-07', H)] })
    const ds = dias(d, '2026-11-02', '2026-11-08')
    expect(ds.map((x) => x.cumprido)).toEqual([null, true, false, false, false, null, null])
    const [anterior, atual] = semanas(d, 2)
    expect(anterior).toEqual({ inicio: '2026-11-02', planejadoMin: 480, feitoMs: 5 * H * 1000, diasComMeta: 4, diasCumpridos: 1 })
    // Na semana atual, só conta o dia com meta que já chegou (ter 10); qua 11 ainda não.
    expect(atual).toMatchObject({ inicio: '2026-11-09', planejadoMin: 240, diasComMeta: 1, diasCumpridos: 0 })
  })

  it('níveis do mapa de calor', () => {
    expect([0, 30_000, 30 * 60_000, 90 * 60_000, 150 * 60_000, 4 * H * 1000].map(nivel)).toEqual([0, 0, 1, 2, 3, 4])
  })

  it('o resumo do vault traz os simulados corrigidos e a constância', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    prepararDados(repo)
    const calc = repo.materias()[0].id
    const id = repo.criarSimulado({
      materiaId: calc,
      eventoId: null,
      conteudos: '',
      duracaoMin: 60,
      criadoEm: new Date(2026, 10, 9, 15).getTime(),
      prova: { titulo: 'S', instrucoes: '', questoes: [] }
    })
    repo.atualizarSimulado(id, {
      correcao: { questoes: [], nota: 6.5, total: 10, resumo: 'Errou o sinal.', pontosFracos: ['sinal', 'concavidade'], sugestoes: [], avisos: '', corrigidaEm: 1 }
    })
    repo.criarSimulado({ materiaId: calc, eventoId: null, conteudos: '', duracaoMin: 60, criadoEm: 2, prova: { titulo: 'Sem correção', instrucoes: '', questoes: [] } })

    const md = gerarResumo({
      hoje: '2026-11-10',
      agora: new Date(2026, 10, 10, 18).getTime(),
      materias: repo.materias(),
      tarefas: repo.tarefas(),
      eventos: repo.eventos(),
      sessoes: repo.sessoes(),
      metasDia: repo.metasDia(),
      ativa: null,
      simulados: repo.simulados()
    })
    expect(md).toContain('## Simulados (correção da IA, nota estimada)\n- **seg 09/11, Cálculo:** 6,5 de 10. Errou o sinal.\n  - Pontos fracos: sinal; concavidade.')
    expect(md).not.toContain('Sem correção')
    expect(md).toContain('## Constância\nSequência de dias com a meta cumprida: 0 (recorde: 0).')
    expect(md).toContain('| Semana | Planejado | Feito | Dias cumpridos |')
    expect(md).toMatch(/\| 09\/11 a 15\/11 \| .+ \| 0 min \| 0 de 1 \|/)
  })
})
