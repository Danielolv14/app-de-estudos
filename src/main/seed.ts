// Dados iniciais: o plano de "Rotina de estudos (fim de 2026/2)" do vault, para o app já começar útil.
// Só roda quando o banco está vazio. As estimativas de tempo são um chute inicial e podem ser ajustadas na tela Plano.
import type { Repositorio } from './repositorio'
import type { TipoEvento } from '@shared/tipos'
import { SEMESTRE_PADRAO } from '@shared/padroes'

const RECEITA =
  'Releia a receita do tema (10 min), resolva sem olhar a resposta e use os últimos 15 min para conferir no gabarito e anotar os erros.'

type T = [data: string, materia: 'calc' | 'arq', titulo: string, minutos: number, detalhe?: string, feita?: boolean]
type E = [data: string, materia: 'calc' | 'arq' | null, titulo: string, tipo: TipoEvento, pontos?: number, meta?: number]

const TAREFAS: T[] = [
  ['2026-11-05', 'calc', 'Refazer a P2 sem olhar a resolução e marcar onde errou', 120, '', true],
  ['2026-11-06', 'arq', 'Revisar a aula 14 (Unid. 4, Linguagem de Montagem)', 120],
  ['2026-11-10', 'calc', '3.4 (15 ímpares entre 1 e 51) e 3.5 implícita (1, 5, 13, 25, 27, 31, 45)', 120, RECEITA],
  ['2026-11-11', 'calc', '3.9 taxas relacionadas (1, 3, 5, 7, 9, 13, 19, 21)', 120, RECEITA],
  ['2026-11-12', 'calc', '4.7 otimização (1, 3, 5, 7, 11, 13)', 120, RECEITA],
  ['2026-11-13', 'arq', 'Revisar a Unid. 4 e a aula 15 (Unid. 5)', 120],
  ['2026-11-17', 'calc', '4.1 extremos (3, 5, 15, 16, 23, 25, 27, 51, 57, 63)', 120, RECEITA],
  ['2026-11-18', 'calc', "4.4 L'Hôpital (9, 11, 15, 21, 25, 47, 75)", 120, RECEITA],
  ['2026-11-19', 'calc', '4.7 (20, 25) e refazer os erros de taxas e otimização', 120, RECEITA],
  ['2026-11-20', 'calc', '4.3 concavidade (1, 5, 9, 13, 17, 21) e 4.5 esboço (5, 11, 15, 21, 33)', 150, 'Feriado: de manhã. ' + RECEITA],
  ['2026-11-20', 'arq', 'Unid. 5: Modelos de Arquiteturas Sequenciais e Paralelas', 120, 'Feriado: à tarde.'],
  ['2026-11-24', 'calc', 'Lista do Canvas e o que sobrou de 4.3 e 4.5', 120, RECEITA],
  ['2026-11-25', 'calc', 'Simulado cronometrado e correção', 150, 'Faça como prova: sem consulta e com o tempo da AA.'],
  ['2026-11-26', 'calc', 'Anotar o que caiu na AA2 e o que errou', 20, 'Depois da atividade.'],
  ['2026-11-27', 'arq', 'Revisar a aula 16 (Unid. 5)', 120, 'Leve os erros da AA2 para a aula de dúvidas de Cálculo.'],
  ['2026-12-01', 'calc', 'Refazer os erros da AA2 e o tema mais fraco', 120, RECEITA],
  ['2026-12-02', 'calc', 'Segundo simulado e reler as receitas', 150, 'Se Arquitetura estiver pior que Cálculo, troque este dia por Arquitetura.'],
  ['2026-12-03', 'arq', 'Revisão de Arquitetura para a Prova 3', 120, 'À tarde, depois da prova de Cálculo.'],
  ['2026-12-08', 'calc', 'Revisão para as reavaliações', 120, 'Dividir conforme as notas e o conteúdo de cada reavaliação.'],
  ['2026-12-09', 'arq', 'Revisão para as reavaliações', 120, 'Dividir conforme as notas e o conteúdo de cada reavaliação.'],
  ['2026-12-10', 'arq', 'Revisão para a reavaliação de Arquitetura', 120]
]

