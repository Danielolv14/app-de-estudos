import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { foiEntregue } from '../src/main/canvas'
import { Repositorio } from '../src/main/repositorio'
import { compararCanvas } from '../src/shared/canvas'
import { proximasAvaliacoes } from '../src/shared/regras'
import type { Evento, ItemCanvas, Materia } from '../src/shared/tipos'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')

const item = (o: Partial<ItemCanvas> & Pick<ItemCanvas, 'chave' | 'titulo'>): ItemCanvas => ({
  cursoId: 1,
  tipo: 'atividade',
  data: '2026-11-20',
  pontos: 2,
  nota: null,
  conteudo: '',
  entregue: false,
  ...o
})

const calculo = { id: 10, nome: 'Cálculo', arquivada: false } as Materia
const evento = (o: Partial<Evento> & Pick<Evento, 'id' | 'titulo'>): Evento => ({
  materiaId: 10,
  data: '2026-11-20',
  tipo: 'atividade',
  pontos: 2,
  meta: null,
  nota: null,
  conteudo: '',
  entregue: false,
  ...o
})

describe('atividades já entregues no Canvas', () => {
  it('reconhece a entrega pelo estado, pela data de envio ou pela dispensa', () => {
    expect(foiEntregue(null)).toBe(false)
    expect(foiEntregue({ workflow_state: 'unsubmitted' })).toBe(false)
    expect(foiEntregue({ workflow_state: 'submitted' })).toBe(true)
    expect(foiEntregue({ workflow_state: 'pending_review' })).toBe(true)
    expect(foiEntregue({ workflow_state: 'graded', score: 2 })).toBe(true)
    expect(foiEntregue({ workflow_state: 'unsubmitted', submitted_at: '2026-11-09T22:10:00Z' })).toBe(true)
    expect(foiEntregue({ workflow_state: 'unsubmitted', excused: true })).toBe(true)
  })

  it('não leva para a revisão o que já foi entregue e marca o que já está no calendário', () => {
    const r = compararCanvas(
      {
        cursos: [{ id: 1, nome: 'CÁLCULO I', codigo: 'CALC1' }],
        itens: [
          item({ chave: 'tarefa:1', titulo: 'Lista 6', entregue: true }),
          item({ chave: 'tarefa:2', titulo: 'Lista 7' }),
          item({ chave: 'tarefa:3', titulo: 'Lista 5', entregue: true })
        ]
      },
      { materias: [calculo], eventos: [evento({ id: 50, titulo: 'Lista 5' })], vinculos: { 'curso:1': 10, 'tarefa:3': 50 } }
    )
    expect(r.itens.map((i) => i.chave)).toEqual(['tarefa:2'])
    expect(r.mudancas).toEqual([{ eventoId: 50, titulo: 'Lista 5', entregue: true }])
  })

  it('a entregue sai das próximas avaliações (avisos de cima, trava e resumo)', () => {
    const eventos = [evento({ id: 1, titulo: 'Lista 5', entregue: true }), evento({ id: 2, titulo: 'Lista 7', data: '2026-11-25' })]
    expect(proximasAvaliacoes(eventos, '2026-11-10').map((e) => e.id)).toEqual([2])
  })

  it('guarda a marca no banco', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    const id = repo.salvarEvento({ materiaId: null, data: '2026-11-20', titulo: 'Lista 5', tipo: 'atividade', pontos: 2, meta: null, nota: null })
    expect(repo.eventos().find((e) => e.id === id)?.entregue).toBe(false)
    const e = repo.eventos().find((x) => x.id === id)!
    repo.salvarEvento({ ...e, entregue: true })
    expect(repo.eventos().find((x) => x.id === id)?.entregue).toBe(true)
    // Salvar pela tela (sem o campo) não apaga a marca.
    const { entregue: _, ...semMarca } = repo.eventos().find((x) => x.id === id)!
    repo.salvarEvento({ ...semMarca, titulo: 'Lista 5 de Cálculo' })
    expect(repo.eventos().find((x) => x.id === id)).toMatchObject({ titulo: 'Lista 5 de Cálculo', entregue: true })
  })
})
