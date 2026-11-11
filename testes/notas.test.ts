import { describe, expect, it } from 'vitest'
import { formatarNota, metaDe, metasAutomaticas, notasDaMateria } from '@shared/notas'
import type { Evento, TipoEvento } from '@shared/tipos'

let proximoId = 1
const av = (titulo: string, tipo: TipoEvento, pontos: number | null, nota: number | null = null, meta: number | null = null, data: string | null = null): Evento => ({
  id: proximoId++,
  materiaId: 1,
  data,
  conteudo: "",
  entregue: false,
  titulo,
  tipo,
  pontos,
  meta,
  nota
})

// As notas de Cálculo em 2026-11-05 (nota "Cálculo 1 (2026-2)" do vault).
const calculo = () => {
  proximoId = 1
  return [
    av('P1', 'prova', 25, 8),
    av('AA1', 'atividade', 10, 5),
    av('P2', 'prova', 25, 13, null, '2026-10-29'),
    av('ADA', 'atividade', 5, null, 3),
    av('AA2', 'atividade', 10, null, null, '2026-11-26'),
    av('P3', 'prova', 25, null, null, '2026-12-03'),
    av('Reavaliação', 'reavaliacao', 25)
  ]
}

const porTitulo = (eventos: Evento[], titulo: string) => eventos.find((e) => e.titulo === titulo)!

describe('calculadora de nota', () => {
  it('Cálculo: com a reavaliação no lugar da P1, precisa de 65% no que falta (a mesma conta do vault)', () => {
    const ev = calculo()
    const n = notasDaMateria(ev, 1)
    expect(n.total).toBe(100)
    expect(n.trocada?.titulo).toBe('P1')
    expect(n.obtido).toBe(18) // 8 + 5 + 13, sem o 8 da P1
    expect(n.previsto).toBe(3) // ADA
    expect(n.emJogo).toBe(60) // AA2 + P3 + reavaliação
    expect(n.faltam).toBe(39)
    expect(n.fracao).toBeCloseTo(0.65)
    expect(n.situacao).toBe('possivel')
    expect(n.metas.get(porTitulo(ev, 'AA2').id)).toBe(6.5)
    expect(n.metas.get(porTitulo(ev, 'P3').id)).toBe(16.3)
    expect(n.metas.get(porTitulo(ev, 'Reavaliação').id)).toBe(16.3)
    expect(n.metas.has(porTitulo(ev, 'ADA').id)).toBe(false) // meta fixa
    // Ordem: as já feitas sem data primeiro, depois por data, e as pendentes sem data no fim.
    expect(n.avaliacoes.map((e) => e.titulo)).toEqual(['P1', 'AA1', 'P2', 'AA2', 'P3', 'ADA', 'Reavaliação'])
  })

  it('lançar a nota da AA2 recalcula a meta da P3', () => {
    const ev = calculo().map((e) => (e.titulo === 'AA2' ? { ...e, nota: 8 } : e))
    const n = notasDaMateria(ev, 1)
    expect(n.faltam).toBe(31) // 60 - (18 + 8) - 3
    expect(n.emJogo).toBe(50)
    expect(n.metas.get(porTitulo(ev, 'P3').id)).toBe(15.5)
  })

  it('Arquitetura: P2 de reposição, P3 e reavaliação de 30, trabalho e ADA com meta fixa', () => {
    proximoId = 1
    const ev = [
      av('P1', 'prova', 30, 8, null, '2026-09-11'),
      av('Reposição da P2', 'prova', 30),
      av('P3', 'prova', 30, null, null, '2026-12-04'),
      av('Trabalho', 'atividade', 5, null, 4),
      av('ADA', 'atividade', 5, null, 3),
      av('Reavaliação', 'reavaliacao', 30, null, null, '2026-12-11')
    ]
    const n = notasDaMateria(ev, 1)
    expect(n.trocada?.titulo).toBe('P1')
    expect(n.faltam).toBe(53) // o "cenário bom" da nota do vault: 53 de 90
    expect(n.emJogo).toBe(90)
    expect(n.metas.get(porTitulo(ev, 'P3').id)).toBe(17.7)
  })

  it('não usa a reavaliação quando trocar a menor prova não ajuda', () => {
    proximoId = 1
    const ev = [
      av('P1', 'prova', 25, 20),
      av('P2', 'prova', 25, 22),
      av('AA1', 'atividade', 10, 10),
      av('P3', 'prova', 25),
      av('AA2', 'atividade', 15),
      av('Reavaliação', 'reavaliacao', null)
    ]
    const n = notasDaMateria(ev, 1)
    expect(n.trocada).toBeNull()
    expect(n.faltam).toBe(8)
    expect(n.metas.has(porTitulo(ev, 'Reavaliação').id)).toBe(false)
    expect(n.metas.get(porTitulo(ev, 'P3').id)).toBe(5)
  })

  it('reconhece aprovado, folga com metas fixas e quando não dá mais', () => {
    proximoId = 1
    expect(notasDaMateria([av('P1', 'prova', 50, 35), av('P2', 'prova', 50, 30)], 1).situacao).toBe('garantido')
    proximoId = 1
    const folga = notasDaMateria([av('P1', 'prova', 50, 35), av('P2', 'prova', 40, null, 30), av('T', 'atividade', 10)], 1)
    expect(folga.situacao).toBe('folga')
    expect(folga.metas.get(3)).toBe(0)
    proximoId = 1
    const fora = notasDaMateria([av('P1', 'prova', 50, 5), av('P2', 'prova', 50)], 1)
    expect(fora.situacao).toBe('impossivel')
    expect(fora.metas.get(2)).toBe(50)
    proximoId = 1
    expect(notasDaMateria([av('P1', 'prova', 50, 10), av('P2', 'prova', 50, null, 20)], 1).situacao).toBe('abaixo')
    expect(notasDaMateria([], 1).situacao).toBe('sem-avaliacoes')
  })

  it('a meta que vale é a fixada à mão; sem ela, a calculada', () => {
    const ev = calculo()
    const auto = metasAutomaticas(ev, [{ id: 1, nome: 'Cálculo', cor: '#fff', arquivada: false, semestre: '2026/2', bibliografia: '', sigla: '' }])
    expect(metaDe(porTitulo(ev, 'ADA'), auto)).toEqual({ valor: 3, automatica: false })
    expect(metaDe(porTitulo(ev, 'P3'), auto)).toEqual({ valor: 16.3, automatica: true })
    expect(metaDe(porTitulo(ev, 'P1'), auto)).toBeNull() // já tem nota
  })

  it('formata com vírgula e uma casa', () => {
    expect(formatarNota(6.5)).toBe('6,5')
    expect(formatarNota(16)).toBe('16')
    expect(formatarNota(17.666)).toBe('17,7')
  })
})