const EVENTOS: E[] = [
  ['2026-11-13', 'arq', 'Aula 15 de Arquitetura (Unid. 5)', 'aula'],
  ['2026-11-20', null, 'Feriado', 'outro'],
  ['2026-11-26', 'calc', 'Atividade avaliativa 2 de Cálculo', 'atividade', 10, 7],
  ['2026-11-27', 'calc', 'Aula de dúvidas de Cálculo', 'aula'],
  ['2026-11-27', 'arq', 'Aula 16 de Arquitetura (Unid. 5)', 'aula'],
  ['2026-12-03', 'calc', 'Prova 3 de Cálculo', 'prova', 25, 16],
  ['2026-12-04', 'arq', 'Prova 3 de Arquitetura', 'prova'],
  ['2026-12-11', 'arq', 'Reavaliação de Arquitetura', 'reavaliacao']
]

/** O que roda ao abrir o app: o plano inicial (banco vazio) e depois as atualizações de dados de cada versão. */
export function prepararDados(repo: Repositorio): void {
  semear(repo)
  atualizarDados(repo)
}

type Nova = [titulo: string, data: string | null, tipo: TipoEvento, pontos: number, nota: number | null, meta?: number]

// Notas de "Cálculo 1 (2026-2)" e "Arquitetura de Computadores (2026-2)" no vault, em 2026-11-05.
// ADA e trabalho ainda não têm nota: entram com o que o Daniel costuma tirar como meta fixa.
const NOTAS: Record<'Cálculo' | 'Arquitetura', Nova[]> = {
  Cálculo: [
    ['Prova 1 de Cálculo', null, 'prova', 25, 8],
    ['Atividade avaliativa 1 de Cálculo', null, 'atividade', 10, 5],
    ['Prova 2 de Cálculo', '2026-10-29', 'prova', 25, 13],
    ['ADA de Cálculo', null, 'atividade', 5, null, 3],
    ['Reavaliação de Cálculo', null, 'reavaliacao', 25, null]
  ],
  Arquitetura: [
    ['Prova 1 de Arquitetura', '2026-09-11', 'prova', 30, 8],
    ['Reposição da Prova 2 de Arquitetura', null, 'prova', 30, null],
    ['Trabalho de Arquitetura', null, 'atividade', 5, null, 4],
    ['ADA de Arquitetura', null, 'atividade', 5, null, 3]
  ]
}

function atualizarDados(repo: Repositorio): void {
  if ((repo.lerKv<number>('versao_dados') ?? 1) < 2) dadosV2(repo)
  if ((repo.lerKv<number>('versao_dados') ?? 1) < 3) dadosV3(repo)
}

// Conteúdo de cada avaliação, das notas "Cálculo 1 (2026-2)" e "Arquitetura de Computadores (2026-2)" do vault.
const CALCULO_AA2_P3 =
  "3.5 derivação implícita, 3.9 taxas relacionadas, 4.1 extremos, 4.3 concavidade, 4.4 L'Hôpital, 4.5 esboço de gráfico e 4.7 otimização"
const CONTEUDOS: [materia: string, titulo: string, conteudo: string][] = [
  ['Cálculo', 'Atividade avaliativa 2 de Cálculo', CALCULO_AA2_P3],
  ['Cálculo', 'Prova 3 de Cálculo', CALCULO_AA2_P3],
  ['Arquitetura', 'Prova 3 de Arquitetura', 'Unid. 4: Linguagem de Montagem. Unid. 5: Modelos de Arquiteturas Sequenciais e Paralelas'],
  [
    'Arquitetura',
    'Reposição da Prova 2 de Arquitetura',
    'Unid. 2: Lei de Amdahl e equação de performance da CPU. Unid. 3: memória (introdução, cache e memória virtual)'
  ]
]

