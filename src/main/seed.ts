// Dados iniciais: o plano de "Rotina de estudos (fim de 2026/2)" do vault, para o app já começar útil.
// Só roda quando o banco está vazio. As estimativas de tempo são um chute inicial e podem ser ajustadas na tela Plano.
import type { Repositorio } from './repositorio'
import type { TipoEvento } from '@shared/tipos'

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
