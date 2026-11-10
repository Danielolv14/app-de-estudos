import { describe, expect, it } from 'vitest'
import type { Materia, ProvaSimulado, Tarefa } from '@shared/tipos'
import { dataValida, RespostaInvalida, validarCorrecao, validarLeitura, validarMudancas, validarProva } from '@shared/respostas-ia'

const questao = (pontos: number, enunciado = 'Calcule.') => ({ enunciado, pontos, conteudo: 'c', resolucao: 'r', resposta: 's' })

describe('respostas da IA', () => {
  it('confere datas de verdade', () => {
    expect(dataValida('2026-11-30')).toBe('2026-11-30')
    expect(dataValida('2026-02-30')).toBeNull()
    expect(dataValida('30/11/2026')).toBeNull()
    expect(dataValida(20261130)).toBeNull()
  })

  it('prova: renumera, tira questão vazia e reparte os pontos para fechar o total', () => {
    const p = validarProva({ titulo: 'P3', questoes: [questao(2), questao(1, '  '), questao(2), questao(4)] }, 10)
    expect(p.questoes.map((q) => q.numero)).toEqual([1, 2, 3])
    expect(p.questoes.map((q) => q.pontos)).toEqual([2.5, 2.5, 5])
    expect(p.questoes.reduce((a, q) => a + q.pontos, 0)).toBeCloseTo(10)

    // Proporção que não fecha em uma casa: a última questão fecha a conta.
    const t = validarProva({ questoes: [questao(1), questao(1), questao(1)] }, 10)
    expect(t.questoes.map((q) => q.pontos)).toEqual([3.3, 3.3, 3.4])
    expect(t.titulo).toBe('Simulado')

    // Sem pontos: divide igual. Pontos certos: não mexe.
    expect(validarProva({ questoes: [questao(0), questao(0)] }, 25).questoes.map((q) => q.pontos)).toEqual([12.5, 12.5])
    expect(validarProva({ questoes: [questao(7), questao(3)] }, 10).questoes.map((q) => q.pontos)).toEqual([7, 3])

    expect(() => validarProva({ questoes: [] }, 10)).toThrow(RespostaInvalida)
    expect(() => validarProva('lixo', 10)).toThrow(RespostaInvalida)
    expect(validarProva({ questoes: Array.from({ length: 20 }, () => questao(1)) }, 20).questoes).toHaveLength(15)
  })

  const prova: ProvaSimulado = {
    titulo: 'P3',
    instrucoes: '',
    questoes: [
      { numero: 1, enunciado: 'a', pontos: 3, conteudo: '', resolucao: '', resposta: '' },
      { numero: 2, enunciado: 'b', pontos: 3.5, conteudo: '', resolucao: '', resposta: '' },
      { numero: 3, enunciado: 'c', pontos: 3.5, conteudo: '', resolucao: '', resposta: '' }
    ]
  }

  it('correção: nota entre 0 e o valor da questão, soma feita pelo app e questão faltando vira em branco', () => {
    const c = validarCorrecao(
      {
        questoes: [
          { numero: 1, nota: 5, situacao: 'certa', acertos: 'tudo', erros: '' },
          { numero: 2, nota: 1.25, situacao: 'inventada', acertos: '', erros: 'sinal' }
        ],
        nota: 99,
        resumo: 'ok',
        pontosFracos: ['a', '', 'b', 'c', 'd', 'e', 'f'],
        sugestoes: [
          { titulo: 'Refazer', detalhe: 'x', minutos: 7 },
          { titulo: 'Revisar', detalhe: 'y', minutos: 500 },
          { titulo: '', minutos: 30 },
          { titulo: 'Terceira', minutos: 62 },
          { titulo: 'Quarta', minutos: 30 }
        ]
      },
      prova,
      123
    )
    expect(c.questoes).toEqual([
      { numero: 1, nota: 3, situacao: 'certa', acertos: 'tudo', erros: '' },
      { numero: 2, nota: 1.3, situacao: 'parcial', acertos: '', erros: 'sinal' },
      { numero: 3, nota: 0, situacao: 'em-branco', acertos: '', erros: 'A IA não corrigiu esta questão.' }
    ])
    expect(c.nota).toBe(4.3)
    expect(c.total).toBe(10)
    expect(c.pontosFracos).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(c.sugestoes.map((s) => [s.titulo, s.minutos])).toEqual([
      ['Refazer', 15],
      ['Revisar', 180],
      ['Terceira', 60]
    ])
    expect(c.corrigidaEm).toBe(123)
  })

  it('plano de ensino: aula sem dia fica desmarcada, tipo desconhecido vira prova e PDF vazio é recusado', () => {
    const l = validarLeitura({
      materia: 'Cálculo II',
      avaliacoes: [
        { titulo: 'P1', tipo: 'prova', data: '2027-04-10', pontos: 30, conteudo: 'limites' },
        { titulo: 'Seminário', tipo: 'apresentacao', data: '10/05/2027', pontos: 0, conteudo: '' },
        { titulo: '', tipo: 'prova' }
      ],
      aulas: [
        { data: '2027-03-01', conteudo: 'Apresentação' },
        { data: null, conteudo: 'Revisão' },
        { data: '2027-03-03', conteudo: '' }
      ],
      bibliografia: ['STEWART', ''],
      observacoes: 'datas a confirmar'
    })
    expect(l.avaliacoes).toEqual([
      { incluir: true, titulo: 'P1', tipo: 'prova', data: '2027-04-10', pontos: 30, conteudo: 'limites' },
      { incluir: true, titulo: 'Seminário', tipo: 'prova', data: null, pontos: null, conteudo: '' }
    ])
    expect(l.aulas).toEqual([
      { incluir: true, data: '2027-03-01', conteudo: 'Apresentação' },
      { incluir: false, data: null, conteudo: 'Revisão' }
    ])
    expect(l.bibliografia).toEqual(['STEWART'])
    expect(validarLeitura({ aulas: [{ data: null, conteudo: 'x' }] }).materia).toBe('Nova matéria')
    expect(() => validarLeitura({ materia: 'X', avaliacoes: [], aulas: [] })).toThrow(RespostaInvalida)
  })

  it('replanejamento: só passa mudança que dá para aplicar', () => {
    const t = (id: number, data: string, feita = false): Tarefa => ({ id, materiaId: 1, data, titulo: `T${id}`, detalhe: '', minutos: 60, feita, ordem: id })
    const tarefas = [t(1, '2026-11-12'), t(2, '2026-11-13'), t(3, '2026-11-09', true), t(4, '2026-11-14'), t(5, '2026-11-15')]
    const materias: Materia[] = [
      { id: 1, nome: 'Cálculo', cor: '#fff', arquivada: false, semestre: '2026/2', bibliografia: '', sigla: '' },
      { id: 2, nome: 'Velha', cor: '#fff', arquivada: true, semestre: '2026/1', bibliografia: '', sigla: '' }
    ]
    const v = validarMudancas(
      {
        resumo: 'Ajustei a semana.',
        mudancas: [
          { tipo: 'mover', tarefaId: 1, data: '2026-11-16', motivo: 'espaço' },
          { tipo: 'mover', tarefaId: 1, data: '2026-11-17' }, // segunda mudança na mesma tarefa
          { tipo: 'mover', tarefaId: 2, data: '2026-11-01' }, // passado
          { tipo: 'mover', tarefaId: 2, data: '2026-11-13' }, // mesmo dia
          { tipo: 'mover', tarefaId: 3, data: '2026-11-20' }, // já feita
          { tipo: 'mover', tarefaId: 99, data: '2026-11-20' }, // não existe
          { tipo: 'ajustar', tarefaId: 2, minutos: 92, titulo: null, detalhe: null },
          { tipo: 'ajustar', tarefaId: 4, minutos: 60, titulo: 'T4', detalhe: '' }, // não muda nada
          { tipo: 'ajustar', tarefaId: 5, minutos: 5000 }, // tempo fora do limite
          { tipo: 'criar', data: '2026-11-18', materiaId: 1, titulo: 'Nova', detalhe: 'd', minutos: 45 },
          { tipo: 'criar', data: '2026-11-18', materiaId: 2, titulo: 'Arquivada', minutos: 45 },
          { tipo: 'criar', data: '2026-11-18', materiaId: null, titulo: 'Livre', minutos: 30 },
          { tipo: 'remover', tarefaId: 4 },
          { tipo: 'apagar-tudo' }
        ]
      },
      { tarefas, materias, hoje: '2026-11-10' }
    )
    expect(v.resumo).toBe('Ajustei a semana.')
    expect(v.mudancas).toEqual([
      { id: 1, motivo: 'espaço', tipo: 'mover', tarefaId: 1, data: '2026-11-16' },
      { id: 2, motivo: '', tipo: 'ajustar', tarefaId: 2, minutos: 90, titulo: null, detalhe: null },
      { id: 3, motivo: '', tipo: 'criar', data: '2026-11-18', materiaId: 1, titulo: 'Nova', detalhe: 'd', minutos: 45 },
      { id: 4, motivo: '', tipo: 'criar', data: '2026-11-18', materiaId: null, titulo: 'Livre', detalhe: '', minutos: 30 },
      { id: 5, motivo: '', tipo: 'remover', tarefaId: 4 }
    ])
    expect(v.descartadas).toBe(9)
  })
})
