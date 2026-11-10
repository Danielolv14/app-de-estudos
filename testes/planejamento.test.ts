// O que roda depois da aprovação do Daniel (replanejamento e plano de ensino), a virada de semestre e os dados da v1.3.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import type { LeituraPlano } from '@shared/tipos'
import { CORES_MATERIA, SEMESTRE_PADRAO } from '@shared/padroes'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados } from '../src/main/seed'
import { aplicarLeitura, aplicarProposta, tituloAula } from '../src/main/planejamento'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')

async function repoNovo() {
  const repo = new Repositorio(await Banco.abrir(null, wasm))
  prepararDados(repo)
  return repo
}

describe('planejamento aprovado', () => {
  it('aplica só as mudanças escolhidas, pula tarefa que sumiu e descarta a proposta', async () => {
    const repo = await repoNovo()
    const calc = repo.materias()[0]
    const [a, b, c, d] = repo.tarefas().filter((t) => !t.feita && t.data >= '2026-11-10')
    repo.salvarPropostaPlano({
      criadaEm: 1,
      resumo: '',
      descartadas: 0,
      mudancas: [
        { id: 1, motivo: '', tipo: 'mover', tarefaId: a.id, data: '2026-11-20' },
        { id: 2, motivo: '', tipo: 'ajustar', tarefaId: b.id, minutos: 150, titulo: null, detalhe: 'mais exercícios' },
        { id: 3, motivo: '', tipo: 'criar', data: '2026-11-21', materiaId: calc.id, titulo: 'Refazer 3.9', detalhe: '', minutos: 60 },
        { id: 4, motivo: '', tipo: 'remover', tarefaId: c.id },
        { id: 5, motivo: '', tipo: 'remover', tarefaId: d.id }, // não escolhida
        { id: 6, motivo: '', tipo: 'mover', tarefaId: 99999, data: '2026-11-22' } // sumiu
      ]
    })
    expect(aplicarProposta(repo, [1, 2, 3, 4, 6])).toBe(4)
    expect(repo.tarefa(a.id)?.data).toBe('2026-11-20')
    expect(repo.tarefa(b.id)).toMatchObject({ minutos: 150, titulo: b.titulo, detalhe: 'mais exercícios' })
    expect(repo.tarefas().find((t) => t.titulo === 'Refazer 3.9')).toMatchObject({ data: '2026-11-21', materiaId: calc.id, minutos: 60 })
    expect(repo.tarefa(c.id)).toBeUndefined()
    expect(repo.tarefa(d.id)).toBeDefined()
    expect(repo.propostaPlano()).toBeNull()
    expect(aplicarProposta(repo, [1])).toBe(0)
  })

  const leitura = (o: Partial<LeituraPlano>): LeituraPlano => ({
    arquivo: 'plano.pdf',
    materiaId: null,
    materia: 'Algoritmos',
    avaliacoes: [],
    aulas: [],
    bibliografia: [],
    observacoes: '',
    lidaEm: 1,
    ...o
  })

  it('plano de ensino de matéria nova: cria a matéria com uma cor livre e põe as avaliações e aulas marcadas', async () => {
    const repo = await repoNovo()
    repo.salvarLeituraPlano(leitura({}))
    const r = aplicarLeitura(
      repo,
      leitura({
        avaliacoes: [
          { incluir: true, titulo: 'P1 de Algoritmos', tipo: 'prova', data: '2027-04-10', pontos: 30, conteudo: 'listas' },
          { incluir: false, titulo: 'Seminário', tipo: 'atividade', data: null, pontos: 10, conteudo: '' }
        ],
        aulas: [
          { incluir: true, data: '2027-03-01', conteudo: 'Apresentação da disciplina' },
          { incluir: true, data: null, conteudo: 'Sem dia' },
          { incluir: false, data: '2027-03-03', conteudo: 'Desmarcada' }
        ],
        bibliografia: ['CORMEN', 'ZIVIANI']
      })
    )
    expect(r).toMatchObject({ avaliacoes: 1, aulas: 1 })
    const m = repo.materias().find((x) => x.id === r.materiaId)!
    expect(m).toMatchObject({ nome: 'Algoritmos', bibliografia: 'CORMEN\nZIVIANI', semestre: SEMESTRE_PADRAO, arquivada: false })
    expect(repo.materias().filter((x) => x.id !== m.id).map((x) => x.cor)).not.toContain(m.cor)
    expect(CORES_MATERIA).toContain(m.cor)
    const doCalendario = repo.eventos().filter((e) => e.materiaId === m.id)
    expect(doCalendario.map((e) => [e.titulo, e.tipo, e.data])).toEqual([
      ['Aula de Algoritmos: Apresentação da disciplina', 'aula', '2027-03-01'],
      ['P1 de Algoritmos', 'prova', '2027-04-10']
    ])
    expect(repo.leituraPlano()).toBeNull()
  })

  it('plano de ensino de matéria que já existe: atualiza a avaliação de mesmo nome e não duplica aula', async () => {
    const repo = await repoNovo()
    const calc = repo.materias().find((m) => m.nome === 'Cálculo')!
    const p3 = repo.eventos().find((e) => e.titulo === 'Prova 3 de Cálculo')!
    const total = repo.eventos().length
    const l = leitura({
      materiaId: calc.id,
      materia: 'Cálculo I',
      avaliacoes: [{ incluir: true, titulo: 'prova 3 de cálculo', tipo: 'prova', data: '2026-12-04', pontos: 25, conteudo: 'Cap. 4' }],
      aulas: [{ incluir: true, data: '2026-11-11', conteudo: 'Regra de L’Hôpital' }]
    })
    aplicarLeitura(repo, l)
    aplicarLeitura(repo, l)
    expect(repo.eventos()).toHaveLength(total + 1)
    expect(repo.eventos().find((e) => e.id === p3.id)).toMatchObject({ data: '2026-12-04', conteudo: 'Cap. 4', meta: p3.meta, nota: p3.nota })
    expect(repo.materias().find((m) => m.id === calc.id)?.nome).toBe('Cálculo')
    expect(tituloAula('Cálculo', 'a'.repeat(80))).toBe(`Aula de Cálculo: ${'a'.repeat(59)}…`)
  })
})