/**
 * v1.2: o conteúdo de cada avaliação (o simulado usa), o semestre das matérias e a semana padrão
 * tirada do plano de 2026/2 (Cálculo de terça a quinta, Arquitetura na sexta, 2 h por dia).
 */
function dadosV3(repo: Repositorio): void {
  repo.banco.transacao(() => {
    const materias = repo.materias()
    for (const m of materias.filter((x) => !x.semestre)) repo.banco.executar('UPDATE materias SET semestre = ? WHERE id = ?', [SEMESTRE_PADRAO, m.id])
    const eventos = repo.eventos()
    for (const [nome, titulo, conteudo] of CONTEUDOS) {
      const materia = materias.find((m) => m.nome === nome)
      const e = eventos.find((x) => x.materiaId === materia?.id && x.titulo === titulo && !x.conteudo)
      if (e) repo.salvarEvento({ ...e, conteudo })
    }
    const config = repo.config()
    const calc = materias.find((m) => m.nome === 'Cálculo')
    const arq = materias.find((m) => m.nome === 'Arquitetura')
    if (config.semanaPadrao.length === 0 && calc && arq) {
      repo.salvarConfig({
        ...config,
        semanaPadrao: [
          { dia: 2, materiaId: calc.id, minutos: 120 },
          { dia: 3, materiaId: calc.id, minutos: 120 },
          { dia: 4, materiaId: calc.id, minutos: 120 },
          { dia: 5, materiaId: arq.id, minutos: 120 }
        ]
      })
    }
    repo.gravarKv('versao_dados', 3)
  })
}

/** v1.1: as notas que já saíram, e as metas das provas passam a ser calculadas pelo app. */
function dadosV2(repo: Repositorio): void {
  repo.banco.transacao(() => {
    const eventos = repo.eventos()
    for (const nome of ['Cálculo', 'Arquitetura'] as const) {
      const materia = repo.materias().find((m) => m.nome === nome)
      if (!materia) continue
      const daMateria = eventos.filter((e) => e.materiaId === materia.id)
      if (daMateria.some((e) => e.nota !== null)) continue // já lançou notas à mão
      for (const [titulo, data, tipo, pontos, nota, meta] of NOTAS[nome]) {
        if (daMateria.some((e) => e.titulo === titulo)) continue
        repo.salvarEvento({ materiaId: materia.id, data, titulo, tipo, pontos, nota, meta: meta ?? null })
      }
      for (const e of daMateria) {
        // As metas do plano antigo (7 na AA2, 16 na P3) viram automáticas.
        const metaDoSeed = (e.titulo === 'Atividade avaliativa 2 de Cálculo' && e.meta === 7) || (e.titulo === 'Prova 3 de Cálculo' && e.meta === 16)
        // Em Arquitetura, a P3 e a reavaliação valem 30.
        const semPontos = nome === 'Arquitetura' && e.pontos === null && (e.tipo === 'prova' || e.tipo === 'reavaliacao')
        if (metaDoSeed || semPontos) repo.salvarEvento({ ...e, meta: metaDoSeed ? null : e.meta, pontos: semPontos ? 30 : e.pontos })
      }
    }
    repo.gravarKv('versao_dados', 2)
  })
}

export function semear(repo: Repositorio): void {
  if (!repo.vazio()) return
  repo.banco.transacao(() => {
    const ids = {
      calc: repo.salvarMateria({ nome: 'Cálculo', cor: '#7FA8FF' }),
      arq: repo.salvarMateria({ nome: 'Arquitetura', cor: '#5FD3A2' })
    }
    for (const [data, m, titulo, minutos, detalhe = '', feita = false] of TAREFAS) {
      repo.salvarTarefa({ materiaId: ids[m], data, titulo, minutos, detalhe, feita })
    }
    for (const [data, m, titulo, tipo, pontos, meta] of EVENTOS) {
      repo.salvarEvento({
        materiaId: m ? ids[m] : null,
        data,
        titulo,
        tipo,
        pontos: pontos ?? null,
        meta: meta ?? null,
        nota: null
      })
    }
  })
}