describe('semestre e dados da v1.3', () => {
  it('prepara os dados: semestre, o que cai em cada prova e a semana padrão, uma vez só', async () => {
    const repo = await repoNovo()
    expect(repo.semestre()).toBe(SEMESTRE_PADRAO)
    expect(repo.materias().every((m) => m.semestre === SEMESTRE_PADRAO && !m.arquivada)).toBe(true)
    expect(repo.eventos().find((e) => e.titulo === 'Prova 3 de Arquitetura')?.conteudo).toContain('Unid. 4')
    expect(repo.config().semanaPadrao.map((b) => [b.dia, b.minutos])).toEqual([
      [2, 120],
      [3, 120],
      [4, 120],
      [5, 120]
    ])
    // Rodar de novo não mexe no que o Daniel mudou.
    repo.salvarConfig({ ...repo.config(), semanaPadrao: [] })
    prepararDados(repo)
    expect(repo.config().semanaPadrao).toEqual([])
  })

  it('vira o semestre: arquiva as matérias, apaga as pendentes se pedir e guarda o histórico', async () => {
    const repo = await repoNovo()
    const calc = repo.materias()[0]
    const s = repo.abrirSessao({ tarefaId: null, materiaId: calc.id, dia: '2026-11-10', inicio: 1 })
    repo.fecharSessao(s, { fim: 2, estudoSeg: 600, pausaSeg: 0, antesDaMeta: false })
    repo.salvarPropostaPlano({ criadaEm: 1, resumo: '', mudancas: [], descartadas: 0 })
    const feitas = repo.tarefas().filter((t) => t.feita).length
    const pendentes = repo.tarefas().filter((t) => !t.feita).length

    expect(repo.virarSemestre('2027/1', true)).toEqual({ arquivadas: 2, apagadas: pendentes })
    expect(repo.semestre()).toBe('2027/1')
    expect(repo.materiasAtivas()).toEqual([])
    expect(repo.materias().every((m) => m.arquivada)).toBe(true)
    expect(repo.tarefas()).toHaveLength(feitas)
    expect(repo.sessoes()).toHaveLength(1)
    expect(repo.config().semanaPadrao).toEqual([])
    expect(repo.propostaPlano()).toBeNull()

    const nova = repo.salvarMateria({ nome: 'Cálculo 2', cor: '#fff' })
    expect(repo.materiasAtivas().map((m) => [m.id, m.semestre])).toEqual([[nova, '2027/1']])
    repo.arquivarMateria(calc.id, false)
    expect(repo.materiasAtivas()).toHaveLength(2)
  })

  it('vira o semestre sem apagar as pendentes', async () => {
    const repo = await repoNovo()
    const total = repo.tarefas().length
    expect(repo.virarSemestre('2027/1', false)).toEqual({ arquivadas: 2, apagadas: 0 })
    expect(repo.tarefas()).toHaveLength(total)
  })
})
